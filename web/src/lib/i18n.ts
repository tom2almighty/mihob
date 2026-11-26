import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"
import enUS from "@/locales/en-US.json"
import zhCN from "@/locales/zh-CN.json"

export const SUPPORTED_LANGUAGES = ["zh-CN", "en-US"] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export function normalizeLanguage(lng?: string): SupportedLanguage {
  if (!lng) return "en-US"
  return lng.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"
}

const SITE_META_CACHE_KEY = "mihob_site_meta_cache"

function readCachedSiteTitle(): string {
  try {
    const raw = localStorage.getItem(SITE_META_CACHE_KEY)
    if (!raw) return ""
    const parsed = JSON.parse(raw) as { title?: string }
    return typeof parsed.title === "string" ? parsed.title.trim() : ""
  } catch {
    return ""
  }
}

function syncDocumentMeta(lng: string) {
  const normalized = normalizeLanguage(lng)
  document.documentElement.lang = normalized
  const customTitle = readCachedSiteTitle()
  document.title = customTitle || i18n.t("meta.pageTitle", { lng: normalized })
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "zh-CN": { translation: zhCN },
      "en-US": { translation: enUS },
    },
    fallbackLng: {
      zh: ["zh-CN"],
      "zh-Hans": ["zh-CN"],
      "zh-SG": ["zh-CN"],
      "zh-TW": ["zh-CN"],
      "zh-HK": ["zh-CN"],
      en: ["en-US"],
      default: ["en-US"],
    },
    supportedLngs: [...SUPPORTED_LANGUAGES, "zh", "en"],
    nonExplicitSupportedLngs: true,
    load: "currentOnly",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "mihob_lang",
      caches: ["localStorage"],
      convertDetectedLanguage: (lng) => normalizeLanguage(lng),
    },
    interpolation: {
      escapeValue: false,
    },
  })

syncDocumentMeta(i18n.resolvedLanguage || i18n.language)
i18n.on("languageChanged", (lng) => {
  syncDocumentMeta(lng)
})

export default i18n
