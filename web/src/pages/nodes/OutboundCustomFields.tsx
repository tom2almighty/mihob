import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, FileCode2, Link2 } from "lucide-react"
import { toast } from "sonner"
import { YamlEditor } from "@/components/common/YamlEditor"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { NodeOutbound } from "@/lib/types"
import { CUSTOM_PROXY_TEMPLATES, parseProxyShareLink } from "./outboundCustom"

export function OutboundCustomFields({
  item,
  onPatch,
}: {
  item: NodeOutbound
  onPatch: (patch: Partial<NodeOutbound>) => void
}) {
  const { t } = useTranslation()
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkText, setLinkText] = useState("")

  const handleImportLink = () => {
    const parsed = parseProxyShareLink(linkText)
    if (!parsed) {
      toast.error(t("nodes.form.outbound.customLinkParseError"))
      return
    }
    onPatch({ custom_yaml: parsed.yaml })
    setLinkOpen(false)
    setLinkText("")
    toast.success(t("nodes.form.outbound.customLinkParseSuccess"))
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">{t("nodes.form.outbound.customHint")}</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant={linkOpen ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setLinkOpen((v) => !v)
              setLinkText("")
            }}
          >
            <Link2 className="mr-1 size-3" />
            {t("nodes.form.outbound.customImportLinkBtn")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
                  <FileCode2 className="mr-1 size-3" />
                  {t("nodes.form.outbound.customTemplateBtn")}
                  <ChevronDown className="ml-1 size-3 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              {CUSTOM_PROXY_TEMPLATES.map((tpl) => (
                <DropdownMenuItem key={tpl.key} onClick={() => onPatch({ custom_yaml: tpl.yaml })}>
                  {tpl.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2.5">
          <Input
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder={t("nodes.form.outbound.customLinkPlaceholder")}
            className="h-8 flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              setLinkOpen(false)
              setLinkText("")
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={handleImportLink}>
            {t("nodes.form.outbound.wgApplyBtn")}
          </Button>
        </div>
      )}

      <YamlEditor
        value={item.custom_yaml ?? ""}
        onChange={(next) => onPatch({ custom_yaml: next })}
        placeholder={CUSTOM_PROXY_TEMPLATES[0].yaml}
        minHeightClass="min-h-[150px]"
      />
      <p className="text-[11px] text-muted-foreground">{t("nodes.form.outbound.customYamlNote")}</p>
    </div>
  )
}
