import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Listen on the local network so the app can be opened from a phone
  // on the same Wi-Fi during development.
  server: { host: true },
})
