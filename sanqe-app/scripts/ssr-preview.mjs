// `npm run preview:ssr` — the production build as Vercel serves it: dist/ as
// static files, vercel.json's rewrites, and api/render.js for the public
// pages. Run `npm run build` first.
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import handler from '../api/render.js'
import sitemapHandler from '../api/sitemap.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const port = Number(process.env.PORT || 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
}

// Same paths as the rewrites to /api/render in vercel.json (/sitemap.xml goes
// to /api/sitemap).
const isPublicPage = (p) => p === '/' || p === '/for-coaching' || p === '/contact' || /^\/c\/[^/]+$/.test(p)

http.createServer((req, res) => {
  const p = new URL(req.url, 'http://localhost').pathname
  if (p === '/sitemap.xml') {
    sitemapHandler(req, res)
    return
  }
  if (isPublicPage(p)) {
    req.url = `/api/render?path=${encodeURIComponent(p)}`
    handler(req, res)
    return
  }
  let file = path.join(dist, p)
  const found = file.startsWith(dist) && fs.existsSync(file) && !fs.statSync(file).isDirectory()
  if (!found && path.extname(p)) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  if (!found) file = path.join(dist, 'app.html')
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}).listen(port, () => console.log(`SSR preview on http://localhost:${port}`))
