import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('@tanstack/react-query')) return 'vendor-query'
            if (id.includes('axios')) return 'vendor-axios'
            if (id.includes('zod')) return 'vendor-zod'
          }
          if (id.includes('/src/pages/admin/')) return 'chunk-admin'
          if (id.includes('/src/pages/teacher/')) return 'chunk-teacher'
          if (id.includes('/src/pages/student/')) return 'chunk-student'
          if (id.includes('/src/pages/examiner/')) return 'chunk-examiner'
          if (id.includes('/src/pages/common/')) return 'chunk-common'
          return 'chunk-app'
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
