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
}

const DEFAULT_THEME = BUILTIN_THEME_PRESETS[0]

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedMode: "light",
  setTheme: () => {},
  activeThemeId: "default",
  activeTheme: DEFAULT_THEME,
  applyActiveTheme: () => {},
})

const STORAGE_KEY = "mihob_theme"

function resolveMode(mode: Theme): ResolvedThemeMode {
  if (mode === "dark") return "dark"
  if (mode === "light") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system"
  })
  const [resolvedMode, setResolvedMode] = useState<ResolvedThemeMode>(() => resolveMode(theme))

  const publicThemeQuery = useQuery({
    queryKey: queryKeys.publicTheme,
    queryFn: api.getPublicTheme,
    staleTime: 60_000,
    retry: 1,
  })

  const activeThemeId = publicThemeQuery.data?.active_theme_id || "default"

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

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }, [])

  const applyActiveTheme = useCallback(
    (themeId: string, customTheme?: CustomTheme | null) => {
      const nextResp: PublicThemeResponse = {
        active_theme_id: themeId,
        active_custom_theme: customTheme ?? null,
      }
      qc.setQueryData(queryKeys.publicTheme, nextResp)
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
    [qc]
  )

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedMode, setTheme, activeThemeId, activeTheme, applyActiveTheme }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
