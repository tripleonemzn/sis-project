import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Keep chunking conservative and deterministic for production safety.
            // App routes/components are left to Vite's default graph splitting.
            if (id.includes('/react-dom/') || id.includes('/react/')) return 'vendor-react'
            if (id.includes('/react-router-dom/') || id.includes('/react-router/')) return 'vendor-router'
            if (id.includes('@tanstack/react-query')) return 'vendor-query'
            if (id.includes('/axios/')) return 'vendor-axios'
            if (id.includes('/lucide-react/')) return 'vendor-icons'
            if (id.includes('/katex/') || id.includes('/react-katex/')) return 'vendor-katex'
            if (
              id.includes('/react-hook-form/') ||
              id.includes('/@hookform/resolvers/') ||
              id.includes('/zod/')
            ) return 'vendor-forms'
            if (id.includes('/date-fns/')) return 'vendor-date'
            if (id.includes('/react-hot-toast/')) return 'vendor-toast'
            if (id.includes('/sweetalert2/')) return 'vendor-swal'
            if (id.includes('/react-quill-new/')) return 'vendor-editor'
            if (id.includes('/react-easy-crop/')) return 'vendor-media'
            if (id.includes('/xlsx/')) return 'vendor-xlsx'
            return 'vendor-misc'
          }
          return undefined
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
