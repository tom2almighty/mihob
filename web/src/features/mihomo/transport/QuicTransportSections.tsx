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
import type { Protocol } from "@/lib/types"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"

export function QuicTransportSections({
  form,
  protocol,
}: {
  form: UseFormReturn<InboundFormValues>
  protocol: Protocol
}) {
  const { t } = useTranslation()

  if (protocol === "hysteria2") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="up_mbps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.upMbps")}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} className="tabular-nums" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="down_mbps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.downMbps")}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} className="tabular-nums" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hop_ports"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.hopPorts")}</FormLabel>
                <FormControl>
                  <Input placeholder="20000-30000" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="obfs"
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
                    <SelectItem value="salamander">salamander</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="obfs_password"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t("nodes.inbound.fields.obfsPassword")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("nodes.inbound.fields.obfsPasswordPlaceholder")}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="masquerade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.masquerade")}</FormLabel>
                <FormControl>
                  <Input placeholder="https://example.com" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bbr_profile"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.bbrProfile")}</FormLabel>
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
                    <SelectItem value="standard">standard</SelectItem>
                    <SelectItem value="conservative">conservative</SelectItem>
                    <SelectItem value="aggressive">aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cwnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.cwnd")}</FormLabel>
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
        </div>
        <FormField
          control={form.control}
          name="ignore_client_bandwidth"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <FormSwitchCard
                  label={t("nodes.inbound.fields.ignoreClientBandwidth")}
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

  if (protocol === "tuic") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="congestion_controller"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.congestion")}</FormLabel>
              <Select value={field.value || "bbr"} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="bbr">{t("nodes.inbound.fields.bbrRecommended")}</SelectItem>
                  <SelectItem value="cubic">Cubic</SelectItem>
                  <SelectItem value="new_reno">New Reno</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="udp_relay_mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.udpRelayMode")}</FormLabel>
              <Select value={field.value || "native"} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="native">native</SelectItem>
                  <SelectItem value="quic">quic</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cwnd"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.cwnd")}</FormLabel>
              <FormControl>
                <Input type="number" min={0} placeholder="0" className="tabular-nums" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="max_idle_time"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.maxIdleTime")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  placeholder="15000"
                  className="tabular-nums"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    )
  }

  if (protocol === "trusttunnel") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="trusttunnel_network"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.trusttunnelNetwork")}</FormLabel>
              <Select value={field.value || "both"} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="both">{t("nodes.inbound.fields.trusttunnelBoth")}</SelectItem>
                  <SelectItem value="udp">{t("nodes.inbound.fields.trusttunnelUdp")}</SelectItem>
                  <SelectItem value="tcp">TCP (HTTP/2)</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="congestion_controller"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.congestion")}</FormLabel>
              <Select value={field.value || "bbr"} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="bbr">{t("nodes.inbound.fields.bbrRecommended")}</SelectItem>
                  <SelectItem value="cubic">Cubic</SelectItem>
                  <SelectItem value="new_reno">New Reno</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cwnd"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.cwnd")}</FormLabel>
              <FormControl>
                <Input type="number" min={0} placeholder="0" className="tabular-nums" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name_cert_verify"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.nameCertVerify")}</FormLabel>
              <FormControl>
                <Input placeholder="example.com" className="font-mono text-xs" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trusttunnel_max_connections"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.trusttunnelMaxConns")}</FormLabel>
              <FormControl>
                <Input type="number" min={0} placeholder="0" className="tabular-nums" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trusttunnel_min_streams"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.trusttunnelMinStreams")}</FormLabel>
              <FormControl>
                <Input type="number" min={0} placeholder="0" className="tabular-nums" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="trusttunnel_max_streams"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.trusttunnelMaxStreams")}</FormLabel>
              <FormControl>
                <Input type="number" min={0} placeholder="0" className="tabular-nums" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    )
  }

  if (protocol === "shadowquic") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="congestion_controller"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.congestion")}</FormLabel>
                <Select value={field.value || "bbr"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="bbr">{t("nodes.inbound.fields.bbrRecommended")}</SelectItem>
                    <SelectItem value="cubic">Cubic</SelectItem>
                    <SelectItem value="new_reno">New Reno</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cwnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.cwnd")}</FormLabel>
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
            name="up_mbps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.upMbps")}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} className="tabular-nums" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="down_mbps"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.downMbps")}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} className="tabular-nums" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="ignore_client_bandwidth"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <FormSwitchCard
                  label={t("nodes.inbound.fields.ignoreClientBandwidth")}
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

  return null
}
