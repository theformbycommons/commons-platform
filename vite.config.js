import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: '/commons-platform/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        resources: resolve(import.meta.dirname, 'resources.html'),
        events: resolve(import.meta.dirname, 'events.html'),
        eventsAdmin: resolve(import.meta.dirname, 'events-admin.html'),
      },
    },
  },
})
