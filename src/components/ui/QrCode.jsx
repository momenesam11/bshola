import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// A QR code for a link, drawn on the device (no outside service sees the
// link). Dark modules on white with a quiet zone, so phone cameras read it
// from across the waiting room. Until it is drawn (or if drawing fails) the
// link shows as text, so the screen still says where to go.
export default function QrCode({ value, size = 160 }) {
  const [drawn, setDrawn] = useState({ value: null, src: null })
  // Only the image drawn for this very link counts; until then, the text.
  const src = drawn.value === value ? drawn.src : null

  useEffect(() => {
    let cancelled = false
    if (!value) return undefined
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then(url => { if (!cancelled) setDrawn({ value, src: url }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [value, size])

  if (!src) {
    return (
      <div data-testid="qr-code" style={{ width: size, minHeight: size }}
        className="flex items-center justify-center text-center text-ink text-sm font-semibold break-all p-2" dir="ltr">
        {String(value || '').replace(/^https?:\/\//, '')}
      </div>
    )
  }
  return <img data-testid="qr-code" src={src} width={size} height={size} alt={`كود QR لـ ${value}`} style={{ width: size, height: size }} />
}
