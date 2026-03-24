/**
 * When to show “Contact” for imbalanced library usage (env-tunable).
 * Pass from server into client props (NEXT_PUBLIC_* read at build/runtime).
 */
export type UsageAlertConfig = {
  minDownloads: number
  ratioThreshold: number
}

export function getUsageAlertConfig(): UsageAlertConfig {
  const minDownloads = Number(process.env.NEXT_PUBLIC_ADMIN_USAGE_MIN_DOWNLOADS ?? 30)
  const ratioThreshold = Number(process.env.NEXT_PUBLIC_ADMIN_USAGE_RATIO_THRESHOLD ?? 8)
  return {
    minDownloads: Number.isFinite(minDownloads) && minDownloads > 0 ? minDownloads : 30,
    ratioThreshold: Number.isFinite(ratioThreshold) && ratioThreshold > 0 ? ratioThreshold : 8,
  }
}

export function usageExceedsAlert(
  row: { downloads: number; ratio: number },
  cfg: UsageAlertConfig,
): boolean {
  return row.downloads >= cfg.minDownloads && row.ratio >= cfg.ratioThreshold
}
