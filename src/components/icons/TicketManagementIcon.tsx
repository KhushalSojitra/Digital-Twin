import { SvgIcon, type SvgIconProps } from '@mui/material'

/**
 * Ticket Management icon (outline): a ticket/receipt with a $ sign (finance),
 * a gear (maintenance) and a check badge (completion tracking).
 * Uses currentColor, so it follows the surrounding text/icon colour.
 */
const GEAR = { cx: 9, cy: 16.5, inner: 0.75, ring: 2.1, tooth: 3 }
const TEETH = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 3 + Math.PI / 6
  return {
    x1: GEAR.cx + GEAR.ring * Math.cos(a),
    y1: GEAR.cy + GEAR.ring * Math.sin(a),
    x2: GEAR.cx + GEAR.tooth * Math.cos(a),
    y2: GEAR.cy + GEAR.tooth * Math.sin(a),
  }
})

export default function TicketManagementIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round">
        {/* ticket / receipt with torn top edge and a curled corner */}
        <path d="M13.2 4.3 11.8 3.2l-1.4 1.1L9 3.2 7.6 4.3 6.2 3.2 4.8 4.3 3.5 3.2V20.5h10.7v-9.4" />
        <path d="M14.2 20.5h2.2a1.6 1.6 0 0 0 0-3.2h-2.2" />
        {/* $ = finance */}
        <path d="M8.6 6.9c-.3-.5-.9-.8-1.5-.8-.9 0-1.5.5-1.5 1.2 0 1.6 3.1.9 3.1 2.6 0 .7-.7 1.3-1.6 1.3-.7 0-1.3-.3-1.6-.9M7.1 5.2v.9M7.1 11.1v.9" />
        {/* detail lines */}
        <path d="M10.6 9.4h2.2M5.5 13.2h6.8" />
        {/* gear = maintenance */}
        <circle cx={GEAR.cx} cy={GEAR.cy} r={GEAR.ring} />
        <circle cx={GEAR.cx} cy={GEAR.cy} r={GEAR.inner} />
        {TEETH.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={1.9} />
        ))}
        {/* check badge = completion tracking */}
        <circle cx={17.6} cy={7} r={3.7} />
        <path d="m15.9 7.1 1.2 1.2 2.2-2.4" />
      </g>
    </SvgIcon>
  )
}
