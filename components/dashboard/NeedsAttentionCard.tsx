import Link from 'next/link'

export type AttentionTone = 'warn' | 'info' | 'crit'

export interface AttentionItem {
  /** Only shown when count > 0. */
  count: number
  badge: string
  label: string
  href: string
  cta: string
  tone?: AttentionTone
}

const TONE: Record<AttentionTone, { color: string; border: string; bg: string }> = {
  warn: { color: '#e0a23c', border: '#4a3a1a', bg: '#20180a' },
  info: { color: '#7fb6d6', border: '#1d3244', bg: '#0e1a24' },
  crit: { color: '#e5646b', border: '#4a1f22', bg: '#22110f' },
}

/**
 * "Needs attention" card, shared by the photographer and admin Homes. Renders at
 * most the first 3 active rows and returns null when nothing needs attention, so
 * a clean library shows no card at all.
 */
export default function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  const active = items.filter((i) => i.count > 0).slice(0, 3)
  if (active.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--border, #252b28)', borderRadius: 12, background: 'var(--surface-2, #141816)' }}>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border, #252b28)', fontSize: 12.5, fontWeight: 600 }}>
        Needs attention
      </div>
      <div style={{ padding: '4px 15px 10px' }}>
        {active.map((it, i) => {
          const tone = TONE[it.tone ?? 'warn']
          return (
            <div
              key={it.label}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < active.length - 1 ? '1px solid var(--border, #252b28)' : 'none', fontSize: 12.5 }}
            >
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 999, flex: 'none', color: tone.color, border: `1px solid ${tone.border}`, background: tone.bg }}>
                {it.badge}
              </span>
              <span style={{ color: 'var(--text-2, #9aa49e)' }}>{it.label}</span>
              <Link href={it.href} style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--accent, #5fdf9a)', textDecoration: 'none' }}>
                {it.cta}
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
