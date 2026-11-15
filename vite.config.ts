import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Serves the root /api functions during `vite dev`/preview; Vercel runs them natively once deployed.
function apiDevServer(env: Record<string, string>): Plugin {
  return {
    name: 'oomnieye-api-dev-server',
    apply: 'serve',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('AUTH_') && process.env[key] === undefined) process.env[key] = value
      }
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const name = /^\/api\/([a-z-]+)$/.exec((req.url ?? '').split('?')[0])?.[1]
        const file = name ? path.join(server.config.root, 'api', `${name}.ts`) : null
        if (!name || !file || !existsSync(file)) return next()
        try {
          const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as {
            default: (req: IncomingMessage, res: ServerResponse) => Promise<void>
          }
          await mod.default(req, res)
        } catch (error) {
          server.config.logger.error(`API ${name} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ code: 'server_error', error: 'Something went wrong. Please try again.' }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // VITE_* is the existing app connection and points to the project that owns public.tickets.
  // The other variables belong to a different connected project and must not override it.
  const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY

  return {
  plugins: [react(), apiDevServer(env)],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
  },
  // maplibre-gl v6 loads its worker via `new URL('./maplibre-gl-worker.mjs', import.meta.url)`;
  // Vite's dependency pre-bundling breaks that relative path, so leave the package unbundled in dev.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    host: '0.0.0.0',
    port: 4731,
    // Let Vite select the next available port when the preview supervisor already owns 4731.
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4731,
  },
  }
})
