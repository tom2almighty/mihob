import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type Theme = "light" | "dark" | "system"

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
})

const STORAGE_KEY = "mihob_theme"

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system"
  })

  useEffect(() => {
    const root = document.documentElement
    const apply = (mode: Theme) => {
      root.classList.remove("light", "dark")
      if (mode === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        root.classList.add(prefersDark ? "dark" : "light")
      } else {
        root.classList.add(mode)
      }
    }

    apply(theme)

    if (theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)")
      const onChange = () => apply("system")
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    }
  }, [theme])

  const setTheme = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
