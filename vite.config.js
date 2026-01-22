import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/get-users': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/send-notification': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/extract-teams': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/extract-results': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/process-lobby': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/render': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    }
  }
})
