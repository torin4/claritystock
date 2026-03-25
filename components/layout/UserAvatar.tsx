'use client'

import { useState } from 'react'

type Props = {
  avatarUrl: string | null | undefined
  initials: string
  size?: number
  className?: string
}

/**
 * Google profile image when `avatar_url` is set on `public.users`; initials fallback.
 * `referrerPolicy` avoids some third-party avatar hosts blocking hotlinked requests.
 */
export default function UserAvatar({ avatarUrl, initials, size = 44, className }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const url = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : null
  const showImg = Boolean(url && !imgFailed)

  return (
    <div
      className={className ?? 's-avatar'}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.28)),
        borderRadius: '50%',
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        color: 'var(--accent)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        initials
      )}
    </div>
  )
}
