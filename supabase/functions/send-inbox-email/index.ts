import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Called by a database trigger when an inbox item is created.
// No JWT: the function only ever sends the email that belongs to a fresh,
// not-yet-emailed notification, exactly once, to that notification's owner.
// notifications.for_user / from_user hold app_users ids.

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let id: string | undefined;
  try {
    id = (await req.json())?.notification_id;
  } catch { /* ignore */ }
  if (!id || !UUID.test(id)) return json({ error: "bad request" }, 400);

  // Claim the notification atomically: only fresh, un-emailed items.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", id)
    .is("emailed_at", null)
    .gte("created_at", since)
    .select("id, for_user, from_user, ticket_id, ticket_title, type, message")
    .maybeSingle();
  if (claimErr) return json({ error: "lookup failed" }, 500);
  if (!claimed) return json({ skipped: "not found, already sent or too old" });

  const fail = async (reason: string) => {
    await supabase.from("notifications").update({ email_error: reason }).eq("id", id);
    return json({ skipped: reason });
  };

  // Sending: Gmail SMTP when SMTP_USER/SMTP_PASS are set (demo), else Resend (RESEND_API_KEY + EMAIL_FROM).
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = (Deno.env.get("SMTP_PASS") ?? "").replace(/\s/g, "");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = smtpUser ? `OomniEye Digital Twin <${smtpUser}>` : Deno.env.get("EMAIL_FROM");
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  if (!from || !appUrl || !(smtpUser ? smtpPass : apiKey)) return fail("email not configured");
  // Recipient: a user (app_users id), or for SLA breach "Notify Custom Users" an extra address ("email:<addr>").
  const target = claimed.for_user ?? "";
  let to: string;
  if (target.startsWith("email:")) {
    to = target.slice(6).trim();
    if (claimed.type !== "sla_breach" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return fail("bad email recipient");
  } else {
    if (!UUID.test(target)) return fail("recipient is not a user id");
    const { data: user } = await supabase
      .from("app_users")
      .select("email, email_enabled, active")
      .eq("id", target)
      .maybeSingle();
    if (!user?.active) return fail("no active user");
    if (!user.email) return fail("no email for user");
    if (!user.email_enabled) return fail("email disabled for user");
    to = user.email;
  }

  const title = claimed.ticket_title || "a ticket";
  const link = `${appUrl}/?ticket=${encodeURIComponent(claimed.ticket_id)}`;
  let subject: string;
  let html: string;
  if (claimed.type === "sla_breach") {
    subject = `SLA breached: "${title}"`;
    html = `
  <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#0F172A;max-width:560px">
    <p style="margin:0 0 12px"><strong style="color:#DC2626">SLA breached</strong> on <strong>${esc(title)}</strong>.</p>
    ${claimed.message ? `<p style="margin:0 0 16px;color:#475569">${esc(claimed.message)}.</p>` : ""}
    <p style="margin:0 0 16px"><a href="${esc(link)}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:500">Open ticket</a></p>
    <p style="margin:0;color:#94A3B8;font-size:12px">Sent automatically by OomniEye Digital Twin.</p>
  </div>`;
  } else {
    let who = "Someone";
    if (claimed.from_user && UUID.test(claimed.from_user)) {
      const { data: sender } = await supabase.from("app_users").select("display_name").eq("id", claimed.from_user).maybeSingle();
      if (sender?.display_name) who = sender.display_name;
    }
    const verb = claimed.type === "assignment" ? "assigned you" : claimed.type === "reply" ? "replied to you on" : "mentioned you on";
    subject = `${who} ${verb} "${title}"`;
    html = `
  <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#0F172A;max-width:560px">
    <p style="margin:0 0 12px"><strong>${esc(who)}</strong> ${esc(verb)} <strong>${esc(title)}</strong>.</p>
    ${claimed.message ? `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #2563EB;background:#F1F5F9;color:#475569">${esc(claimed.message)}</blockquote>` : ""}
    <p style="margin:0 0 16px"><a href="${esc(link)}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:500">Open ticket and reply</a></p>
    <p style="margin:0;color:#94A3B8;font-size:12px">Reply on the ticket, not to this email. OomniEye Digital Twin</p>
  </div>`;
  }

  if (smtpUser) {
    const client = new SMTPClient({
      connection: { hostname: Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com", port: 465, tls: true, auth: { username: smtpUser, password: smtpPass } },
    });
    try {
      await client.send({ from, to, subject, html, content: "auto" });
    } catch (e) {
      return fail(`send failed: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    } finally {
      try { await client.close(); } catch { /* ignore */ }
    }
  } else {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) return fail(`send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  await supabase.from("notifications").update({ email_error: null }).eq("id", id);
  return json({ sent: true });
});
