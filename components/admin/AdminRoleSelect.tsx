'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setUserRole, type ManageableRole } from '@/lib/actions/admin.actions'

const MANAGEABLE: ManageableRole[] = ['photographer', 'admin']

interface Props {
  userId: string
  currentRole: string
  /** The signed-in admin's own row — not editable (can't change your own role). */
  isSelf: boolean
}

/**
 * Inline role editor for the admin Team roster. Admins can promote/demote other
 * members; the real authorization lives in the `admin_set_user_role` RPC. Own
 * row and any unrecognized role render as read-only text.
 */
export default function AdminRoleSelect({ userId, currentRole, isSelf }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(currentRole)
  const [error, setError] = useState<string | null>(null)

  // Re-sync when the server sends a fresh value after revalidation.
  useEffect(() => setValue(currentRole), [currentRole])

  const editable = !isSelf && (MANAGEABLE as string[]).includes(currentRole)

  if (!editable) {
    return (
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)', textTransform: 'capitalize' }}>
        {currentRole}
        {isSelf && <span style={{ color: 'var(--text-3)', opacity: 0.6 }}> (you)</span>}
      </span>
    )
  }

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as ManageableRole
    if (next === value) return
    // Confirm before granting full admin access.
    if (next === 'admin' && !window.confirm('Grant full admin access to this member?')) {
      return
    }
    const prev = value
    setValue(next)
    setError(null)
    startTransition(async () => {
      try {
        await setUserRole(userId, next)
        router.refresh()
      } catch (err) {
        setValue(prev)
        setError(err instanceof Error ? err.message : 'Could not update role')
      }
    })
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
      <select
        value={value}
        onChange={onChange}
        disabled={pending}
        aria-label="Member role"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '4px 8px',
          color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          textTransform: 'capitalize',
          outline: 'none',
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {MANAGEABLE.map(r => (
          <option key={r} value={r} style={{ textTransform: 'capitalize' }}>
            {r}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ color: 'var(--danger, #e5484d)', fontSize: 11, maxWidth: 180 }}>{error}</span>
      )}
    </span>
  )
}
