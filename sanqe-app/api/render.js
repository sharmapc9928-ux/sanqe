// Vercel function behind the public pages (vercel.json rewrites "/",
// "/for-coaching" and "/contact" here). Renders them with the server bundle
// that `npm run build` writes to dist-server/.
import { render, shell } from '../dist-server/entry-server.js'

// The home screen greets by time of day; students are in India.
process.env.TZ = 'Asia/Kolkata'

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const raw = url.searchParams.get('path') || '/'
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'

  try {
    const page = await render(path, `${proto}://${host}`)
    if (!page) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    res.statusCode = page.status
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Cached at the edge for a minute, then refreshed in the background, so a
    // coaching's edits show up quickly without rendering on every visit.
    res.setHeader('Cache-Control', page.status === 200 ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=600' : 'public, max-age=0, s-maxage=10')
    res.end(page.html)
  } catch (e) {
    console.error('SSR failed for', path, e)
    // Fall back to the plain app shell; the page still works client-side.
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(shell)
  }
}
