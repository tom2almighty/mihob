import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CopyButton } from "@/components/common/CommonUI"
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
import { FINGERPRINTS, getProtocolSpec } from "../registry"
import { ClientEndpointApisEditor } from "./ClientEndpointApisEditor"

function shortFingerprint(fp: string): string {
  if (fp.length <= 24) return fp
  return `${fp.slice(0, 12)}…${fp.slice(-12)}`
}

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
  const spec = getProtocolSpec(protocol)
  const certId = form.watch("cert_id")
  const allowInsecure = Boolean(form.watch("allow_insecure"))
  const certFpMode = form.watch("cert_fingerprint_mode") || "auto"
  const selectedCert =
    certId && certId !== "none" ? certs.find((c) => String(c.id) === certId) : undefined
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

      {spec.supportsAllowInsecure && (!certId || certId === "none" || allowInsecure) && (
        <FormField
          control={form.control}
          name="allow_insecure"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <FormSwitchCard
                  label={t("nodes.inbound.fields.allowInsecure")}
                  description={t("nodes.inbound.fields.allowInsecureDesc")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      )}

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

      <div className="space-y-2.5 rounded-md border border-border bg-background/60 p-3">
        <FormField
          control={form.control}
          name="cert_fingerprint_mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.certFingerprintMode")}</FormLabel>
              <Select
                value={field.value || "auto"}
                onValueChange={(v) => field.onChange(v || "auto")}
              >
                <FormControl>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="auto">
                    {t("nodes.inbound.fields.certFingerprintAuto")}
                  </SelectItem>
                  <SelectItem value="pin">
                    {t("nodes.inbound.fields.certFingerprintPin")}
                  </SelectItem>
                  <SelectItem value="custom">
                    {t("nodes.inbound.fields.certFingerprintCustom")}
                  </SelectItem>
                  <SelectItem value="off">
                    {t("nodes.inbound.fields.certFingerprintOff")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>{t("nodes.inbound.fields.certFingerprintDesc")}</FormDescription>
            </FormItem>
          )}
        />

        {certFpMode === "custom" && (
          <FormField
            control={form.control}
            name="cert_fingerprint"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.customCertFingerprint")}</FormLabel>
                <FormControl>
                  <Input
                    className="bg-background font-mono text-xs"
                    placeholder={t("nodes.inbound.fields.customCertFingerprintPlaceholder")}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}

        {certFpMode !== "off" && certFpMode !== "custom" && selectedCert?.fingerprint && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-muted/30 px-2.5 py-1.5 text-xs">
            <div className="min-w-0 truncate">
              <span className="text-muted-foreground">
                {certFpMode === "pin" || selectedCert.source === "self_signed"
                  ? t("nodes.inbound.fields.certFingerprintActive")
                  : t("nodes.inbound.fields.certFingerprintBound")}{" "}
              </span>
              <code className="font-mono text-foreground" title={selectedCert.fingerprint}>
                {shortFingerprint(selectedCert.fingerprint)}
              </code>
            </div>
            <CopyButton value={selectedCert.fingerprint} size="icon-sm" />
          </div>
        )}
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

      {spec.supportsClientEndpointOverride && security === "tls" && (
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
