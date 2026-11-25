import type { GeoXURLs } from "@/lib/types"

/** Extract proxy-group names (client) or proxy names (server) from YAML text. */
export function extractPolicyTargets(yamlText: string, isServer: boolean): string[] {
  const sectionKey = isServer ? "proxies" : "proxy-groups"
  const lines = yamlText.split(/\r?\n/)
  const found: string[] = []
  let inSection = false

  for (const line of lines) {
    if (/^[a-zA-Z0-9_-]+\s*:/.test(line)) {
      inSection = line.trim().startsWith(`${sectionKey}:`)
      continue
    }
    if (!inSection) continue
    const m = line.match(/^\s*-\s*name\s*:\s*(.+)$/)
    if (m) {
      const raw = m[1].trim().replace(/^['"]|['"]$/g, "")
      if (raw && !found.includes(raw)) {
        found.push(raw)
      }
    }
  }

  for (const builtin of ["DIRECT", "REJECT"]) {
    if (!found.includes(builtin)) {
      found.push(builtin)
    }
  }
  return found
}

/** Insert rule strings into `rules:` right before any `MATCH,...` line (deduplicating exact matches). */
export function insertRulesBeforeMatch(yamlText: string, newRules: string[]): string {
  const cleaned = newRules.map((r) => r.trim()).filter(Boolean)
  if (cleaned.length === 0) return yamlText

  const lines = yamlText.split(/\r?\n/)
  const rulesHeaderIdx = lines.findIndex((l) => /^rules\s*:\s*$/.test(l.trimEnd()))

  if (rulesHeaderIdx === -1) {
    const base = yamlText.trimEnd()
    const block = ["rules:", ...cleaned.map((r) => `  - ${r}`)].join("\n")
    return base ? `${base}\n\n${block}\n` : `${block}\n`
  }

  // Find end of `rules:` section and any `- MATCH,...` line
  let sectionEnd = lines.length
  let matchIdx = -1
  let indent = "  "
  const existingSet = new Set<string>()

  for (let i = rulesHeaderIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^[a-zA-Z0-9_-]+\s*:/.test(line)) {
      sectionEnd = i
      break
    }
    const itemMatch = line.match(/^(\s*)-\s*(.+)$/)
    if (itemMatch) {
      indent = itemMatch[1] || "  "
      const val = itemMatch[2].trim()
      existingSet.add(val)
      if (matchIdx === -1 && /^MATCH\s*,/i.test(val)) {
        matchIdx = i
      }
    }
  }

  const toInsert = cleaned.filter((r) => !existingSet.has(r)).map((r) => `${indent}- ${r}`)
  if (toInsert.length === 0) return yamlText

  const insertAt = matchIdx !== -1 ? matchIdx : sectionEnd
  const next = [...lines.slice(0, insertAt), ...toInsert, ...lines.slice(insertAt)]
  return next.join("\n")
}

export interface RuleProviderSpec {
  name: string
  behavior: "domain" | "ipcidr"
  url: string
  interval?: number
}

/** Insert one or more MRS `rule-providers:` entries cleanly without duplicating existing keys. */
export function insertRuleProviders(yamlText: string, providers: RuleProviderSpec[]): string {
  if (providers.length === 0) return yamlText

  const lines = yamlText.split(/\r?\n/)
  const rpIdx = lines.findIndex((l) => /^rule-providers\s*:\s*$/.test(l.trimEnd()))

  const formatEntry = (p: RuleProviderSpec) =>
    [
      `  ${p.name}:`,
      `    type: http`,
      `    behavior: ${p.behavior}`,
      `    format: mrs`,
      `    url: ${JSON.stringify(p.url)}`,
      `    interval: ${p.interval ?? 86400}`,
    ].join("\n")

  if (rpIdx === -1) {
    const block = ["rule-providers:", ...providers.map(formatEntry)].join("\n")
    const rulesIdx = lines.findIndex((l) => /^rules\s*:\s*$/.test(l.trimEnd()))
    if (rulesIdx !== -1) {
      const next = [...lines.slice(0, rulesIdx), block, "", ...lines.slice(rulesIdx)]
      return next.join("\n")
    }
    const base = yamlText.trimEnd()
    return base ? `${base}\n\n${block}\n` : `${block}\n`
  }

  let sectionEnd = lines.length
  const existingNames = new Set<string>()
  for (let i = rpIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^[a-zA-Z0-9_-]+\s*:/.test(line)) {
      sectionEnd = i
      break
    }
    const keyMatch = line.match(/^\s{2}([a-zA-Z0-9._-]+)\s*:/)
    if (keyMatch) {
      existingNames.add(keyMatch[1])
    }
  }

  const toAdd = providers.filter((p) => !existingNames.has(p.name)).map(formatEntry)
  if (toAdd.length === 0) return yamlText

  const next = [...lines.slice(0, sectionEnd), ...toAdd, ...lines.slice(sectionEnd)]
  return next.join("\n")
}

/** Insert or replace `geodata-mode: true` and `geox-url:` block in a Mihomo YAML template. */
export function upsertGeoXURLBlock(yamlText: string, geox: GeoXURLs): string {
  const lines = yamlText.split(/\r?\n/)
  const filtered: string[] = []
  let skippingGeox = false

  for (const line of lines) {
    if (/^geodata-mode\s*:/.test(line)) {
      continue
    }
    if (/^geox-url\s*:/.test(line)) {
      skippingGeox = true
      continue
    }
    if (skippingGeox) {
      if (line.trim() === "" || /^\s+/.test(line)) {
        continue
      }
      skippingGeox = false
    }
    filtered.push(line)
  }

  const geoxBlock = [
    "geodata-mode: true",
    "geox-url:",
    `  geosite: ${JSON.stringify(geox.geosite)}`,
    `  geoip: ${JSON.stringify(geox.geoip)}`,
    `  mmdb: ${JSON.stringify(geox.mmdb)}`,
    `  asn: ${JSON.stringify(geox.asn)}`,
  ].join("\n")

  // Place right before `proxies:` / `rule-providers:` / `rules:` if present, else at top
  const anchorIdx = filtered.findIndex((l) =>
    /^(proxies|proxy-groups|rule-providers|rules|sniffer)\s*:/.test(l)
  )
  if (anchorIdx > 0) {
    const before = filtered.slice(0, anchorIdx).join("\n").trimEnd()
    const after = filtered.slice(anchorIdx).join("\n").replace(/^\n+/, "")
    return `${before}\n\n${geoxBlock}\n\n${after}`
  }
  const rest = filtered.join("\n").replace(/^\n+/, "")
  return rest ? `${geoxBlock}\n\n${rest}` : `${geoxBlock}\n`
}
