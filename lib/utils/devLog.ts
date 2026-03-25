/* eslint-disable no-console */
type AnyArgs = Parameters<typeof console.error>

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export function devWarn(...args: unknown[]) {
  if (!isDev()) return
  console.warn(...(args as AnyArgs))
}

export function devError(...args: unknown[]) {
  if (!isDev()) return
  console.error(...(args as AnyArgs))
}

