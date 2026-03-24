/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
  /**
   * Dev reliability: native FS watchers often break when the repo lives under
   * iCloud-synced folders (e.g. ~/Documents). Webpack then stops seeing edits,
   * so the app looks "bricked" until you restart `next dev`.
   * Polling fixes that (small CPU cost in dev only). Opt out: NEXT_DEV_POLL=0
   */
  webpack: (config, { dev }) => {
    if (!dev) return config
    const raw = process.env.NEXT_DEV_POLL
    const disabled = raw === '0' || raw === 'false'
    const pollMs = disabled ? undefined : raw != null && raw !== '' ? Number(raw) : 500
    config.watchOptions = {
      ...config.watchOptions,
      aggregateTimeout: 500,
      ignored: ['**/node_modules/**', '**/.git/**'],
      ...(pollMs && !Number.isNaN(pollMs) ? { poll: pollMs } : {}),
    }
    return config
  },
}

export default nextConfig
