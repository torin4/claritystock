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
  const mono = Math.max(10, Math.round(size * 0.28))

  return (
    <div
      className={className ?? 'user-avatar'}
      style={{
        width: size,
        height: size,
        fontSize: mono,
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
          /* Absolute fill avoids Tailwind preflight img { height: auto } fighting % heights in flex layouts */
          style={{
            position: 'absolute',
            inset: 0,
            width: size,
            height: size,
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <span style={{ position: 'relative', zIndex: 1, lineHeight: 1 }}>{initials}</span>
      )}
    </div>
  )
}
