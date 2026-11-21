import type { AccessPolicy, Inbound, Node, Protocol } from "./types"

export const DEFAULT_ACCESS_POLICY: AccessPolicy = {
  node_mode: "all",
  node_match: "all",
  node_regions: [],
  node_tags: [],
  node_name_regex: "",
  node_ids: [],
  exclude_node_ids: [],
  inbound_mode: "all",
  inbound_match: "all",
  inbound_protocols: [],
  inbound_tags: [],
  inbound_name_regex: "",
  inbound_ids: [],
  exclude_inbound_ids: [],
}

export function normalizeAccessPolicy(p?: Partial<AccessPolicy> | null): AccessPolicy {
  return {
    node_mode: p?.node_mode || "all",
    node_match: p?.node_match === "any" ? "any" : "all",
    node_regions: p?.node_regions ? [...p.node_regions] : [],
    node_tags: p?.node_tags ? [...p.node_tags] : [],
    node_name_regex: p?.node_name_regex ?? "",
    node_ids: p?.node_ids ? [...p.node_ids] : [],
    exclude_node_ids: p?.exclude_node_ids ? [...p.exclude_node_ids] : [],
    inbound_mode: p?.inbound_mode || "all",
    inbound_match: p?.inbound_match === "any" ? "any" : "all",
    inbound_protocols: p?.inbound_protocols ? ([...p.inbound_protocols] as Protocol[]) : [],
    inbound_tags: p?.inbound_tags ? [...p.inbound_tags] : [],
    inbound_name_regex: p?.inbound_name_regex ?? "",
    inbound_ids: p?.inbound_ids ? [...p.inbound_ids] : [],
    exclude_inbound_ids: p?.exclude_inbound_ids ? [...p.exclude_inbound_ids] : [],
  }
}

export function validateRegex(pattern: string): string | null {
  const trimmed = pattern.trim()
  if (!trimmed) return null
  try {
    new RegExp(trimmed)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid regex"
  }
}

function containsFold(list: string[] | undefined, value: string): boolean {
  const target = value.trim().toLowerCase()
  if (!target || !list?.length) return false
  return list.some((item) => item.trim().toLowerCase() === target)
}

function anyTagOverlap(wanted: string[] | undefined, actual: string[] | undefined): boolean {
  if (!wanted?.length || !actual?.length) return false
  return actual.some((a) => containsFold(wanted, a))
}

function matchRegex(pattern: string | undefined, ...candidates: (string | undefined)[]): boolean {
  const trimmed = (pattern ?? "").trim()
  if (!trimmed) return true
  try {
    // Support Go-style inline case-insensitive flag (?i) in preview matcher
    const ci = trimmed.startsWith("(?i)")
    const source = ci ? trimmed.slice(4) : trimmed
    const re = new RegExp(source, ci ? "i" : undefined)
    return candidates.some((c) => Boolean(c) && re.test(c!))
  } catch {
    return false
  }
}

function combineConditions(mode: "all" | "any" | undefined, results: boolean[]): boolean {
  if (results.length === 0) return false
  if (mode === "any") return results.some(Boolean)
  return results.every(Boolean)
}

export function matchNode(policy: AccessPolicy, node: Node): boolean {
  if (policy.exclude_node_ids?.includes(node.id)) return false
  switch (policy.node_mode) {
    case "all":
      return true
    case "manual":
      return Boolean(policy.node_ids?.includes(node.id))
    case "rule": {
      const conds: boolean[] = []
      if (policy.node_regions?.length) {
        conds.push(containsFold(policy.node_regions, node.region))
      }
      if (policy.node_tags?.length) {
        conds.push(anyTagOverlap(policy.node_tags, node.tags))
      }
      if (policy.node_name_regex?.trim()) {
        conds.push(matchRegex(policy.node_name_regex, node.name))
      }
      return combineConditions(policy.node_match, conds)
    }
    default:
      return false
  }
}

export function matchInbound(policy: AccessPolicy, inbound: Inbound): boolean {
  if (policy.exclude_inbound_ids?.includes(inbound.id)) return false
  switch (policy.inbound_mode) {
    case "all":
      return true
    case "manual":
      return Boolean(policy.inbound_ids?.includes(inbound.id))
    case "rule": {
      const conds: boolean[] = []
      if (policy.inbound_protocols?.length) {
        conds.push(containsFold(policy.inbound_protocols, inbound.protocol))
      }
      if (policy.inbound_tags?.length) {
        conds.push(anyTagOverlap(policy.inbound_tags, inbound.tags))
      }
      if (policy.inbound_name_regex?.trim()) {
        conds.push(
          matchRegex(
            policy.inbound_name_regex,
            inbound.name,
            inbound.tag,
            inbound.settings?.proxy_name
          )
        )
      }
      return combineConditions(policy.inbound_match, conds)
    }
    default:
      return false
  }
}

export interface EvaluatedAccessNode {
  node: Node
  inbounds: Inbound[]
}

export function evaluateAccessPolicy(
  policy: AccessPolicy,
  nodes: Node[],
  allInbounds: Inbound[]
): {
  entries: EvaluatedAccessNode[]
  totalNodes: number
  totalInbounds: number
  hasSharedSecret: boolean
} {
  const byNode = new Map<number, Inbound[]>()
  for (const inb of allInbounds) {
    const arr = byNode.get(inb.node_id) ?? []
    arr.push(inb)
    byNode.set(inb.node_id, arr)
  }

  const entries: EvaluatedAccessNode[] = []
  let totalInbounds = 0
  let hasSharedSecret = false

  for (const node of nodes) {
    if (!matchNode(policy, node)) continue
    const nodeInbounds = (byNode.get(node.id) ?? []).filter((inb) => inb.enabled)
    const matched = nodeInbounds.filter((inb) => matchInbound(policy, inb))
    if (policy.inbound_mode === "all" || matched.length > 0 || nodeInbounds.length === 0) {
      entries.push({ node, inbounds: matched })
    }
    totalInbounds += matched.length
    if (matched.some((inb) => inb.protocol === "snell" || inb.protocol === "sudoku")) {
      hasSharedSecret = true
    }
  }

  return {
    entries,
    totalNodes: entries.length,
    totalInbounds,
    hasSharedSecret,
  }
}
