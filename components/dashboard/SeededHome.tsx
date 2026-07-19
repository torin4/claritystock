'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/ui.store'
import UploadModal from '@/components/modals/UploadModal'

interface Props {
  userId: string
  myPhotos: number
  /** Photos of theirs with no `neighborhood` — the primary discoverability gap. */
  missingLocation: number
  /** Photos of theirs not in any collection. */
  uncollected: number
  greetingName?: string
}

const C = {
  t1: 'var(--text-1, #e9ece9)',
  t2: 'var(--text-2, #9aa49e)',
  t3: 'var(--text-3, #69736e)',
  accent: 'var(--accent, #5fdf9a)',
  border: 'var(--border, #252b28)',
  mono: 'var(--font-mono, ui-monospace, Menlo, monospace)',
  card: 'var(--surface-2, #141816)',
}

/**
 * Seeded state: photos uploaded, no uses yet. Rather than a wall of zeros, coach
 * discoverability — the path to a first use — and set the expectation that
 * impact shows up as teammates start pulling their work.
 */
export default function SeededHome({ userId, myPhotos, missingLocation, uncollected, greetingName }: Props) {
  const router = useRouter()
  const { openUpload } = useUIStore()
  const firstName = greetingName?.trim().split(/\s+/)[0]

  const items = [
    { label: `Uploaded ${myPhotos} ${myPhotos === 1 ? 'photo' : 'photos'}`, done: true },
    { label: 'Auto-tagged & organized', done: true },
    {
      label: missingLocation > 0 ? `Add locations to ${missingLocation} ${missingLocation === 1 ? 'photo' : 'photos'}` : 'Locations added',
      done: missingLocation === 0,
      action: missingLocation > 0 ? { href: '/my-photos', text: 'add →' } : undefined,
    },
    {
      label: uncollected > 0 ? `Group ${uncollected} ${uncollected === 1 ? 'photo' : 'photos'} into a collection` : 'Grouped into collections',
      done: uncollected === 0,
      action: uncollected > 0 ? { href: '/my-photos', text: 'organize →' } : undefined,
    },
  ]
  const doneCount = items.filter((i) => i.done).length

  return (
    <div style={{ minHeight: '100vh', padding: '20px 22px 40px' }}>
      {/* Greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em' }}>Welcome back{firstName ? `, ${firstName}` : ''}</div>
          <div style={{ fontFamily: C.mono, fontSize: 11.5, color: C.t3, marginTop: 4 }}>{myPhotos} in — now let’s get them seen</div>
        </div>
        <button type="button" onClick={openUpload} className="btn btn-primary btn-sm">+ Add more photos</button>
      </div>

      {/* Encouraging headline */}
      <div style={{ margin: '16px 0 4px', padding: '18px 20px', border: `1px solid ${C.border}`, borderRadius: 12, background: 'linear-gradient(120deg, rgba(16,34,26,0.6) 0%, transparent 60%)' }}>
        <div style={{ fontSize: 'clamp(19px, 2.4vw, 24px)', fontWeight: 700, letterSpacing: '-.01em' } as React.CSSProperties}>
          Your <span style={{ color: C.accent, fontVariantNumeric: 'tabular-nums' }}>{myPhotos}</span> {myPhotos === 1 ? 'photo is' : 'photos are'} live in the library.
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.accent, marginTop: 6 }}>
          Uses show up here as teammates start pulling your work — usually within a week.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 14 }}>
        {/* Get discovered checklist */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 15px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Get your photos pulled into projects</span>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t3 }}>{doneCount} of {items.length} done</span>
          </div>
          <div style={{ padding: '4px 15px 10px' }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 12.5, color: it.done ? C.t1 : C.t2 }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.done ? C.accent : 'transparent', border: it.done ? `1px solid ${C.accent}` : `1.5px solid ${C.border}` }}>
                  {it.done && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M2.6 7.4l3 3 5.8-6.8" stroke="#062012" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span>{it.label}</span>
                {it.action && <Link href={it.action.href} style={{ marginLeft: 'auto', fontFamily: C.mono, fontSize: 11, color: C.accent, textDecoration: 'none' }}>{it.action.text}</Link>}
              </div>
            ))}
          </div>
        </div>

        {/* Impact pending */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.card }}>
          <div style={{ padding: '13px 15px', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, fontWeight: 600 }}>Who’s using your photos</div>
          <div style={{ textAlign: 'center', padding: '26px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: C.accent }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 17l5-5 4 4 8-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 8h5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ fontSize: 13, color: C.t2, marginTop: 8 }}>No uses yet — that’s normal on day one.</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.t3, marginTop: 6 }}>The more discoverable your shots, the faster this fills up.</div>
          </div>
        </div>
      </div>

      {/* Handoff */}
      <div style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: C.t2 }}>
        <span>Your {myPhotos} {myPhotos === 1 ? 'photo lives' : 'photos live'} in your library.</span>
        <Link href="/my-photos" style={{ fontFamily: C.mono, fontSize: 12, color: C.accent, textDecoration: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 13px' }}>View My Photos →</Link>
      </div>

      <UploadModal userId={userId} onSuccess={() => router.refresh()} />
    </div>
  )
}
