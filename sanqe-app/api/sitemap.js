// /sitemap.xml (vercel.json rewrites it here): the public pages, built by
// dist-server/entry-server.js.
import { sitemap } from '../dist-server/entry-server.js'

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  try {
    const xml = await sitemap(`${proto}://${host}`)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
    res.end(xml)
  } catch (e) {
    console.error('Sitemap failed', e)
    res.statusCode = 503
    res.setHeader('Cache-Control', 'no-store')
    res.end('Sitemap unavailable')
  }
}
