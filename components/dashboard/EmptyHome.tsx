'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/ui.store'
import UploadModal from '@/components/modals/UploadModal'

interface Props {
  userId: string
  /** Library-wide totals for social proof. */
  totals: { photos: number; members: number; usesThisMonth: number }
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
 * First-run onboarding (0 photos). Converts a new photographer into a
 * contributor: the upload is the hero, the reward is previewed as locked cards,
 * and "skip to Browse" stays a quiet link that never competes with uploading.
 */
export default function EmptyHome({ userId, totals, greetingName }: Props) {
  const router = useRouter()
  const { openUpload } = useUIStore()
  const firstName = greetingName?.trim().split(/\s+/)[0]

  return (
    <div style={{ minHeight: '100vh', padding: '28px 22px 60px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontFamily: C.mono, fontSize: 12, letterSpacing: '.04em', color: C.accent }}>
          Welcome to Clarity Stock{firstName ? `, ${firstName}` : ''} 👋
        </div>
        <h1 style={{ fontSize: 'clamp(23px, 3.4vw, 32px)', fontWeight: 800, letterSpacing: '-.02em', margin: '12px 0 0', lineHeight: 1.12, textWrap: 'balance' } as React.CSSProperties}>
          Your first upload makes the whole library better.
        </h1>
        <p style={{ color: C.t2, fontSize: 14, margin: '12px auto 0', maxWidth: '56ch', lineHeight: 1.55 }}>
          The library is only as powerful as what’s in it. Add your work and every teammate can find, use, and credit it —
          and you’ll see exactly where each shot lands. Your best photos shouldn’t sit on a hard drive.
        </p>

        {/* Upload — the hero action */}
        <button
          type="button"
          onClick={openUpload}
          style={{
            display: 'block', width: '100%', maxWidth: 560, margin: '26px auto 0',
            border: `1.5px dashed ${C.accent}`, borderRadius: 16, background: 'transparent',
            padding: '30px 22px 26px', cursor: 'pointer', textAlign: 'center',
          }}
        >
          <div style={{ width: 46, height: 46, margin: '0 auto', borderRadius: 12, background: 'rgba(95,223,154,0.10)', border: `1px solid ${C.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 22 }}>↑</div>
          <div style={{ fontSize: 14.5, marginTop: 14, color: C.t1 }}>
            Drag your photos here, or <span style={{ color: C.accent, textDecoration: 'underline', textUnderlineOffset: 2 }}>browse your files</span>
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.t3, marginTop: 6 }}>JPEGs or RAWs — we auto-tag &amp; organize them for you</div>
          <span
            style={{ display: 'inline-block', marginTop: 18, background: 'linear-gradient(180deg,#6ee8a2,#3cbd77)', color: '#062012', fontWeight: 700, fontSize: 14, padding: '11px 20px', borderRadius: 10 }}
          >
            Add your first photos
          </span>
        </button>

        {/* Social proof */}
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.t3, marginTop: 18 }}>
          Already <b style={{ color: C.t1 }}>{totals.photos.toLocaleString()} photos</b> from{' '}
          <b style={{ color: C.t1 }}>{totals.members} {totals.members === 1 ? 'teammate' : 'teammates'}</b>
          {totals.usesThisMonth > 0 && <> · used <b style={{ color: C.t1 }}>{totals.usesThisMonth.toLocaleString()} times</b> this month</>}
        </div>

        {/* What you'll unlock */}
        <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.t3, margin: '34px 0 12px' }}>
          What you’ll unlock once you contribute
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, textAlign: 'left' }}>
          <LockCard title="Who uses your photos" sub="See every teammate who pulls your work." />
          <LockCard title="Your top performers" sub="Watch which shots get used most." />
          <LockCard title="Your team standing" sub="Your rank among Clarity contributors." />
        </div>

        {/* Skip — quiet */}
        <div style={{ marginTop: 30, fontSize: 13, color: C.t3 }}>
          Just here to download?{' '}
          <Link href="/browse" style={{ color: C.accent, textDecoration: 'none', fontWeight: 600 }}>Browse the library →</Link>
        </div>
      </div>

      <UploadModal userId={userId} onSuccess={() => router.refresh()} />
    </div>
  )
}

function LockCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.card, padding: 14, position: 'relative' }}>
      <span style={{ position: 'absolute', top: 10, right: 10, fontFamily: C.mono, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: C.t3, border: `1px solid ${C.border}`, borderRadius: 999, padding: '2px 7px' }}>
        🔒 locked
      </span>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: C.t3, marginTop: 3 }}>{sub}</div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7, opacity: 0.5 }}>
        <div style={{ height: 8, borderRadius: 99, background: `linear-gradient(90deg, ${C.accent}, transparent)`, width: '90%' }} />
        <div style={{ height: 8, borderRadius: 99, background: `linear-gradient(90deg, ${C.accent}, transparent)`, width: '60%' }} />
        <div style={{ height: 8, borderRadius: 99, background: `linear-gradient(90deg, ${C.accent}, transparent)`, width: '40%' }} />
      </div>
    </div>
  )
}
