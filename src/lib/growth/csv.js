// CSV import/export for leads. Accepts Arabic or English headers so a sheet
// filled by hand from Google Maps imports without renaming columns.

const HEADER_ALIASES = {
  name: ['name', 'الاسم', 'اسم العيادة', 'اسم المكان', 'العيادة'],
  phone: ['phone', 'رقم', 'الرقم', 'التليفون', 'رقم التليفون', 'موبايل', 'واتساب'],
  category: ['category', 'النوع', 'نوع النشاط', 'التخصص العام'],
  specialty: ['specialty', 'التخصص'],
  contact_person: ['contact_person', 'contact', 'المسؤول', 'اسم الدكتور', 'الدكتور'],
  city: ['city', 'المدينة', 'المحافظة'],
  area: ['area', 'المنطقة', 'الحي'],
  address: ['address', 'العنوان'],
  email: ['email', 'الإيميل', 'الايميل', 'البريد'],
  website: ['website', 'الموقع', 'الموقع الإلكتروني'],
  instagram: ['instagram', 'إنستجرام', 'انستجرام'],
  facebook: ['facebook', 'فيسبوك', 'فيس بوك'],
  google_maps_url: ['google_maps_url', 'maps', 'لينك الخريطة', 'خرائط جوجل', 'جوجل ماب'],
  google_rating: ['google_rating', 'rating', 'التقييم'],
  google_reviews_count: ['google_reviews_count', 'reviews', 'عدد التقييمات'],
  notes: ['notes', 'ملاحظات', 'ملاحظة'],
}

// Free-text category cells → our keys.
const CATEGORY_WORDS = [
  ['dental', /(أسنان|اسنان|dental|dent)/i],
  ['derma', /(جلد|تجميل|ليزر|derma|skin|cosmetic|beauty clinic)/i],
  ['salon', /(صالون|باربر|كوافير|salon|barber)/i],
  ['gym', /(جيم|لياقة|gym|fitness)/i],
  ['education', /(سنتر|تعليم|education|center)/i],
  ['clinic', /(عيادة|عياده|مركز طبي|دكتور|clinic|medical|doctor)/i],
]

export function categoryFromText(text) {
  const t = String(text ?? '').trim()
  if (!t) return 'clinic'
  if (['dental', 'derma', 'clinic', 'salon', 'gym', 'education', 'other'].includes(t)) return t
  return CATEGORY_WORDS.find(([, re]) => re.test(t))?.[0] ?? 'other'
}

// Byte-order mark: Excel needs it to open UTF-8 Arabic correctly.
const BOM = String.fromCharCode(0xfeff)

/** RFC-4180-ish parser: quoted fields, escaped quotes, CRLF, BOM, comma or semicolon. */
export function parseCsvRows(text) {
  const raw = String(text ?? '')
  const src = raw.startsWith(BOM) ? raw.slice(1) : raw
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

/** CSV text → lead objects ready for growth_import_leads(). Unknown columns are ignored. */
export function parseLeadsCsv(text) {
  const [header = [], ...body] = parseCsvRows(text)
  const columns = header.map((h) => {
    const key = h.trim().toLowerCase()
    return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.some((a) => a.toLowerCase() === key))?.[0] ?? null
  })
  if (!columns.includes('name')) {
    return { rows: [], error: 'لازم يكون فيه عمود اسمه «الاسم» أو name' }
  }
  const rows = body.map((cells) => {
    const obj = {}
    columns.forEach((col, i) => {
      if (col && cells[i] != null && cells[i].trim() !== '') obj[col] = cells[i].trim()
    })
    obj.category = categoryFromText(obj.category ?? obj.specialty)
    return obj
  })
  return { rows: rows.filter((r) => r.name), error: null }
}

const TEMPLATE_HEADERS = ['الاسم', 'التليفون', 'النوع', 'التخصص', 'الدكتور', 'المدينة', 'المنطقة', 'لينك الخريطة', 'عدد التقييمات', 'التقييم', 'إنستجرام', 'ملاحظات']

/** An empty sheet with the right headers (with BOM so Excel opens Arabic correctly). */
export function csvTemplate() {
  const example = ['عيادة د. سارة للأسنان', '01012345678', 'أسنان', 'تقويم وزراعة', 'د. سارة', 'القاهرة', 'مدينة نصر', 'https://maps.google.com/...', '45', '4.7', '', 'بيحجزوا بالتليفون بس']
  return `${BOM}${[TEMPLATE_HEADERS, example].map(toCsvLine).join('\r\n')}\r\n`
}

function toCsvLine(cells) {
  return cells.map((c) => {
    const s = String(c ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')
}

/** Export leads (e.g. for backup before a rollback). */
export function leadsToCsv(leads) {
  const cols = ['name', 'category', 'contact_person', 'phone', 'email', 'city', 'area', 'source', 'stage', 'next_follow_up_at', 'last_contacted_at', 'google_maps_url', 'notes', 'ref_code', 'created_at']
  return `${BOM}${[cols, ...leads.map((l) => cols.map((c) => l[c]))].map(toCsvLine).join('\r\n')}\r\n`
}
