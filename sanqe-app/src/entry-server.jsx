import { renderToString } from 'react-dom/server'
import { GuestApp } from './App.jsx'
import { setServerPath } from './lib/router'
import { setSsrData } from './lib/ssrData'
import { DEFAULT_DESCRIPTION, metaFor, SITE } from './lib/pageMeta'
import { CONTACT_EMAIL } from './lib/contact'
// The built app shell (`vite build` writes it first, see package.json).
import template from '../dist/app.html?raw'

// The shell as it is, for when rendering fails.
export const shell = template

// Server rendering for the public pages: the home screen, the pitch to
// coachings and the contact form. Search engines and link
// previews get the real content and title, and visitors see the page before
// the JavaScript arrives. The rest of the app stays client-only (api/render.js routes only
// these paths here).

const noop = () => {}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Safe inside a <script>: no "</script>" or "<!--" can close it early.
const serialize = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

// Title, description and status for a path; null when it isn't a public page.
async function describe(path) {
  if (path === '/') return { ...metaFor(path), nav: true }
  if (path === '/for-coaching') return { ...metaFor(path), crumb: 'For coachings' }
  if (path === '/contact') return { ...metaFor(path), nav: true, crumb: 'Contact us' }
  return null
}

// Structured data (JSON-LD) for search engines: who runs the site on every
// page, the site itself on the home page, where a page sits (breadcrumbs),

function schema(meta, origin, url) {
  const home = `${origin}/`
  const items = [{
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${home}#organization`,
    name: SITE,
    url: home,
    logo: `${origin}/pwa-512x512.png`,
    description: DEFAULT_DESCRIPTION,
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: CONTACT_EMAIL, url: `${origin}/contact`, availableLanguage: ['English', 'Hindi'] },
  }]
  if (url === home) {
    items.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: home, publisher: { '@id': `${home}#organization` } })
  }
  if (meta.crumb && meta.status !== 404) {
    items.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: home },
        { '@type': 'ListItem', position: 2, name: meta.crumb, item: url },
      ],
    })
  }
  return items.map((item) => `<script type="application/ld+json">${serialize(item)}</script>`).join('\n    ')
}

function head({ title, description, noindex }, url) {
  const t = escapeHtml(title)
  const d = escapeHtml(description)
  const u = escapeHtml(url)
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${u}" />`,
    noindex ? '<meta name="robots" content="noindex" />' : '',
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${escapeHtml(new URL('/pwa-512x512.png', url).href)}" />`,
    '<meta name="twitter:card" content="summary" />',
  ].filter(Boolean).join('\n    ')
}

// Renders `path` (already without a trailing slash) as a full HTML document.
// Returns null for paths that aren't public pages.
export async function render(path, origin) {
  const meta = await describe(path)
  if (!meta) return null

  setServerPath(path)
  setSsrData(meta.data)
  const app = renderToString(<GuestApp path={path} theme="light" setTheme={noop} />)
  setSsrData(null)

  const url = `${origin}${path}`
  // Function replacements, so a "$" in a coaching's text is taken literally.
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, () => `${head(meta, url)}
    ${schema(meta, origin, url)}`)
    .replace('<body>', () => (meta.nav ? '<body class="has-sidebar">' : '<body>'))
    .replace(
      '<div id="root"></div>',
      () => `<div id="root" data-ssr>${app}</div>${meta.data ? `<script>window.__SANQE_SSR__=${serialize(meta.data)}</script>` : ''}`,
    )
  return { status: meta.status || 200, html }
}

// /sitemap.xml: the public pages (api/sitemap.js).
export async function sitemap(origin) {
  const urls = [
    { loc: `${origin}/`, priority: '1.0' },
    { loc: `${origin}/for-coaching`, priority: '0.8' },
    { loc: `${origin}/contact`, priority: '0.5' },
    { loc: `${origin}/privacy.html`, priority: '0.2' },
  ]
  const body = urls.map((u) => [
    '  <url>',
    `    <loc>${escapeHtml(u.loc)}</loc>`,
    u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
    `    <priority>${u.priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}
