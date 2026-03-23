export default function ErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string }
}) {
  const isDomain = searchParams.reason === 'domain'
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '40px',
        width: '340px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        textAlign: 'center',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'rgba(181,64,64,0.12)',
          border: '1px solid var(--red)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--red)', fontSize: '18px',
        }}>✕</div>
        <div>
          <div style={{
            fontFamily: 'var(--font-head)',
            fontSize: '16px',
            fontWeight: 600,
            marginBottom: '8px',
          }}>
            {isDomain ? 'Access Restricted' : 'Authentication Error'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5 }}>
            {isDomain
              ? 'This app is restricted to Clarity Northwest team members. Please sign in with your @claritynw.com account.'
              : 'Something went wrong during sign in. Please try again.'}
          </div>
        </div>
        <a
          href="/login"
          style={{
            padding: '8px 20px',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: '7px',
            fontSize: '13px',
            fontWeight: 500,
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
          }}
        >
          Back to Login
        </a>
      </div>
    </div>
  )
}
