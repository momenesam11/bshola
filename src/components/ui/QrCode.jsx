// A QR code for a link, drawn on the device (no outside service sees the link).
// Waiting on the `qrcode` package: until it is installed this shows the link
// as text, so the waiting-room screen still tells patients where to go.
export default function QrCode({ value, size = 160 }) {
  const shown = String(value || '').replace(/^https?:\/\//, '')
  return (
    <div data-testid="qr-code" style={{ width: size, minHeight: size }}
      className="flex items-center justify-center text-center text-ink text-sm font-semibold break-all p-2" dir="ltr">
      {shown}
    </div>
  )
}
