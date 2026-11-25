import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { CopyButton } from "@/components/common/CommonUI"
import { YamlCodeBlock, YamlEditor } from "@/components/common/YamlEditor"
import { Button } from "@/components/ui/button"
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import type { InboundFormValues } from "./inboundSchema"

export function InboundAdvancedTab({
  nodeId,
  nodeOutbounds = [],
  form,
  buildPayload,
}: {
  nodeId: number
  nodeOutbounds?: string[]
  form: UseFormReturn<InboundFormValues>
  buildPayload: (v: InboundFormValues) => Record<string, unknown>
}) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<{ server_yaml: string; client_yaml: string } | null>(null)

  const previewMutation = useMutation({
    mutationFn: () => api.previewInbound(nodeId, buildPayload(form.getValues())),
    onSuccess: (res) => setPreview(res),
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-4">
      {/* Common Listener Options */}
      <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
        <div className="text-xs font-medium text-foreground">
          {t("nodes.inbound.advanced.commonTitle")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="port_range"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.advanced.portRange")}</FormLabel>
                <FormControl>
                  <Input placeholder="200,302,401-429" className="font-mono text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="routing_mark"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.advanced.routingMark")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="tabular-nums"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="listener_rule"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.advanced.listenerRule")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("nodes.inbound.advanced.listenerRulePlaceholder")}
                    className="font-mono text-xs"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="listener_proxy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.advanced.listenerProxy")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("nodes.inbound.advanced.listenerProxyPlaceholder")}
                    className="font-mono text-xs"
                    {...field}
                  />
                </FormControl>
                {nodeOutbounds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="text-[11px] text-muted-foreground">
                      {t("nodes.inbound.advanced.quickPickOutbound")}
                    </span>
                    {[...nodeOutbounds, "DIRECT"].map((name) => {
                      const active = field.value === name
                      return (
                        <Button
                          key={name}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          className="h-5 px-1.5 font-mono text-[11px]"
                          onClick={() => field.onChange(active ? "" : name)}
                        >
                          {name}
                        </Button>
                      )
                    })}
                  </div>
                )}
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Deep-Merge Server YAML Override */}
      <FormField
        control={form.control}
        name="extra_server_yaml"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("nodes.inbound.advanced.extraServerYaml")}</FormLabel>
            <FormDescription className="text-xs">
              {t("nodes.inbound.advanced.extraServerYamlDesc")}
            </FormDescription>
            <FormControl>
              <YamlEditor
                name={field.name}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={`# e.g.\n# shadow-tls:\n#   enable: true\n#   version: 3`}
                minHeightClass="min-h-[120px]"
              />
            </FormControl>
          </FormItem>
        )}
      />

      {/* Deep-Merge Client YAML Override */}
      <FormField
        control={form.control}
        name="extra_client_yaml"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("nodes.inbound.advanced.extraClientYaml")}</FormLabel>
            <FormDescription className="text-xs">
              {t("nodes.inbound.advanced.extraClientYamlDesc")}
            </FormDescription>
            <FormControl>
              <YamlEditor
                name={field.name}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={`# e.g.\n# smux:\n#   enabled: true\n# tfo: true`}
                minHeightClass="min-h-[120px]"
              />
            </FormControl>
          </FormItem>
        )}
      />

      {/* Live Merged YAML Preview */}
      <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium text-foreground">
            {t("nodes.inbound.advanced.previewTitle")}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Eye className="mr-1.5 size-3.5" />
            )}
            {preview
              ? t("nodes.inbound.advanced.refreshPreview")
              : t("nodes.inbound.advanced.previewBtn")}
          </Button>
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("nodes.inbound.advanced.serverPreviewLabel")}
                </span>
                <CopyButton
                  value={preview.server_yaml}
                  label={t("common.copy")}
                  size="sm"
                  variant="outline"
                />
              </div>
              <YamlCodeBlock value={preview.server_yaml} className="max-h-48" />
            </div>

            {preview.client_yaml && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("nodes.inbound.advanced.clientPreviewLabel")}
                  </span>
                  <CopyButton
                    value={preview.client_yaml}
                    label={t("common.copy")}
                    size="sm"
                    variant="outline"
                  />
                </div>
                <YamlCodeBlock value={preview.client_yaml} className="max-h-48" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
