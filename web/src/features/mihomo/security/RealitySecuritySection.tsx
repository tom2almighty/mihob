import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Cloud, KeyRound } from "lucide-react"
import { CopyButton } from "@/components/common/CommonUI"
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
import { Textarea } from "@/components/ui/textarea"
import type { Protocol } from "@/lib/types"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"
import { FINGERPRINTS, getProtocolSpec, SUPPORTS_REALITY } from "../registry"
import { ClientEndpointApisEditor } from "./ClientEndpointApisEditor"

export function NoneSecuritySection({
  form,
  protocol,
}: {
  form: UseFormReturn<InboundFormValues>
  protocol: Protocol
}) {
  const { t } = useTranslation()
  const spec = getProtocolSpec(protocol)
  const clientTls = Boolean(form.watch("client_tls"))
  const listenPort = form.watch("port") || 443
  const supportsStream = SUPPORTS_REALITY.includes(protocol)
  const isAnyTLS = protocol === "anytls"

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {spec.supportsAllowInsecure
            ? t("nodes.inbound.fields.securityNoneAllowInsecureHint")
            : t("nodes.inbound.fields.securityNoneHint")}
        </p>
        {supportsStream && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              form.setValue("listen", "127.0.0.1", { shouldDirty: true })
              form.setValue("network", "ws", { shouldDirty: true })
              form.setValue("client_tls", true, { shouldDirty: true })
              form.setValue("client_port", 443, { shouldDirty: true })
            }}
          >
            <Cloud className="mr-1.5 size-3.5" />
            {t("nodes.inbound.fields.applyCfPreset")}
          </Button>
        )}
      </div>

      {supportsStream && (
        <>
          <FormField
            control={form.control}
            name="client_tls"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FormSwitchCard
                    label={t("nodes.inbound.fields.clientTls")}
                    description={t("nodes.inbound.fields.clientTlsDesc")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {clientTls && (
            <div className="space-y-3 pt-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="sni"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("nodes.inbound.fields.cfDomain")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="tunnel.example.com"
                          className="bg-background font-mono text-xs"
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
                          placeholder="443"
                          className="bg-background tabular-nums"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="listen"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("nodes.inbound.fields.listenAddr")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="127.0.0.1"
                          className="bg-background font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="client_server"
                render={({ field }) => (
                  <FormItem>
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

              <ClientEndpointApisEditor form={form} />

              <FormField
                control={form.control}
                name="cert_fingerprint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.customCertFingerprintOptional")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("nodes.inbound.fields.customCertFingerprintPlaceholder")}
                        className="bg-background font-mono text-xs"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="text-muted-foreground">
                    {t("nodes.inbound.fields.cfOriginUrl")}{" "}
                  </span>
                  <code className="font-mono font-medium text-foreground">
                    {`http://127.0.0.1:${listenPort}`}
                  </code>
                </div>
                <CopyButton value={`http://127.0.0.1:${listenPort}`} size="icon-sm" />
              </div>
            </div>
          )}
        </>
      )}

      {isAnyTLS && (
        <div className="space-y-3 pt-1">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="sni"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.clientSni")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("nodes.inbound.fields.clientSniPlaceholder")}
                      className="bg-background font-mono text-xs"
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
                      placeholder="443"
                      className="bg-background tabular-nums"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="listen"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.listenAddr")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0.0.0.0"
                      className="bg-background font-mono text-xs"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="client_server"
            render={({ field }) => (
              <FormItem>
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
            name="cert_fingerprint"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.customCertFingerprintOptional")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("nodes.inbound.fields.customCertFingerprintPlaceholder")}
                    className="bg-background font-mono text-xs"
                    {...field}
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

export function RealitySecuritySection({
  form,
  keygenLoading,
  onGenerateReality,
}: {
  form: UseFormReturn<InboundFormValues>
  keygenLoading: boolean
  onGenerateReality: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {t("nodes.inbound.fields.realityTitle")}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={keygenLoading}
          onClick={onGenerateReality}
        >
          <KeyRound className="mr-1.5 size-3.5" />
          {t("nodes.inbound.fields.generateKeypair")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="reality_dest"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.realityDest")}</FormLabel>
              <FormControl>
                <Input className="bg-background" placeholder="www.microsoft.com:443" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reality_server_names"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.realityServerNames")}</FormLabel>
              <FormControl>
                <Input className="bg-background" placeholder="www.microsoft.com" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reality_private_key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.realityPrivateKey")}</FormLabel>
              <FormControl>
                <Input className="bg-background font-mono text-xs" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reality_public_key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.realityPublicKey")}</FormLabel>
              <FormControl>
                <Input className="bg-background font-mono text-xs" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reality_short_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.realityShortIds")}</FormLabel>
              <FormControl>
                <Input
                  className="bg-background font-mono text-xs"
                  placeholder="a1b2c3d4"
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
    </div>
  )
}
