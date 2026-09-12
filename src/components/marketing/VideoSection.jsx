import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HiOutlinePlay, HiOutlineVideoCamera } from 'react-icons/hi2'
import { Section, SectionHead } from './Section'

// YouTube's max-res thumbnail (1280x720) isn't guaranteed to exist for every
// video — it needs a source uploaded at least that large. `hqdefault` always
// exists, so it's the fallback swapped in via the <img>'s onError below
// rather than something we can check up front without a network call.
const youtubeThumbnail = (id, quality = 'maxresdefault') => `https://img.youtube.com/vi/${id}/${quality}.jpg`

/**
 * A reusable video section.
 *
 * Two sources are supported: `youtubeId` (an unlisted YouTube video — see
 * public/videos/README.md for why unlisted, not the file, is what we host)
 * or a locally-hosted `src` file. Exactly one should be set; `youtubeId`
 * wins if both are for some reason present.
 *
 * Loading: click-to-load either way. Nothing but the poster image is fetched
 * until the viewer presses play, so a 16:9 video can never become the page's
 * LCP or eat a mobile data plan. The player (native <video> or YouTube
 * <iframe>) only mounts after that press, which is also why the native
 * player can carry `autoPlay` safely (the play was a user gesture) — it is
 * never muted-autoplaying in the background.
 *
 * Text alternative: `steps` renders as visible, crawlable text under the video
 * and is not optional — it is what Google reads and what the (majority) of
 * sound-off viewers read. `captionsSrc` (WebVTT) only applies to the local
 * `src` path; a YouTube embed uses whatever captions are set on the video
 * itself, on YouTube.
 *
 * Missing asset: when neither `youtubeId` nor `src` is set, the section
 * renders a labelled placeholder at the correct aspect ratio naming the file
 * it expects, so the page stays honest and the remaining work is
 * self-documenting.
 */
export default function VideoSection({
  id,
  tone = 'paper',
  title,
  lead,
  youtubeId,
  src,
  poster,
  expectedSrc,
  captionsSrc,
  steps = [],
  stepsTitle,
  cta,
  children,
}) {
  const [playing, setPlaying] = useState(false)
  const [thumbFallback, setThumbFallback] = useState(false)

  const hasVideo = Boolean(youtubeId || src)
  const resolvedPoster =
    poster ?? (youtubeId ? youtubeThumbnail(youtubeId, thumbFallback ? 'hqdefault' : 'maxresdefault') : undefined)

  return (
    <Section id={id} tone={tone}>
      <SectionHead title={title} lead={lead} />

      <div className="mt-8 sm:mt-10 grid lg:grid-cols-5 gap-8 lg:gap-10 items-start">
        {/* Player */}
        <div className="lg:col-span-3">
          {/* A pending asset gets a light dashed frame, not a filled dark block:
              three navy rectangles down the page read as broken rather than
              as work in progress. */}
          <div
            className={`relative aspect-video w-full overflow-hidden rounded-2xl ${
              hasVideo ? 'border border-rule bg-ink' : 'border-2 border-dashed border-rule bg-white'
            }`}
          >
            {!hasVideo ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <HiOutlineVideoCamera className="w-8 h-8 text-ink-soft/40" aria-hidden="true" />
                <p className="text-sm font-bold text-ink-soft">الفيديو لسه مش مضاف</p>
                <p className="text-[11px] text-ink-soft/60 leading-relaxed" dir="ltr">
                  {expectedSrc}
                </p>
                <p className="text-[11px] text-ink-soft/60 leading-relaxed max-w-[30ch]">
                  الخطوات المكتوبة جانبه بتشرح نفس المحتوى.
                </p>
              </div>
            ) : playing && youtubeId ? (
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : playing ? (
              <video
                className="absolute inset-0 w-full h-full"
                src={src}
                poster={resolvedPoster}
                controls
                autoPlay
                playsInline
                preload="metadata"
              >
                {captionsSrc && (
                  <track kind="captions" src={captionsSrc} srcLang="ar" label="العربية" default />
                )}
              </video>
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="group absolute inset-0 w-full h-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                aria-label={`شغّل الفيديو: ${title}`}
              >
                {resolvedPoster && (
                  <img
                    src={resolvedPoster}
                    alt={`صورة من الفيديو: ${title}`}
                    loading="lazy"
                    decoding="async"
                    onError={() => setThumbFallback(true)}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <span className="absolute inset-0 bg-ink/25 group-hover:bg-ink/15 transition-colors" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 motion-reduce:transform-none">
                    <HiOutlinePlay className="w-7 h-7 text-ink mr-0.5" aria-hidden="true" />
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Written steps — the text alternative, and what search engines index */}
        <div className="lg:col-span-2">
          {stepsTitle && (
            <h3 className="text-[13px] font-bold text-ink-soft mb-4">{stepsTitle}</h3>
          )}
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center tabular-nums"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h4 className="text-[14.5px] font-bold text-ink leading-snug">{step.title}</h4>
                  {step.desc && (
                    <p className="mt-1 text-[13.5px] leading-[1.75] text-ink-soft max-w-[46ch]">
                      {step.desc}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {cta && (
            <div className="mt-7">
              {cta.to ? (
                <Link
                  to={cta.to}
                  className="inline-flex items-center justify-center bg-accent-500 hover:bg-accent-600 text-white text-[14px] font-bold px-6 py-3 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {cta.label}
                </Link>
              ) : (
                <a
                  href={cta.href}
                  target={cta.external ? '_blank' : undefined}
                  rel={cta.external ? 'noopener noreferrer' : undefined}
                  className="inline-flex items-center justify-center border border-ink/20 hover:border-ink text-ink text-[14px] font-bold px-6 py-3 rounded-xl transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {cta.label}
                </a>
              )}
              {cta.note && (
                <p className="mt-2.5 text-[12px] text-ink-soft/80 leading-relaxed">{cta.note}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {children}
    </Section>
  )
}
