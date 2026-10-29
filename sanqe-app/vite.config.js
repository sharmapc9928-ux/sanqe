import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Public question tables only — never cache per-user data.
const QUESTION_TABLES = /^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/(simplification|approximation|number_series|wrong_number_series|quadratic_equations|practice_questions)\?/

// The built app shell is written as app.html, not index.html: on Vercel a
// real index.html would be served for "/" ahead of the server-rendered home
// page (api/render.js). vercel.json sends every other screen to app.html.
const appShell = {
  name: 'sanqe-app-shell',
  apply: 'build',
  enforce: 'post', // after Vite has emitted index.html
  generateBundle(_, bundle) {
    const html = bundle['index.html']
    if (!html) return
    html.fileName = 'app.html'
    delete bundle['index.html']
    bundle['app.html'] = html
  },
}

// `vite build` builds the browser app; `vite build --ssr` the server bundle
// for the public pages (src/entry-server.jsx), which has no PWA or chunks.
export default defineConfig(({ isSsrBuild }) => (isSsrBuild ? {
  plugins: [react()],
  ssr: { noExternal: true },
  publicDir: false,
  build: { outDir: 'dist-server', emptyOutDir: true },
} : {
  plugins: [
    react(),
    appShell,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Fedge Sanqe — Bank Exam Practice',
        short_name: 'Fedge Sanqe',
        description: 'Topic-wise practice for Quant, Reasoning, English and Computer with Pomodoro focus sessions, a daily challenge and AI-marked descriptive mocks for SBI and IBPS PO, Clerk and RRB.',
        theme_color: '#f4f6fa',
        background_color: '#f4f6fa',
        display: 'standalone',
        orientation: 'portrait',
        id: '/',
        start_url: '/',
        scope: '/',
        categories: ['education'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Daily Challenge', short_name: 'Daily', url: '/daily', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Practice', short_name: 'Practice', url: '/practice', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
        ],
        screenshots: [
          { src: '/screenshots/home.png', sizes: '824x1830', type: 'image/png', form_factor: 'narrow', label: 'Home screen' },
          { src: '/screenshots/quiz.png', sizes: '824x1830', type: 'image/png', form_factor: 'narrow', label: 'Timed quiz in progress' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // Store screenshots are only for the install sheet, and the admin screen
        // only for admins; don't make every user download them.
        globIgnores: ['**/screenshots/**', '**/assets/Admin-*.js'],
        // Installed, the app opens straight from the cached shell.
        navigateFallback: '/app.html',
        // Real files must never be answered with the app shell.
        navigateFallbackDenylist: [/^\/privacy\.html$/, /^\/\.well-known\//, /^\/api\//],
        runtimeCaching: [
          {
            // Practice questions keep working offline after they've been loaded once.
            urlPattern: QUESTION_TABLES,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'sanqe-questions',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Question pictures (DI charts, diagrams) never change once uploaded.
            urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/question-images\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sanqe-question-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely, so keep them in their own long-cached files.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
        },
      },
    },
  },
}))
