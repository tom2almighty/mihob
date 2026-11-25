import { useTranslation } from "react-i18next"
import { Eye, Loader2 } from "lucide-react"
import { CopyButton } from "@/components/common/CommonUI"
import { YamlCodeBlock } from "@/components/common/YamlEditor"
import { Button } from "@/components/ui/button"

export function ServerConfigPreviewCard({
  previewYAML,
  previewPending,
  onPreview,
}: {
  previewYAML?: string
  previewPending?: boolean
  onPreview: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{t("nodes.form.previewTitle")}</div>
        <div className="flex items-center gap-1.5">
          {previewYAML && (
            <CopyButton
              value={previewYAML}
              label={t("templates.copyYaml")}
              size="sm"
              variant="outline"
            />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={previewPending}
            onClick={onPreview}
          >
            {previewPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Eye className="mr-1.5 size-3.5" />
            )}
            {previewYAML ? t("nodes.form.refreshPreview") : t("nodes.form.previewBtn")}
          </Button>
        </div>
      </div>
      {previewYAML && <YamlCodeBlock value={previewYAML} className="max-h-64" />}
    </div>
  )
}
