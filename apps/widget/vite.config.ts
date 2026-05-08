import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import path from 'path'

// Embed iframe app: standard SPA build, output to dist/
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: path.resolve(__dirname, 'embed.html'),
    },
  },
})
