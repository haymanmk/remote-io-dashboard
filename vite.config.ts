import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/panel',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../panel',
    emptyOutDir: true,
  },
})
