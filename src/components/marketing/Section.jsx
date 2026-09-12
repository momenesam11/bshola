/**
 * Structural primitives for the landing page.
 *
 * The page's visual system is a clinic register: sections are separated by
 * full-bleed hairlines rather than stacked in shadowed cards, and headings
 * carry no uppercase "eyebrow" label. A section only gets a number when the
 * content is an actual sequence (the booking steps, the signup steps) — never
 * as decoration.
 */

export function Section({ id, children, tone = 'paper', className = '', ...rest }) {
  const tones = {
    paper: 'bg-paper',
    surface: 'bg-white',
    ink: 'bg-ink text-white',
  }

  return (
    <section
      id={id}
      className={`border-t border-rule ${tones[tone]} ${className}`}
      {...rest}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-20">{children}</div>
    </section>
  )
}

/**
 * Section heading. `lead` is the one supporting sentence; anything longer
 * belongs in the section body.
 */
export function SectionHead({ title, lead, align = 'right', onDark = false, children }) {
  return (
    <header className={align === 'center' ? 'text-center mx-auto max-w-2xl' : 'max-w-3xl'}>
      <h2
        className={`text-[22px] sm:text-[28px] lg:text-[32px] font-bold leading-[1.3] text-balance ${
          onDark ? 'text-white' : 'text-ink'
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={`mt-3 text-[15px] sm:text-base leading-[1.85] max-w-[62ch] ${
            onDark ? 'text-white/70' : 'text-ink-soft'
          } ${align === 'center' ? 'mx-auto' : ''}`}
        >
          {lead}
        </p>
      )}
      {children}
    </header>
  )
}

/** A single ruled row: label on the right (RTL start), detail underneath. */
export function RuledRow({ label, children, meta }) {
  return (
    <div className="py-4 sm:py-[18px] border-b border-rule last:border-b-0">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="text-[15px] sm:text-base font-bold text-ink">{label}</h3>
        {meta && (
          <span className="text-[11px] font-medium text-ink-soft/70 tabular-nums">{meta}</span>
        )}
      </div>
      {children && (
        <p className="mt-1.5 text-[14px] sm:text-[15px] leading-[1.8] text-ink-soft max-w-[64ch]">
          {children}
        </p>
      )}
    </div>
  )
}

/** Small caption used under illustrative UI replicas, so nothing reads as real data. */
export function IllustrativeNote({ children, className = '' }) {
  return (
    <p className={`text-[11px] text-ink-soft/60 leading-relaxed ${className}`}>{children}</p>
  )
}
