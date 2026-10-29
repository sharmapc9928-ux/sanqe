import { useEffect, useState } from 'react'

// Question / option / solution text with optional maths written in LaTeX
// between dollar signs:  $\frac{3}{4}$  $x^2$  $\sqrt{196}$  — or $$...$$ for
// a line of its own. Text without a $ pair renders exactly as before, so the
// existing questions (plain text with ² ³ √ characters) are untouched.
// \$ is a literal dollar sign.
//
// KaTeX (~300 KB with fonts) is only downloaded once some text needs it.

const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
const ESCAPED_DOLLAR = '\u0000'

export const hasMath = (text) => typeof text === 'string' && /\$[^$]+\$/.test(text.replaceAll('\\$', ''))

let katexLib = null
let katexPromise = null
function loadKatex() {
  katexPromise ||= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
    katexLib = m.default
    return katexLib
  })
  return katexPromise
}

function renderParts(text, katex) {
  const src = text.replaceAll('\\$', ESCAPED_DOLLAR)
  const parts = []
  let last = 0
  for (const m of src.matchAll(MATH_RE)) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index) })
    const display = m[1] !== undefined
    parts.push({ html: katex.renderToString((display ? m[1] : m[2]).trim(), { displayMode: display, throwOnError: false, output: 'html' }) })
    last = m.index + m[0].length
  }
  if (last < src.length) parts.push({ text: src.slice(last) })
  return parts.map((p) => (p.text !== undefined ? { text: p.text.replaceAll(ESCAPED_DOLLAR, '$') } : p))
}

export function RichText({ text }) {
  const needsMath = hasMath(text)
  const [katex, setKatex] = useState(katexLib)
  useEffect(() => {
    if (needsMath && !katex) loadKatex().then(setKatex).catch(() => { /* raw text stays visible */ })
  }, [needsMath, katex])

  if (text === null || text === undefined) return null
  if (!needsMath) return String(text).replaceAll('\\$', '$')
  if (!katex) return text
  return renderParts(text, katex).map((p, i) => (p.html
    ? <span key={i} className="math" dangerouslySetInnerHTML={{ __html: p.html }} />
    : <span key={i}>{p.text}</span>))
}
