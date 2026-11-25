import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CollapsibleSection, FormSwitchCard } from "@/components/common/FormControls"
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Certificate, Protocol } from "@/lib/types"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"
import { FINGERPRINTS, SUPPORTS_REALITY } from "../registry"
import { ClientEndpointApisEditor } from "./ClientEndpointApisEditor"

export function TlsSecuritySection({
  form,
  certs,
  protocol,
  security,
}: {
  form: UseFormReturn<InboundFormValues>
  certs: Certificate[]
  protocol: Protocol
  security: "none" | "tls" | "reality"
}) {
  const { t } = useTranslation()
  const hasAdvancedTls = Boolean(
    form.getValues("ech_enable") ||
      form.getValues("ech_key") ||
      form.getValues("ech_config") ||
      form.getValues("client_auth_type") ||
      form.getValues("client_auth_cert")
  )

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <FormField
        control={form.control}
        name="cert_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("nodes.inbound.fields.bindCert")}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={t("nodes.inbound.fields.selectCertPlaceholder")} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">{t("nodes.inbound.fields.noCertSelected")}</SelectItem>
                {certs.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name} ({c.domain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>{t("nodes.inbound.fields.certDesc")}</FormDescription>
          </FormItem>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          control={form.control}
          name="sni"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.clientSni")}</FormLabel>
              <FormControl>
                <Input
                  className="bg-background"
                  placeholder={t("nodes.inbound.fields.clientSniPlaceholder")}
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="alpn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.alpn")}</FormLabel>
              <FormControl>
                <Input
                  placeholder="h3, h2, http/1.1"
                  className="bg-background font-mono text-xs"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="client_fingerprint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.clientFingerprint")}</FormLabel>
              <Select
                value={field.value || "default"}
                onValueChange={(v) => field.onChange(v === "default" ? "" : v)}
              >
                <FormControl>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="default">{t("nodes.inbound.fields.bbrDefault")}</SelectItem>
                  {FINGERPRINTS.map((fp) => (
                    <SelectItem key={fp} value={fp}>
                      {fp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="skip_cert_verify"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <FormSwitchCard
                label={t("nodes.inbound.fields.skipCertVerify")}
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />

      {SUPPORTS_REALITY.includes(protocol) && security === "tls" && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="client_server"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t("nodes.inbound.fields.clientServer")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={t("nodes.inbound.fields.clientServerPlaceholder")}
                      className="min-h-15 bg-background font-mono text-xs"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="client_port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.clientPort")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={65535}
                      placeholder="0"
                      className="bg-background tabular-nums"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <ClientEndpointApisEditor form={form} />
        </div>
      )}

      <CollapsibleSection
        title={t("nodes.inbound.fields.advancedTlsTitle")}
        defaultOpen={hasAdvancedTls}
      >
        {/* ECH subsection */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            {t("nodes.inbound.fields.echTitle")}
          </div>
          <FormField
            control={form.control}
            name="ech_enable"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FormSwitchCard
                    label={t("nodes.inbound.fields.echEnable")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ech_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.echKey")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    className="bg-background font-mono text-xs"
                    placeholder="-----BEGIN ECH KEYS-----"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ech_config"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.echConfig")}</FormLabel>
                <FormControl>
                  <Input className="bg-background font-mono text-xs" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {/* mTLS client authentication subsection */}
        <div className="space-y-3 border-t border-border pt-3">
          <div className="text-xs font-medium text-muted-foreground">
            {t("nodes.inbound.fields.mtlsTitle")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="client_auth_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.clientAuthType")}</FormLabel>
                  <Select
                    value={field.value || "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("nodes.inbound.fields.clientAuthNone")}
                      </SelectItem>
                      <SelectItem value="request">request</SelectItem>
                      <SelectItem value="require-any">require-any</SelectItem>
                      <SelectItem value="verify-if-given">verify-if-given</SelectItem>
                      <SelectItem value="require-and-verify">require-and-verify</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="client_auth_cert"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.clientAuthCert")}</FormLabel>
                  <FormControl>
                    <Input className="bg-background font-mono text-xs" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
