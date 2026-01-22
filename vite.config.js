import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://127.0.0.1:5000';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/get-users': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/send-notification': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/admin': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/extract-teams': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/extract-results': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/process-lobby': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/render': {
          target: apiUrl,
          changeOrigin: true,
        }
      }
    }
  }
})
