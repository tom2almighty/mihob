import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Shuffle } from "lucide-react"
import { FormSwitchCard } from "@/components/common/FormControls"
import { Button } from "@/components/ui/button"
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Protocol } from "@/lib/types"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"

function randomToken(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

export function StreamTransportSection({
  form,
  protocol,
}: {
  form: UseFormReturn<InboundFormValues>
  protocol: Protocol
}) {
  const { t } = useTranslation()
  const network = form.watch("network")

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="network"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("nodes.inbound.fields.transport")}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="tcp">TCP</SelectItem>
                <SelectItem value="ws">WebSocket</SelectItem>
                <SelectItem value="grpc">gRPC</SelectItem>
                {protocol === "vless" && <SelectItem value="xhttp">XHTTP</SelectItem>}
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />

      {protocol === "vless" && network === "tcp" && (
        <FormField
          control={form.control}
          name="flow"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.flow")}</FormLabel>
              <Select
                value={field.value || "none"}
                onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="xtls-rprx-vision">
                    {t("nodes.inbound.fields.flowVision")}
                  </SelectItem>
                  <SelectItem value="none">{t("nodes.inbound.fields.flowNone")}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      )}

      {network === "ws" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="ws_path"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.wsPath")}</FormLabel>
                <div className="flex items-center gap-1.5">
                  <FormControl>
                    <Input placeholder="/ws" className="font-mono text-xs" {...field} />
                  </FormControl>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0"
                          aria-label={t("nodes.inbound.fields.randomPathAria")}
                          onClick={() => field.onChange(`/${randomToken(12)}`)}
                        >
                          <Shuffle className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent>{t("nodes.inbound.fields.randomPathTooltip")}</TooltipContent>
                  </Tooltip>
                </div>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ws_host"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.wsHost")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("nodes.inbound.fields.wsHostPlaceholder")}
                    className="font-mono text-xs"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {network === "grpc" && (
        <FormField
          control={form.control}
          name="grpc_service_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.grpcService")}</FormLabel>
              <div className="flex items-center gap-1.5">
                <FormControl>
                  <Input placeholder="GunService" className="font-mono text-xs" {...field} />
                </FormControl>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0"
                        aria-label={t("nodes.inbound.fields.randomPathAria")}
                        onClick={() => field.onChange(`svc_${randomToken(10)}`)}
                      >
                        <Shuffle className="size-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent>{t("nodes.inbound.fields.randomPathTooltip")}</TooltipContent>
                </Tooltip>
              </div>
            </FormItem>
          )}
        />
      )}

      {protocol === "vless" && network === "xhttp" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="xhttp_path"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.xhttpPath")}</FormLabel>
                  <div className="flex items-center gap-1.5">
                    <FormControl>
                      <Input placeholder="/xhttp" className="font-mono text-xs" {...field} />
                    </FormControl>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 shrink-0"
                            aria-label={t("nodes.inbound.fields.randomPathAria")}
                            onClick={() => field.onChange(`/${randomToken(12)}`)}
                          >
                            <Shuffle className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("nodes.inbound.fields.randomPathTooltip")}</TooltipContent>
                    </Tooltip>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="xhttp_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.xhttpMode")}</FormLabel>
                  <Select value={field.value || "auto"} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="packet-up">packet-up</SelectItem>
                      <SelectItem value="stream-up">stream-up</SelectItem>
                      <SelectItem value="stream-one">stream-one</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="xhttp_host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.xhttpHost")}</FormLabel>
                  <FormControl>
                    <Input placeholder="example.com" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="xhttp_x_padding_bytes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.xhttpPaddingBytes")}</FormLabel>
                  <FormControl>
                    <Input placeholder="100-1000" className="font-mono text-xs" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="xhttp_no_sse_header"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FormSwitchCard
                    label={t("nodes.inbound.fields.xhttpNoSseHeader")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    className="bg-muted/30"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  )
}
