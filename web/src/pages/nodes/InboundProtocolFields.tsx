import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Cloud, KeyRound } from "lucide-react"
import { CopyButton } from "@/components/common/CommonUI"
import { Button } from "@/components/ui/button"
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Certificate, Protocol } from "@/lib/types"
import type { InboundFormValues } from "./inboundSchema"

export const NEEDS_CERT_ALWAYS: Protocol[] = ["hysteria2", "tuic", "anytls", "trusttunnel"]
export const SUPPORTS_REALITY: Protocol[] = ["vless", "vmess", "trojan"]
export const SUPPORTS_OPTIONAL_TLS: Protocol[] = ["http", "socks", "mixed"]

const FINGERPRINTS = [
  "chrome",
  "firefox",
  "safari",
  "ios",
  "android",
  "edge",
  "360",
  "qq",
  "random",
  "randomized",
] as const

export function InboundProtocolFields({
  form,
  certs,
  section,
  keygenLoading,
  onGenerateReality,
  onGenerateSSKey,
  onGenerateSecret,
}: {
  form: UseFormReturn<InboundFormValues>
  certs: Certificate[]
  section: "security" | "transport"
  keygenLoading: boolean
  onGenerateReality: () => void
  onGenerateSSKey: () => void
  onGenerateSecret: (field: "snell_psk" | "sudoku_key") => void
}) {
  const { t } = useTranslation()
  const protocol = form.watch("protocol")
  const security = form.watch("security")
  const network = form.watch("network")
  const ssCipher = form.watch("ss_cipher")
  const snellVersion = Number(form.watch("snell_version") || 4)
  const sudokuDisableMask = Boolean(form.watch("sudoku_disable_http_mask"))
  const clientTls = Boolean(form.watch("client_tls"))
  const listenPort = form.watch("port") || 443

  const needsCert =
    NEEDS_CERT_ALWAYS.includes(protocol) ||
    ((SUPPORTS_REALITY.includes(protocol) || SUPPORTS_OPTIONAL_TLS.includes(protocol)) &&
      security === "tls")
  const isReality = SUPPORTS_REALITY.includes(protocol) && security === "reality"

  if (section === "security") {
    return (
      <div className="space-y-4">
        {SUPPORTS_REALITY.includes(protocol) && (
          <FormField
            control={form.control}
            name="security"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.security")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="reality">
                      {t("nodes.inbound.fields.securityReality")}
                    </SelectItem>
                    <SelectItem value="tls">{t("nodes.inbound.fields.securityTls")}</SelectItem>
                    <SelectItem value="none">{t("nodes.inbound.fields.securityNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        {SUPPORTS_OPTIONAL_TLS.includes(protocol) && (
          <FormField
            control={form.control}
            name="security"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.security")}</FormLabel>
                <Select
                  value={field.value === "tls" ? "tls" : "none"}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="tls">{t("nodes.inbound.fields.securityTls")}</SelectItem>
                    <SelectItem value="none">{t("nodes.inbound.fields.securityNone")}</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        {(SUPPORTS_REALITY.includes(protocol) || SUPPORTS_OPTIONAL_TLS.includes(protocol)) &&
          security === "none" && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("nodes.inbound.fields.securityNoneHint")}
                </p>
                {SUPPORTS_REALITY.includes(protocol) && (
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

              {SUPPORTS_REALITY.includes(protocol) && (
                <>
                  <FormField
                    control={form.control}
                    name="client_tls"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                        <div className="space-y-0.5">
                          <FormLabel className="text-xs">
                            {t("nodes.inbound.fields.clientTls")}
                          </FormLabel>
                          <FormDescription className="text-[11px]">
                            {t("nodes.inbound.fields.clientTlsDesc")}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {clientTls && (
                    <div className="space-y-3 pt-1">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="sni"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("nodes.inbound.fields.cfDomain")}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="tunnel.example.com"
                                  className="font-mono text-xs"
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="client_server"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("nodes.inbound.fields.clientServer")}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={t("nodes.inbound.fields.clientServerPlaceholder")}
                                  className="font-mono text-xs"
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
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
                                  className="tabular-nums"
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
                                  className="font-mono text-xs"
                                  {...field}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

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
            </div>
          )}

        {isReality && (
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
                      <Input placeholder="www.microsoft.com:443" {...field} />
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
                      <Input placeholder="www.microsoft.com" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="reality_private_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.realityPrivateKey")}</FormLabel>
                    <FormControl>
                      <Input className="font-mono text-xs" {...field} />
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
                      <Input className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="reality_short_ids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.realityShortIds")}</FormLabel>
                    <FormControl>
                      <Input className="font-mono text-xs" placeholder="a1b2c3d4" {...field} />
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
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="default">
                          {t("nodes.inbound.fields.bbrDefault")}
                        </SelectItem>
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
        )}

        {protocol === "vmess" && (
          <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="cipher"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.vmessCipher")}</FormLabel>
                  <Select value={field.value || "auto"} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="aes-128-gcm">aes-128-gcm</SelectItem>
                      <SelectItem value="chacha20-poly1305">chacha20-poly1305</SelectItem>
                      <SelectItem value="none">none</SelectItem>
                      <SelectItem value="zero">zero</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="alter_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.vmessAlterId")}</FormLabel>
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
        )}

        {protocol === "vless" && (
          <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="vless_decryption"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.vlessDecryption")}</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono text-xs"
                      placeholder={t("nodes.inbound.fields.vlessDecryptionPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vless_encryption"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.vlessEncryption")}</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono text-xs"
                      placeholder={t("nodes.inbound.fields.vlessEncryptionPlaceholder")}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        )}

        {needsCert && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="cert_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.bindCert")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("nodes.inbound.fields.selectCertPlaceholder")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("nodes.inbound.fields.noCertSelected")}
                      </SelectItem>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sni"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.clientSni")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("nodes.inbound.fields.clientSniPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="skip_cert_verify"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <FormLabel className="text-xs">
                      {t("nodes.inbound.fields.skipCertVerify")}
                    </FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                        className="font-mono text-xs"
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
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="default">
                          {t("nodes.inbound.fields.bbrDefault")}
                        </SelectItem>
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

            {SUPPORTS_REALITY.includes(protocol) && security === "tls" && (
              <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="client_server"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("nodes.inbound.fields.clientServer")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("nodes.inbound.fields.clientServerPlaceholder")}
                          className="font-mono text-xs"
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
                          className="tabular-nums"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="space-y-3 border-t border-border pt-3">
              <div className="text-xs font-medium text-foreground">
                {t("nodes.inbound.fields.echTitle")}
              </div>
              <FormField
                control={form.control}
                name="ech_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.echKey")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        className="font-mono text-xs"
                        placeholder="-----BEGIN ECH KEYS-----"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="ech_enable"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                      <FormLabel className="text-xs">
                        {t("nodes.inbound.fields.echEnable")}
                      </FormLabel>
                      <FormControl>
                        <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
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
                        <Input className="font-mono text-xs" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
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
                          <SelectTrigger>
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
                        <Input className="font-mono text-xs" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {protocol === "shadowsocks" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="ss_cipher"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.ssCipher")}</FormLabel>
                  <Select
                    value={field.value || "2022-blake3-aes-128-gcm"}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="2022-blake3-aes-128-gcm">
                        2022-blake3-aes-128-gcm
                      </SelectItem>
                      <SelectItem value="2022-blake3-aes-256-gcm">
                        2022-blake3-aes-256-gcm
                      </SelectItem>
                      <SelectItem value="aes-256-gcm">aes-256-gcm</SelectItem>
                      <SelectItem value="chacha20-ietf-poly1305">chacha20-ietf-poly1305</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            {(ssCipher || "").startsWith("2022-") && (
              <FormField
                control={form.control}
                name="ss_server_password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>{t("nodes.inbound.fields.ssServerPassword")}</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={keygenLoading}
                        onClick={onGenerateSSKey}
                      >
                        <KeyRound className="mr-1.5 size-3.5" />
                        {t("nodes.inbound.fields.generatePsk")}
                      </Button>
                    </div>
                    <FormControl>
                      <Input className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {protocol === "mieru" && (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {t("nodes.inbound.fields.mieruSecurityHint")}
          </p>
        )}

        {protocol === "shadowquic" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <span className="text-xs font-medium text-foreground">
              {t("nodes.inbound.fields.shadowquicJlsTitle")}
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="shadowquic_jls_addr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.shadowquicJlsAddr")}</FormLabel>
                    <FormControl>
                      <Input placeholder="www.microsoft.com:443" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shadowquic_jls_sni"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.shadowquicJlsSni")}</FormLabel>
                    <FormControl>
                      <Input placeholder="www.microsoft.com" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shadowquic_jls_proxy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.shadowquicJlsProxy")}</FormLabel>
                    <FormControl>
                      <Input placeholder="DIRECT" className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shadowquic_zero_rtt"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <FormLabel className="text-xs">
                      {t("nodes.inbound.fields.shadowquicZeroRtt")}
                    </FormLabel>
                    <FormControl>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {protocol === "snell" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="snell_version"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.snellVersion")}</FormLabel>
                  <Select
                    value={String(field.value || 4)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="6">v6</SelectItem>
                      <SelectItem value="5">v5</SelectItem>
                      <SelectItem value="4">v4</SelectItem>
                      <SelectItem value="3">v3</SelectItem>
                      <SelectItem value="2">v2</SelectItem>
                      <SelectItem value="1">v1</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="snell_psk"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("nodes.inbound.fields.snellPsk")}</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={keygenLoading}
                      onClick={() => onGenerateSecret("snell_psk")}
                    >
                      <KeyRound className="mr-1.5 size-3.5" />
                      {t("nodes.inbound.fields.generatePsk")}
                    </Button>
                  </div>
                  <FormControl>
                    <Input className="font-mono text-xs" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <p className="text-xs text-muted-foreground">
              {t("nodes.inbound.fields.sharedSecretHint")}
            </p>
          </div>
        )}

        {protocol === "sudoku" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <FormField
              control={form.control}
              name="sudoku_key"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>{t("nodes.inbound.fields.sudokuKey")}</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={keygenLoading}
                      onClick={() => onGenerateSecret("sudoku_key")}
                    >
                      <KeyRound className="mr-1.5 size-3.5" />
                      {t("nodes.inbound.fields.generateKey")}
                    </Button>
                  </div>
                  <FormControl>
                    <Input className="font-mono text-xs" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sudoku_aead_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuAead")}</FormLabel>
                    <Select
                      value={field.value || "chacha20-poly1305"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="chacha20-poly1305">chacha20-poly1305</SelectItem>
                        <SelectItem value="aes-128-gcm">aes-128-gcm</SelectItem>
                        <SelectItem value="none">none</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sudoku_table_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuTableType")}</FormLabel>
                    <Select value={field.value || "prefer_ascii"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="prefer_ascii">prefer_ascii</SelectItem>
                        <SelectItem value="prefer_entropy">prefer_entropy</SelectItem>
                        <SelectItem value="up_ascii_down_entropy">up_ascii_down_entropy</SelectItem>
                        <SelectItem value="up_entropy_down_ascii">up_entropy_down_ascii</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sudoku_custom_table"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuCustomTable")}</FormLabel>
                    <FormControl>
                      <Input placeholder="xpxvvpvv" className="font-mono text-xs" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sudoku_multiplex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuMultiplex")}</FormLabel>
                    <Select
                      value={field.value || "default"}
                      onValueChange={(v) => field.onChange(v === "default" ? "" : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="default">
                          {t("nodes.inbound.fields.bbrDefault")}
                        </SelectItem>
                        <SelectItem value="off">off</SelectItem>
                        <SelectItem value="auto">auto</SelectItem>
                        <SelectItem value="on">on</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("nodes.inbound.fields.sharedSecretHint")}
            </p>
          </div>
        )}
      </div>
    )
  }

  // section === "transport"
  return (
    <div className="space-y-4">
      {SUPPORTS_REALITY.includes(protocol) && (
        <FormField
          control={form.control}
          name="network"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.transport")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
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
      )}

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
                  <SelectTrigger>
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

      {SUPPORTS_REALITY.includes(protocol) && network === "ws" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="ws_path"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.wsPath")}</FormLabel>
                <FormControl>
                  <Input placeholder="/ws" {...field} />
                </FormControl>
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

      {SUPPORTS_REALITY.includes(protocol) && network === "grpc" && (
        <FormField
          control={form.control}
          name="grpc_service_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nodes.inbound.fields.grpcService")}</FormLabel>
              <FormControl>
                <Input placeholder="GunService" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      )}

      {protocol === "vless" && network === "xhttp" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="xhttp_path"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.xhttpPath")}</FormLabel>
                  <FormControl>
                    <Input placeholder="/xhttp" {...field} />
                  </FormControl>
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
                      <SelectTrigger>
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
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <FormField
              control={form.control}
              name="xhttp_no_sse_header"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <FormLabel className="text-xs">
                    {t("nodes.inbound.fields.xhttpNoSseHeader")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
      )}

      {protocol === "hysteria2" && (
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
                      <SelectTrigger>
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="default">
                        {t("nodes.inbound.fields.bbrDefault")}
                      </SelectItem>
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
              <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <FormLabel className="text-xs">
                  {t("nodes.inbound.fields.ignoreClientBandwidth")}
                </FormLabel>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "tuic" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="congestion_controller"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.congestion")}</FormLabel>
                <Select value={field.value || "bbr"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
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
                    <SelectTrigger>
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
      )}

      {protocol === "anytls" && (
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
      )}

      {protocol === "mieru" && (
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
                      <SelectTrigger>
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
                      <SelectTrigger>
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="default">
                        {t("nodes.inbound.fields.bbrDefault")}
                      </SelectItem>
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
            <FormField
              control={form.control}
              name="mieru_user_hint_mandatory"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <FormLabel className="text-xs">
                    {t("nodes.inbound.fields.mieruUserHintMandatory")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
      )}

      {protocol === "trusttunnel" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="trusttunnel_network"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.trusttunnelNetwork")}</FormLabel>
                <Select value={field.value || "both"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="both">
                      {t("nodes.inbound.fields.trusttunnelBoth")}
                    </SelectItem>
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
                    <SelectTrigger>
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
            name="trusttunnel_min_streams"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.trusttunnelMinStreams")}</FormLabel>
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
            name="trusttunnel_max_streams"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.trusttunnelMaxStreams")}</FormLabel>
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
      )}

      {protocol === "shadowquic" && (
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="bbr">
                        {t("nodes.inbound.fields.bbrRecommended")}
                      </SelectItem>
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
              <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <FormLabel className="text-xs">
                  {t("nodes.inbound.fields.ignoreClientBandwidth")}
                </FormLabel>
                <FormControl>
                  <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {protocol === "snell" &&
        (snellVersion === 6 ? (
          <FormField
            control={form.control}
            name="snell_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.snellMode")}</FormLabel>
                <Select value={field.value || "default"} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
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
                      <SelectTrigger>
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
        ))}

      {protocol === "sudoku" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sudoku_disable_http_mask"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <FormLabel className="text-xs">
                    {t("nodes.inbound.fields.sudokuDisableMask")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sudoku_enable_pure_downlink"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <FormLabel className="text-xs">
                    {t("nodes.inbound.fields.sudokuPureDownlink")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          {!sudokuDisableMask && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="sudoku_http_mask_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nodes.inbound.fields.sudokuMaskMode")}</FormLabel>
                    <Select value={field.value || "legacy"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
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
              <FormField
                control={form.control}
                name="sudoku_http_mask_tls"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                    <FormLabel className="text-xs">
                      {t("nodes.inbound.fields.sudokuMaskTls")}
                    </FormLabel>
                    <FormControl>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
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
      )}

      {(protocol === "shadowsocks" || SUPPORTS_OPTIONAL_TLS.includes(protocol)) && (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("nodes.inbound.fields.noExtraTransport")}
        </p>
      )}
    </div>
  )
}
