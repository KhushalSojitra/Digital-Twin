import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // maplibre-gl v6 loads its worker via `new URL('./maplibre-gl-worker.mjs', import.meta.url)`;
  // Vite's dependency pre-bundling breaks that relative path, so leave the package unbundled in dev.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4731,
  },
})
