import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { FormSwitchCard } from "@/components/common/FormControls"
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Protocol } from "@/lib/types"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"

export function OtherTransportSections({
  form,
  protocol,
}: {
  form: UseFormReturn<InboundFormValues>
  protocol: Protocol
}) {
  const { t } = useTranslation()
  const snellVersion = Number(form.watch("snell_version") || 4)
  const sudokuDisableMask = Boolean(form.watch("sudoku_disable_http_mask"))

  if (protocol === "anytls") {
    return (
      <FormField
        control={form.control}
        name="padding_scheme"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("nodes.inbound.fields.paddingScheme")}</FormLabel>
            <FormControl>
              <Textarea
                rows={4}
                className="font-mono text-xs"
                placeholder={t("nodes.inbound.fields.paddingSchemePlaceholder")}
                {...field}
              />
            </FormControl>
          </FormItem>
        )}
      />
    )
  }

  if (protocol === "mieru") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="mieru_transport"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruTransport")}</FormLabel>
                <Select value={field.value || "TCP"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="TCP">TCP</SelectItem>
                    <SelectItem value="UDP">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mieru_port_range"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruPortRange")}</FormLabel>
                <FormControl>
                  <Input placeholder="20000-20010" className="font-mono text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mieru_multiplexing"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruMultiplexing")}</FormLabel>
                <Select value={field.value || "MULTIPLEXING_LOW"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MULTIPLEXING_OFF">OFF</SelectItem>
                    <SelectItem value="MULTIPLEXING_LOW">LOW</SelectItem>
                    <SelectItem value="MULTIPLEXING_MIDDLE">MIDDLE</SelectItem>
                    <SelectItem value="MULTIPLEXING_HIGH">HIGH</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mieru_handshake_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruHandshakeMode")}</FormLabel>
                <Select
                  value={field.value || "default"}
                  onValueChange={(v) => field.onChange(v === "default" ? "" : v)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="default">{t("nodes.inbound.fields.bbrDefault")}</SelectItem>
                    <SelectItem value="HANDSHAKE_STANDARD">HANDSHAKE_STANDARD</SelectItem>
                    <SelectItem value="HANDSHAKE_NO_WAIT">HANDSHAKE_NO_WAIT</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mieru_tcp_idle_timeout"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.mieruTcpIdleTimeout")}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="120"
                    className="tabular-nums"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="mieru_user_hint_mandatory"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <FormSwitchCard
                  label={t("nodes.inbound.fields.mieruUserHintMandatory")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  className="bg-muted/30"
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    )
  }

  if (protocol === "snell") {
    return snellVersion === 6 ? (
      <FormField
        control={form.control}
        name="snell_mode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("nodes.inbound.fields.snellMode")}</FormLabel>
            <Select value={field.value || "default"} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="default">default</SelectItem>
                <SelectItem value="unshaped">unshaped</SelectItem>
                <SelectItem value="unsafe-raw">unsafe-raw</SelectItem>
              </SelectContent>
            </Select>
          </FormItem>
        )}
      />
    ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="snell_obfs_mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.obfs")}</FormLabel>
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
                  <SelectItem value="none">{t("nodes.inbound.fields.obfsNone")}</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="tls">tls</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="snell_obfs_host"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.snellObfsHost")}</FormLabel>
              <FormControl>
                <Input placeholder="bing.com" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    )
  }

  if (protocol === "sudoku") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="sudoku_disable_http_mask"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FormSwitchCard
                    label={t("nodes.inbound.fields.sudokuDisableMask")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    className="bg-muted/30"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sudoku_enable_pure_downlink"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FormSwitchCard
                    label={t("nodes.inbound.fields.sudokuPureDownlink")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    className="bg-muted/30"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        {!sudokuDisableMask && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="sudoku_http_mask_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuMaskMode")}</FormLabel>
                    <Select value={field.value || "legacy"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="legacy">legacy</SelectItem>
                        <SelectItem value="stream">stream</SelectItem>
                        <SelectItem value="poll">poll</SelectItem>
                        <SelectItem value="auto">auto</SelectItem>
                        <SelectItem value="ws">ws</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sudoku_path_root"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuPathRoot")}</FormLabel>
                    <FormControl>
                      <Input placeholder="/api" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sudoku_http_mask_host"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuMaskHost")}</FormLabel>
                    <FormControl>
                      <Input placeholder="example.com" className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="sudoku_http_mask_tls"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <FormSwitchCard
                      label={t("nodes.inbound.fields.sudokuMaskTls")}
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
        <FormField
          control={form.control}
          name="sudoku_fallback"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.sudokuFallback")}</FormLabel>
              <FormControl>
                <Input placeholder="127.0.0.1:80" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    )
  }

  return null
}
