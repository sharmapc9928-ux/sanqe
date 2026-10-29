// Data a public page was rendered with on the server (see entry-server.jsx).
// The server sets it before rendering; in the browser it arrives in the page
// as window.__SANQE_SSR__, so the first render shows the same content
// without a loading state. Each entry is used once: navigating back to the
// page later loads fresh data.

let data = (typeof window !== 'undefined' && window.__SANQE_SSR__) || {}

export function setSsrData(next) { data = next || {} }

export function takeSsrData(key) {
  if (!(key in data)) return undefined
  const value = data[key]
  if (typeof window !== 'undefined') delete data[key]
  return value
}
