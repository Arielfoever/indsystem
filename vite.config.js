import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || ''
const base = process.env.GITHUB_ACTIONS ? `/${repoName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        lang: 'zh-CN',
        name: 'ZeroDCE Browser Studio',
        short_name: 'ZeroDCE',
        description: 'ZeroDCE low-light enhancement in browser with ONNX Runtime Web',
        theme_color: '#1f3a5f',
        background_color: '#f4f7fb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,onnx}']
      }
    })
  ],
})
