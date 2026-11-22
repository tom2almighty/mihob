import type { CustomTheme } from "./types"

export const THEME_CSS_CACHE_KEY = "mihob_theme_css_cache_v2"
export const THEME_FONT_URL_CACHE_KEY = "mihob_theme_font_url_cache"
const STYLE_EL_ID = "mihob-custom-theme"
const FONT_LINK_ID = "mihob-theme-fonts"

export const ALLOWED_THEME_VAR_KEYS = new Set<string>([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
  "scrollbar-thumb",
  "scrollbar-thumb-hover",
  "radius",
  "spacing",
  "font-sans",
  "font-serif",
  "font-mono",
  "letter-spacing",
  "tracking-normal",
  "tracking-tighter",
  "tracking-tight",
  "tracking-wide",
  "tracking-wider",
  "tracking-widest",
  "shadow-color",
  "shadow-opacity",
  "shadow-blur",
  "shadow-spread",
  "shadow-offset-x",
  "shadow-offset-y",
  "shadow-2xs",
  "shadow-xs",
  "shadow-sm",
  "shadow",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
])

const BARE_HSL_RE = /^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%(?:\s*\/\s*[\d.%]+)?$/

const NON_GOOGLE_FONTS = new Set<string>([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "roboto",
  "helvetica neue",
  "helvetica",
  "arial",
  "noto sans",
  "apple color emoji",
  "segoe ui emoji",
  "segoe ui symbol",
  "noto color emoji",
  "sfmono-regular",
  "menlo",
  "monaco",
  "consolas",
  "liberation mono",
  "courier new",
  "courier",
  "georgia",
  "cambria",
  "times new roman",
  "times",
  "twemoji country flags",
  "geist variable",
  "geist",
])

const SHADOW_TOKEN_MAP: Record<string, string> = {
  "shadow-2xs": "--theme-shadow-2xs",
  "shadow-xs": "--theme-shadow-xs",
  "shadow-sm": "--theme-shadow-sm",
  "shadow-md": "--theme-shadow-md",
  "shadow-lg": "--theme-shadow-lg",
  "shadow-xl": "--theme-shadow-xl",
  "shadow-2xl": "--theme-shadow-2xl",
}

const FONT_TOKEN_MAP: Record<string, string> = {
  "font-sans": "--theme-font-sans",
  "font-serif": "--theme-font-serif",
  "font-mono": "--theme-font-mono",
}

export function isSafeCSSVarValue(v: string): boolean {
  if (!v || v.length > 400) return false
  if (/[{};<>\\\r\n]/.test(v)) return false
  const lower = v.toLowerCase()
  for (const banned of ["url(", "@import", "expression(", "javascript:", "behavior:", "</style"]) {
    if (lower.includes(banned)) return false
  }
  return true
}

function normalizeColorValue(key: string, value: string): string {
  const trimmed = value.trim()
  if (
    !key.startsWith("font-") &&
    !key.startsWith("shadow") &&
    !key.startsWith("tracking") &&
    key !== "radius" &&
    key !== "spacing" &&
    key !== "letter-spacing" &&
    BARE_HSL_RE.test(trimmed)
  ) {
    return `hsl(${trimmed})`
  }
  return trimmed
}

export function sanitizeVarRecord(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [rawKey, rawVal] of Object.entries(input)) {
    if (typeof rawVal !== "string") continue
    const key = rawKey.trim().replace(/^--/, "")
    if (!ALLOWED_THEME_VAR_KEYS.has(key)) continue
    const val = normalizeColorValue(key, rawVal)
    if (!isSafeCSSVarValue(val)) continue
    out[key] = val
  }
  return out
}

