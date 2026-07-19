import Link from 'next/link'

/**
 * Admin-only view switch on Home: "Team" (the admin pulse) vs "My work" (the
 * admin's own photographer Home). Plain links + a URL param — no client state,
 * bookmarkable. Photographers never see this.
 */
export default function DashboardViewToggle({ active }: { active: 'team' | 'mine' }) {
  return (
    <div style={{ padding: '14px 22px 0' }}>
      <div style={{ display: 'inline-flex', border: '1px solid var(--border, #252b28)', borderRadius: 9, overflow: 'hidden', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
        <Seg href="/dashboard" label="Team" on={active === 'team'} />
        <Seg href="/dashboard?view=mine" label="My work" on={active === 'mine'} />
      </div>
    </div>
  )
}

function Seg({ href, label, on }: { href: string; label: string; on: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '7px 14px',
        textDecoration: 'none',
        color: on ? 'var(--text-1, #e9ece9)' : 'var(--text-2, #9aa49e)',
        background: on ? 'rgba(95,223,154,0.10)' : 'transparent',
      }}
    >
      {label}
    </Link>
  )
}
