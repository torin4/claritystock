'use client'

type BrandSize = 'sidebar' | 'mobile'

const SIZE_MAP: Record<BrandSize, { img: number; fontSize: string; letterSpacing: string }> = {
  sidebar: { img: 32, fontSize: '14px', letterSpacing: '0.06em' },
  mobile: { img: 28, fontSize: '13px', letterSpacing: '0.06em' },
}

/** Login hero: large mark above wordmark */
const STACK_BRAND = {
  img: 96,
  fontSize: '28px',
  letterSpacing: '0.08em',
  gap: 20,
}

type Props = {
  size?: BrandSize
  /** Logo above title, centered — for login card */
  layout?: 'inline' | 'stack'
  /** Desktop sidebar: “Clarity” / “Stock” on two lines next to the mark */
  stackWordmark?: boolean
  priority?: boolean
}

export default function BrandTitle({ size = 'sidebar', layout = 'inline', stackWordmark, priority }: Props) {
  if (layout === 'stack') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: STACK_BRAND.gap,
          textAlign: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset; avoids next/image aspect warnings */}
        <img
          src="/logo-mark.png"
          alt=""
          width={STACK_BRAND.img}
          height={STACK_BRAND.img}
          fetchPriority={priority ? 'high' : undefined}
          style={{ objectFit: 'contain', flexShrink: 0, width: STACK_BRAND.img, height: STACK_BRAND.img }}
        />
        <div
          style={{
            fontFamily: 'var(--font-head)',
            fontSize: STACK_BRAND.fontSize,
            fontWeight: 700,
            letterSpacing: STACK_BRAND.letterSpacing,
            textTransform: 'uppercase',
            lineHeight: 1.15,
          }}
        >
          Clarity <span style={{ color: 'var(--accent)' }}>Stock</span>
        </div>
      </div>
    )
  }

  const { img, fontSize, letterSpacing } = SIZE_MAP[size]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-mark.png"
        alt=""
        width={img}
        height={img}
        fetchPriority={priority ? 'high' : undefined}
        style={{ objectFit: 'contain', flexShrink: 0, width: img, height: img }}
      />
      {stackWordmark ? (
        <div
          style={{
            fontFamily: 'var(--font-head)',
            fontSize,
            fontWeight: 700,
            letterSpacing,
            textTransform: 'uppercase',
            lineHeight: 1.05,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 1,
          }}
        >
          <span style={{ whiteSpace: 'nowrap', color: 'var(--text)' }}>Clarity</span>
          <span style={{ whiteSpace: 'nowrap', color: 'var(--accent)' }}>Stock</span>
        </div>
      ) : (
        <div
          style={{
            fontFamily: 'var(--font-head)',
            fontSize,
            fontWeight: 700,
            letterSpacing,
            textTransform: 'uppercase',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          Clarity <span style={{ color: 'var(--accent)' }}>Stock</span>
        </div>
      )}
    </div>
  )
}