export function prettifyThemeName(raw: string): string {
  return raw
    .trim()
    .replace(/\.json$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function slugifyThemeId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  const suffix = Math.random().toString(36).slice(2, 6)
  return base ? `${base}-${suffix}` : `theme-${suffix}`
}

export function extractThemeUrlFromInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = trimmed.match(/https?:\/\/[^\s"'<>]+/i)
  if (!match) return null
  return match[0].replace(/[),.;]+$/, "")
}

export interface ParsedThemeResult {
  suggestedName?: string
  theme: Record<string, string>
  light: Record<string, string>
  dark: Record<string, string>
}

function parseCSSDeclarations(blockBody: string): Record<string, string> {
  const out: Record<string, string> = {}
  const declRe = /--([a-zA-Z0-9-]+)\s*:\s*([^;{}]+?)\s*(?:;|$)/g
  let m: RegExpExecArray | null
  while ((m = declRe.exec(blockBody)) !== null) {
    const key = m[1].trim()
    const rawVal = m[2].trim()
    if (!ALLOWED_THEME_VAR_KEYS.has(key)) continue
    // Skip Tailwind @theme self-references like `--color-primary: var(--primary)`
    if (/^var\(--/i.test(rawVal)) continue
    const val = normalizeColorValue(key, rawVal)
    if (!isSafeCSSVarValue(val)) continue
    out[key] = val
  }
  return out
}

function extractMatchingBlocks(css: string, selectorRe: RegExp): string[] {
  const blocks: string[] = []
  let m: RegExpExecArray | null
  while ((m = selectorRe.exec(css)) !== null) {
    let idx = selectorRe.lastIndex
    let depth = 1
    const start = idx
    while (idx < css.length && depth > 0) {
      const ch = css[idx]
      if (ch === "{") depth++
      else if (ch === "}") depth--
      idx++
    }
    if (depth === 0) {
      blocks.push(css.slice(start, idx - 1))
    }
  }
  return blocks
}

export function parseThemeInput(raw: string): ParsedThemeResult {
  const cleaned = raw.trim()
  if (!cleaned) {
    throw new Error("EMPTY_INPUT")
  }

  // 1. Try JSON (tweakcn / shadcn Registry JSON or plain { light, dark })
  if (cleaned.startsWith("{")) {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      throw new Error("INVALID_JSON")
    }

    const cssVars =
      parsed.cssVars && typeof parsed.cssVars === "object"
        ? (parsed.cssVars as Record<string, unknown>)
        : parsed

    const themeObj =
      cssVars.theme && typeof cssVars.theme === "object"
        ? sanitizeVarRecord(cssVars.theme as Record<string, unknown>)
        : {}
    const lightObj =
      cssVars.light && typeof cssVars.light === "object"
        ? sanitizeVarRecord(cssVars.light as Record<string, unknown>)
        : {}
    const darkObj =
      cssVars.dark && typeof cssVars.dark === "object"
        ? sanitizeVarRecord(cssVars.dark as Record<string, unknown>)
        : {}

    if (Object.keys(lightObj).length === 0 && Object.keys(darkObj).length === 0) {
      throw new Error("NO_VALID_VARS")
    }

    const suggestedName =
      typeof parsed.name === "string" && parsed.name.trim()
        ? prettifyThemeName(parsed.name)
        : undefined

    return {
      suggestedName,
      theme: themeObj,
      light: lightObj,
      dark: darkObj,
    }
  }

  // 2. Parse CSS (Tailwind v4 / v3 :root + .dark + optional @theme)
  const noComments = cleaned.replace(/\/\*[\s\S]*?\*\//g, "")

  const rootBlocks = extractMatchingBlocks(noComments, /(?:^|[\s{;])(:root)\s*\{/g)
  const darkBlocks = extractMatchingBlocks(noComments, /(?:^|[\s{;])(\.dark(?:\s*,\s*\[data-theme=["']dark["']\])?)\s*\{/g)
  const themeBlocks = extractMatchingBlocks(noComments, /@theme(?:\s+inline)?\s*\{/g)

  const themeVars: Record<string, string> = {}
  for (const b of themeBlocks) {
    Object.assign(themeVars, parseCSSDeclarations(b))
  }

  const lightVars: Record<string, string> = {}
  for (const b of rootBlocks) {
    Object.assign(lightVars, parseCSSDeclarations(b))
  }

  const darkVars: Record<string, string> = {}
  for (const b of darkBlocks) {
    Object.assign(darkVars, parseCSSDeclarations(b))
  }

  // Fallback: user pasted bare `--primary: ...;` lines without a selector wrapper
  if (Object.keys(lightVars).length === 0 && Object.keys(darkVars).length === 0) {
    const bareVars = parseCSSDeclarations(noComments)
    if (Object.keys(bareVars).length > 0) {
      Object.assign(lightVars, bareVars)
    }
  }

  if (Object.keys(lightVars).length === 0 && Object.keys(darkVars).length === 0) {
    throw new Error("NO_VALID_VARS")
  }

  return {
    theme: themeVars,
    light: lightVars,
    dark: darkVars,
  }
}

function normalizeFontStack(raw: string): string {
  // Prefer the bundled variable Geist font whenever a theme asks for "Geist"
  return raw.replace(/(^|,)\s*["']?Geist["']?(?=\s*,|$)/gi, '$1 "Geist Variable", "Geist"')
}

function mapVarEntriesToDeclarations(vars: Record<string, string>): string[] {
  const lines: string[] = []
  for (const [key, rawVal] of Object.entries(vars)) {
    if (!ALLOWED_THEME_VAR_KEYS.has(key) || !isSafeCSSVarValue(rawVal)) continue
    if (key in FONT_TOKEN_MAP) {
      lines.push(`  ${FONT_TOKEN_MAP[key]}: ${normalizeFontStack(rawVal)};`)
      continue
    }
    if (key in SHADOW_TOKEN_MAP) {
      lines.push(`  ${SHADOW_TOKEN_MAP[key]}: ${rawVal};`)
      continue
    }
    if (key === "tracking-normal" || key === "letter-spacing") {
      lines.push(`  --theme-tracking-normal: ${rawVal};`)
      continue
    }
    if (
      key === "tracking-tighter" ||
      key === "tracking-tight" ||
      key === "tracking-wide" ||
      key === "tracking-wider" ||
      key === "tracking-widest"
    ) {
      // Computed automatically in @theme inline from --theme-tracking-normal
      continue
    }
    lines.push(`  --${key}: ${rawVal};`)
  }
  return lines
}

export function buildThemeStyleCSS(theme: CustomTheme | null): string {
  if (!theme) return ""
  const lightMerged: Record<string, string> = {
    ...(theme.theme ?? {}),
    ...(theme.light ?? {}),
  }
  const darkMerged: Record<string, string> = {
    ...(theme.theme ?? {}),
    ...(theme.dark ?? {}),
  }

  const rootLines = mapVarEntriesToDeclarations(lightMerged)
  const darkLines = mapVarEntriesToDeclarations(darkMerged)

  const parts: string[] = []
  if (rootLines.length > 0) {
    parts.push(`:root:root {\n${rootLines.join("\n")}\n}`)
  }
  if (darkLines.length > 0) {
    parts.push(`:root.dark {\n${darkLines.join("\n")}\n}`)
  }
  return parts.join("\n\n")
}

export function extractExternalFontFamilies(theme: CustomTheme | null): string[] {
  if (!theme) return []
  const fontValues = new Set<string>()
  for (const source of [theme.theme, theme.light, theme.dark]) {
    if (!source) continue
    for (const key of ["font-sans", "font-serif", "font-mono"]) {
      const val = source[key]
      if (val) fontValues.add(val)
    }
  }

  const families: string[] = []
  const seen = new Set<string>()
  for (const stack of fontValues) {
    for (const part of stack.split(",")) {
      const clean = part.trim().replace(/^["']|["']$/g, "").trim()
      if (!clean) continue
      const lower = clean.toLowerCase()
      if (NON_GOOGLE_FONTS.has(lower) || seen.has(lower)) continue
      // Only allow standard font family names
      if (!/^[a-zA-Z0-9\s-]+$/.test(clean)) continue
      seen.add(lower)
      families.push(clean)
    }
  }
  return families
}

export function buildGoogleFontsURL(theme: CustomTheme | null): string {
  const families = extractExternalFontFamilies(theme)
  if (families.length === 0) return ""
  const params = families
    .slice(0, 4)
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&")
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

export function applyThemeToDOM(theme: CustomTheme | null) {
  const css = buildThemeStyleCSS(theme)
  const fontUrl = buildGoogleFontsURL(theme)

  let styleEl = document.getElementById(STYLE_EL_ID) as HTMLStyleElement | null
  if (css) {
    if (!styleEl) {
      styleEl = document.createElement("style")
      styleEl.id = STYLE_EL_ID
    }
    if (styleEl.textContent !== css) {
      styleEl.textContent = css
    }
    // Always keep the override sheet last in <head> so it wins over bundled CSS
    document.head.appendChild(styleEl)
  } else if (styleEl) {
    styleEl.remove()
  }

  let fontLink = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null
  if (fontUrl) {
    if (!fontLink) {
      fontLink = document.createElement("link")
      fontLink.id = FONT_LINK_ID
      fontLink.rel = "stylesheet"
      document.head.appendChild(fontLink)
    }
    if (fontLink.href !== fontUrl) {
      fontLink.href = fontUrl
    }
  } else if (fontLink) {
    fontLink.remove()
  }

  try {
    if (css) {
      localStorage.setItem(THEME_CSS_CACHE_KEY, css)
    } else {
      localStorage.removeItem(THEME_CSS_CACHE_KEY)
    }
    if (fontUrl) {
      localStorage.setItem(THEME_FONT_URL_CACHE_KEY, fontUrl)
    } else {
      localStorage.removeItem(THEME_FONT_URL_CACHE_KEY)
    }
  } catch {
    // ignore storage quota errors
  }
}

export function exportThemeAsCSS(theme: CustomTheme): string {
  const lightEntries = Object.entries({ ...(theme.theme ?? {}), ...(theme.light ?? {}) })
  const darkEntries = Object.entries({ ...(theme.theme ?? {}), ...(theme.dark ?? {}) })

  const blocks: string[] = []
  if (lightEntries.length > 0) {
    blocks.push(
      `:root {\n${lightEntries.map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}`
    )
  }
  if (darkEntries.length > 0) {
    blocks.push(
      `.dark {\n${darkEntries.map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}`
    )
  }
  return blocks.join("\n\n")
}

export function getThemePreviewColors(
  theme: CustomTheme,
  mode: "light" | "dark"
): {
  background: string
  card: string
  primary: string
  secondary: string
  accent: string
  border: string
  foreground: string
  radius: string
} {
  const vars = mode === "dark" ? theme.dark : theme.light
  const fallbackLight = {
    background: "oklch(1 0 0)",
    card: "oklch(1 0 0)",
    primary: "oklch(0.205 0 0)",
    secondary: "oklch(0.97 0 0)",
    accent: "oklch(0.97 0 0)",
    border: "oklch(0.922 0 0)",
    foreground: "oklch(0.145 0 0)",
  }
  const fallbackDark = {
    background: "oklch(0.145 0 0)",
    card: "oklch(0.205 0 0)",
    primary: "oklch(0.922 0 0)",
    secondary: "oklch(0.269 0 0)",
    accent: "oklch(0.269 0 0)",
    border: "oklch(1 0 0 / 10%)",
    foreground: "oklch(0.985 0 0)",
  }
  const fb = mode === "dark" ? fallbackDark : fallbackLight
  return {
    background: vars.background || fb.background,
    card: vars.card || vars.background || fb.card,
    primary: vars.primary || fb.primary,
    secondary: vars.secondary || vars.muted || fb.secondary,
    accent: vars.accent || vars.secondary || fb.accent,
    border: vars.border || fb.border,
    foreground: vars.foreground || fb.foreground,
    radius: vars.radius || theme.theme?.radius || "0.625rem",
  }
}
