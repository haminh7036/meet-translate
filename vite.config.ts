import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import webExtension, { readJsonFile } from 'vite-plugin-web-extension'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function generateManifest() {
  const manifest = readJsonFile('manifest.json')
  const pkg = readJsonFile('package.json')
  return {
    ...manifest,
    version: pkg.version,
  }
}

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    webExtension({
      manifest: generateManifest,
      disableAutoLaunch: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
