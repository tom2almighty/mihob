import i18n, { normalizeLanguage } from "./i18n"

export const GB = 1024 * 1024 * 1024

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatDateTime(iso: string | null | undefined, locale?: string): string {
  if (!iso) return i18n.t("common.neverExpires")
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  const lng = normalizeLanguage(locale || i18n.resolvedLanguage || i18n.language)
  return new Intl.DateTimeFormat(lng, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export function formatDateShort(iso: string | null | undefined, locale?: string): string {
  if (!iso) return i18n.t("common.permanent")
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  const lng = normalizeLanguage(locale || i18n.resolvedLanguage || i18n.language)
  return new Intl.DateTimeFormat(lng, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export function bytesToGB(bytes: number): number {
  if (!bytes || bytes <= 0) return 0
  return Math.round((bytes / GB) * 100) / 100
}

export function gbToBytes(gb: number): number {
  if (!gb || gb <= 0) return 0
  return Math.round(gb * GB)
}
