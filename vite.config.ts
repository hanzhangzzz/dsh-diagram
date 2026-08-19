import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const editorRoot = fileURLToPath(new URL('./src/editor/', import.meta.url))
const editorOutDir = fileURLToPath(new URL('./lib/editor/', import.meta.url))

export default defineConfig({
  root: editorRoot,
  base: './',
  publicDir: false,
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: editorOutDir,
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: false,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./src/editor/index.html', import.meta.url)),
        preview: fileURLToPath(new URL('./src/editor/preview.html', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'index' ? 'assets/editor.js' : 'assets/preview.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
