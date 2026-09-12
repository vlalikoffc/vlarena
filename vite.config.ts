import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tauri expects a fixed port and a private dev server.
// `host` is set by `tauri dev` when building for a physical device (mobile).
const tauriHost = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Tauri's dev watcher handles the Rust side; keep Vite's noise out of it.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    // Bind to all interfaces so the Arena live-preview proxy can reach us.
    host: tauriHost || '0.0.0.0',
    // Accept any Host header (sandbox preview domains, LAN device testing).
    allowedHosts: true,
    hmr: tauriHost
      ? { protocol: 'ws', host: tauriHost, port: 1421 }
      : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },

  // Tauri injects these; expose them to the client bundle.
  envPrefix: ['VITE_', 'TAURI_ENV_'],

  build: {
    // Tauri v2 uses a recent webview on every platform.
    target: tauriHost ? 'es2021' : 'chrome105',
    outDir: 'dist',
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
