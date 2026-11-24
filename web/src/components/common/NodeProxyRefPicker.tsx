import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Inbound, Node } from "@/lib/types"

function buildProxyAlias(nodeName: string): string {
  const cleaned = nodeName.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "")
  return cleaned ? `NODE-${cleaned}` : "NODE-RELAY"
}

function escapeYamlString(val: string): string {
  return JSON.stringify(val)
}

export function insertNodeProxyRefIntoYAML(
  currentYAML: string,
  nodeName: string,
  inboundName?: string
): { yaml: string; alias: string } {
  const baseAlias = buildProxyAlias(nodeName)
  let alias = baseAlias
  let seq = 2
  while (currentYAML.includes(`name: ${alias}`) || currentYAML.includes(`name: "${alias}"`)) {
    alias = `${baseAlias}-${seq++}`
  }

  const lines = [
    `  - name: ${alias}`,
    `    type: mihob-node`,
    `    node: ${escapeYamlString(nodeName)}`,
  ]
  if (inboundName) {
    lines.push(`    inbound: ${escapeYamlString(inboundName)}`)
  }
  const snippet = lines.join("\n")

  const trimmed = currentYAML.trim()
  if (!trimmed) {
    return {
      alias,
      yaml: `proxies:\n${snippet}\n`,
    }
  }

  const rawLines = currentYAML.split(/\r?\n/)
  const proxiesLineIdx = rawLines.findIndex((line) => /^proxies\s*:\s*(#.*)?$/.test(line))
  if (proxiesLineIdx >= 0) {
    const next = [...rawLines]
    next.splice(proxiesLineIdx + 1, 0, snippet)
    return {
      alias,
      yaml: next.join("\n"),
    }
  }

  const separator = currentYAML.endsWith("\n") ? "\n" : "\n\n"
  return {
    alias,
    yaml: `${currentYAML}${separator}proxies:\n${snippet}\n`,
  }
}

export function NodeProxyRefPicker({
  nodes,
  inbounds,
  excludeNodeId,
  value,
  onChange,
}: {
  nodes: Node[]
  inbounds: Inbound[]
  excludeNodeId?: number
  value: string
  onChange: (nextYaml: string) => void
}) {
  const { t } = useTranslation()
  const [selectedNodeId, setSelectedNodeId] = useState<string>("")
  const [selectedInbound, setSelectedInbound] = useState<string>("auto")

  const availableNodes = useMemo(
    () => nodes.filter((n) => n.enabled && n.id !== excludeNodeId),
    [nodes, excludeNodeId]
  )

  const effectiveNodeId = useMemo(() => {
    if (selectedNodeId && availableNodes.some((n) => String(n.id) === selectedNodeId)) {
      return selectedNodeId
    }
    return availableNodes[0] ? String(availableNodes[0].id) : ""
  }, [selectedNodeId, availableNodes])

  const nodeInbounds = useMemo(() => {
    if (!effectiveNodeId) return []
    const nid = Number(effectiveNodeId)
    return inbounds.filter((inb) => inb.node_id === nid && inb.enabled)
  }, [effectiveNodeId, inbounds])

  const handleInsert = () => {
    const targetNode = availableNodes.find((n) => String(n.id) === effectiveNodeId)
    if (!targetNode) return
    const inboundName =
      selectedInbound !== "auto" && nodeInbounds.some((i) => i.name === selectedInbound)
        ? selectedInbound
        : undefined
    const res = insertNodeProxyRefIntoYAML(value || "", targetNode.name, inboundName)
    onChange(res.yaml)
    toast.success(t("templates.form.nodeRefInserted", { alias: res.alias }))
  }

  if (availableNodes.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="size-3.5" />
        {t("templates.form.insertNodeRefLabel")}
      </span>
      <Select
        value={effectiveNodeId}
        onValueChange={(v) => {
          setSelectedNodeId(v ?? "")
          setSelectedInbound("auto")
        }}
      >
        <SelectTrigger className="h-7 w-44 bg-background text-xs">
          <SelectValue placeholder={t("templates.form.selectRefNodePlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {availableNodes.map((n) => (
            <SelectItem key={n.id} value={String(n.id)}>
              {n.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={selectedInbound} onValueChange={(v) => setSelectedInbound(v ?? "auto")}>
        <SelectTrigger className="h-7 w-44 bg-background text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t("templates.form.refInboundAuto")}</SelectItem>
          {nodeInbounds.map((inb) => (
            <SelectItem key={inb.id} value={inb.name}>
              {inb.name} ({inb.protocol}:{inb.port})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs"
        disabled={!effectiveNodeId}
        onClick={handleInsert}
      >
        <Plus className="mr-1 size-3.5" />
        {t("templates.form.insertNodeRefBtn")}
      </Button>
    </div>
  )
}
