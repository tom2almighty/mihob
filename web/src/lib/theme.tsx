import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { api, queryKeys } from "./api"
import { applyThemeToDOM } from "./theme-engine"
import { BUILTIN_THEME_PRESETS, getBuiltinThemeById } from "./theme-presets"
import type { CustomTheme, PublicThemeResponse } from "./types"

export type Theme = "light" | "dark" | "system"
export type ResolvedThemeMode = "light" | "dark"

interface ThemeContextValue {
  theme: Theme
  resolvedMode: ResolvedThemeMode
  setTheme: (theme: Theme) => void
  activeThemeId: string
  activeTheme: CustomTheme
  applyActiveTheme: (themeId: string, customTheme?: CustomTheme | null) => void
  siteTitle: string
  siteDescription: string
  updateSiteMeta: (title: string, description: string) => void
}

const DEFAULT_THEME = BUILTIN_THEME_PRESETS[0]
const SITE_META_CACHE_KEY = "mihob_site_meta_cache"

function readCachedSiteMeta(): { title: string; description: string } {
  try {
    const raw = localStorage.getItem(SITE_META_CACHE_KEY)
    if (!raw) return { title: "", description: "" }
    const parsed = JSON.parse(raw) as { title?: string; description?: string }
    return {
      title: typeof parsed.title === "string" ? parsed.title.trim() : "",
      description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    }
  } catch {
    return { title: "", description: "" }
  }
}

function writeCachedSiteMeta(title: string, description: string) {
  try {
    if (!title && !description) {
      localStorage.removeItem(SITE_META_CACHE_KEY)
      return
    }
    localStorage.setItem(SITE_META_CACHE_KEY, JSON.stringify({ title, description }))
  } catch {
    // ignore storage errors
  }
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedMode: "light",
  setTheme: () => {},
  activeThemeId: "default",
  activeTheme: DEFAULT_THEME,
  applyActiveTheme: () => {},
  siteTitle: "",
  siteDescription: "",
  updateSiteMeta: () => {},
})

const STORAGE_KEY = "mihob_theme"

function resolveMode(mode: Theme): ResolvedThemeMode {
  if (mode === "dark") return "dark"
  if (mode === "light") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system"
  })
  const [resolvedMode, setResolvedMode] = useState<ResolvedThemeMode>(() => resolveMode(theme))
  const [cachedMeta, setCachedMeta] = useState<{ title: string; description: string }>(() =>
    readCachedSiteMeta()
  )

  const publicThemeQuery = useQuery({
    queryKey: queryKeys.publicTheme,
    queryFn: api.getPublicTheme,
    staleTime: 60_000,
    retry: 1,
  })

  const activeThemeId = publicThemeQuery.data?.active_theme_id || "default"
  const siteTitle =
    publicThemeQuery.data !== undefined
      ? (publicThemeQuery.data.site_title || "").trim()
      : cachedMeta.title
  const siteDescription =
    publicThemeQuery.data !== undefined
      ? (publicThemeQuery.data.site_description || "").trim()
      : cachedMeta.description

  const activeTheme = useMemo<CustomTheme>(() => {
    const builtin = getBuiltinThemeById(activeThemeId)
    if (builtin) return builtin
    if (
      publicThemeQuery.data?.active_custom_theme &&
      publicThemeQuery.data.active_custom_theme.id === activeThemeId
    ) {
      return publicThemeQuery.data.active_custom_theme
    }
    return DEFAULT_THEME
  }, [activeThemeId, publicThemeQuery.data?.active_custom_theme])

  useEffect(() => {
    const root = document.documentElement
    const apply = (mode: Theme) => {
      const nextResolved = resolveMode(mode)
      root.classList.remove("light", "dark")
      root.classList.add(nextResolved)
      setResolvedMode(nextResolved)
    }

    apply(theme)

    if (theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)")
      const onChange = () => apply("system")
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    }
  }, [theme])

  useEffect(() => {
    if (!publicThemeQuery.data) return
    const nextTitle = (publicThemeQuery.data.site_title || "").trim()
    const nextDesc = (publicThemeQuery.data.site_description || "").trim()
    writeCachedSiteMeta(nextTitle, nextDesc)
    setCachedMeta({ title: nextTitle, description: nextDesc })

    const builtin = getBuiltinThemeById(activeThemeId)
    if (builtin?.isDefault) {
      applyThemeToDOM(null)
    } else if (builtin) {
      applyThemeToDOM(builtin)
    } else if (publicThemeQuery.data.active_custom_theme) {
      applyThemeToDOM(publicThemeQuery.data.active_custom_theme)
    } else {
      applyThemeToDOM(null)
    }
  }, [activeThemeId, publicThemeQuery.data])

  useEffect(() => {
    document.title = siteTitle || t("meta.pageTitle")
    let descEl = document.querySelector('meta[name="description"]')
    if (siteDescription) {
      if (!descEl) {
        descEl = document.createElement("meta")
        descEl.setAttribute("name", "description")
        document.head.appendChild(descEl)
      }
      descEl.setAttribute("content", siteDescription)
    } else if (descEl) {
      descEl.remove()
    }
  }, [siteTitle, siteDescription, t])

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }, [])

  const applyActiveTheme = useCallback(
    (themeId: string, customTheme?: CustomTheme | null) => {
      qc.setQueryData<PublicThemeResponse>(queryKeys.publicTheme, (prev) => ({
        active_theme_id: themeId,
        active_custom_theme: customTheme ?? null,
        site_title: prev?.site_title ?? cachedMeta.title,
        site_description: prev?.site_description ?? cachedMeta.description,
      }))
      const builtin = getBuiltinThemeById(themeId)
      if (builtin?.isDefault) {
        applyThemeToDOM(null)
      } else if (builtin) {
        applyThemeToDOM(builtin)
      } else if (customTheme) {
        applyThemeToDOM(customTheme)
      } else {
        applyThemeToDOM(null)
      }
    },
    [qc, cachedMeta.title, cachedMeta.description]
  )

  const updateSiteMeta = useCallback(
    (title: string, description: string) => {
      const cleanTitle = title.trim()
      const cleanDesc = description.trim()
      writeCachedSiteMeta(cleanTitle, cleanDesc)
      setCachedMeta({ title: cleanTitle, description: cleanDesc })
      qc.setQueryData<PublicThemeResponse>(queryKeys.publicTheme, (prev) => ({
        active_theme_id: prev?.active_theme_id ?? activeThemeId,
        active_custom_theme: prev?.active_custom_theme ?? null,
        site_title: cleanTitle,
        site_description: cleanDesc,
      }))
    },
    [qc, activeThemeId]
  )

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedMode,
        setTheme,
        activeThemeId,
        activeTheme,
        applyActiveTheme,
        siteTitle,
        siteDescription,
        updateSiteMeta,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
