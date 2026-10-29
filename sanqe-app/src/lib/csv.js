// Spreadsheet text → rows of cells. Handles what Excel / Google Sheets
// produce: comma, semicolon (Excel in some locales) or tab (copy-paste from
// a sheet) separators, "quoted, cells", "" inside quotes, line breaks inside
// a quoted cell, CRLF line endings and a UTF-8 byte-order mark.

function detectDelimiter(text) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  let best = ','
  let bestCount = 0
  for (const d of ['\t', ',', ';']) {
    const count = firstLine.split(d).length - 1
    if (count > bestCount) { best = d; bestCount = count }
  }
  return best
}

export function parseDelimited(input) {
  const text = String(input || '').replace(/^﻿/, '')
  const delim = detectDelimiter(text)
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === delim) {
      row.push(cell); cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

// A CSV file the user can open in Excel, with the header row and one example.
export function toCsv(rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return `﻿${rows.map((r) => r.map(esc).join(',')).join('\r\n')}\r\n`
}
