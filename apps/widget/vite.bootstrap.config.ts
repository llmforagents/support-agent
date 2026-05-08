import { defineConfig } from 'vite'
import path from 'path'

// Bootstrap IIFE build: vanilla JS snippet injected by the site owner.
// No Preact needed — pure DOM manipulation, no JSX.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/bootstrap.ts'),
      name: 'LLM4AgentsWidget',
      fileName: () => 'widget.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
