// Turns what Google Places returns about a clinic into evidence-backed signals.
//
// Facts quote the review text that triggered them (trimmed around the match,
// author never stored); inferences say what they were inferred from. Nothing
// here is shown to the clinic — it is for choosing what to talk about.

const PAIN_PATTERNS = [
  {
    type: 'review_pain_phone',
    re: /(محدش|مفيش حد|ماحدش|محدّش|لا أحد|لا احد|مافيش حد)[^.!؟\n]{0,20}(بيرد|يرد|بيرُد|رد)|(التليفون|التلفون|الهاتف|الرقم|التليفونات)[^.!؟\n]{0,25}(مش|لا|ما|مبي|مابي)[^.!؟\n]{0,6}(بيرد|يرد|بيتردّ|بيترد|متاح|مغلق|مقفول)|(no ?one|nobody)[^.!?\n]{0,15}answer|(never|doesn'?t|don'?t|didn'?t) (answer|pick up)|can'?t (reach|get through)/i,
  },
  {
    type: 'review_pain_wait',
    re: /(استنيت|انتظرت|فضلت مستني|قعدت مستني|الانتظار|انتظار)[^.!؟\n]{0,25}(ساعة|ساعات|ساعتين|كتير|طويل|جدا|جداً)|waited[^.!?\n]{0,20}(hour|long|forever)|long wait|waiting (time|for hours)/i,
  },
  {
    type: 'review_pain_booking',
    re: /(الحجز|حجز|الموعد|موعد|الميعاد|ميعاد|المواعيد)[^.!؟\n]{0,25}(صعب|مشكلة|مش متاح|اتلغى|اتلغي|ألغوا|لغوا|اتأجل|اتأخر|مش مظبوط|ملخبط)|hard to (book|get an appointment)|appointment[^.!?\n]{0,25}(cancel|postpon|resched|mess)/i,
  },
  {
    type: 'review_pain_disorganized',
    re: /(مش منظم|مش منظمة|غير منظم|عدم تنظيم|سوء تنظيم|سوء الإدارة|سوء الادارة|فوضى|لخبطة|عشوائية)|disorganized|unorganized|chaotic|poorly managed/i,
  },
]

/** A ~140-char window of the review around the match. */
function excerpt(text, index, length) {
  const start = Math.max(0, index - 50)
  const end = Math.min(text.length, index + length + 70)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

/**
 * @param {{text?: string, rating?: number, publishTime?: string}[]} reviews
 * @param {string} [sourceUrl] - the Google Maps link the reviews came from
 */
export function detectReviewSignals(reviews = [], sourceUrl) {
  const signals = []
  for (const { type, re } of PAIN_PATTERNS) {
    for (const review of reviews) {
      const text = review?.text ?? ''
      const m = re.exec(text)
      if (!m) continue
      signals.push({
        type,
        kind: 'fact',
        evidence: `تقييم ${review.rating ? `${review.rating}★ ` : ''}على جوجل: «${excerpt(text, m.index, m[0].length)}»`,
        ...(sourceUrl ? { source_url: sourceUrl } : {}),
        observed_at: review.publishTime || new Date().toISOString(),
      })
      break // one quote per pain type is enough
    }
  }
  return signals
}

/** Inferences from the listing itself (no review text involved). */
export function inferPlaceSignals(place = {}) {
  const signals = []
  const now = new Date().toISOString()
  const count = place.userRatingCount ?? place.google_reviews_count
  if (typeof count === 'number' && count <= 10) {
    signals.push({
      type: 'likely_new',
      kind: 'inference',
      evidence: `عدد التقييمات على جوجل ${count} بس — غالباً عيادة لسه فاتحة`,
      observed_at: now,
    })
  }
  const website = place.websiteUri ?? place.website
  if (!website) {
    signals.push({
      type: 'no_website',
      kind: 'inference',
      evidence: 'مفيش موقع إلكتروني على صفحة جوجل — غالباً الحجز بالتليفون أو الواتساب',
      observed_at: now,
    })
  }
  return signals
}
