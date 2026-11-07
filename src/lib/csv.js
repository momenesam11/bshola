// One spreadsheet cell. Quotes anything that would break the row (commas,
// quotes, line breaks), and defuses text a spreadsheet would run as a formula:
// a client named "=HYPERLINK(...)" must stay text when the clinic opens the file.
export function csvCell(value) {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows) {
  return rows.map(r => r.map(csvCell).join(',')).join('\n')
}
