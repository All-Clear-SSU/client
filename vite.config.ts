// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // '@' 경로를 src로 매핑
    },
  },
  // ✅ sockjs-client가 기대하는 global을 브라우저(globalThis)로 매핑
  define: {
    global: 'globalThis',
  },
})