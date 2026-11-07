// Tells the page which country the visitor is in. Vercel sets this header from
// the visitor's IP. Only the two-letter code is returned, and nothing is stored.
export default function handler(req, res) {
  const country = req.headers['x-vercel-ip-country']
  res.setHeader('Cache-Control', 'private, no-store')
  res.status(200).json({ country: /^[A-Z]{2}$/.test(country ?? '') ? country : null })
}
