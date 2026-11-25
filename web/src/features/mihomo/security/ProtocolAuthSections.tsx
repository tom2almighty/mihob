import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { KeyRound } from "lucide-react"
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
import type { Protocol } from "@/lib/types"
import type { InboundFormValues } from "@/pages/nodes/inboundSchema"

export function ProtocolAuthSections({
  form,
  protocol,
  keygenLoading,
  onGenerateSSKey,
  onGenerateSecret,
}: {
  form: UseFormReturn<InboundFormValues>
  protocol: Protocol
  keygenLoading: boolean
  onGenerateSSKey: () => void
  onGenerateSecret: (field: "snell_psk" | "sudoku_key") => void
}) {
  const { t } = useTranslation()
  const ssCipher = form.watch("ss_cipher")

  return (
    <>
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
                    <SelectTrigger className="w-full bg-background">
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
                    className="bg-background tabular-nums"
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
                    className="bg-background font-mono text-xs"
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
                    className="bg-background font-mono text-xs"
                    placeholder={t("nodes.inbound.fields.vlessEncryptionPlaceholder")}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
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
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="2022-blake3-aes-128-gcm">2022-blake3-aes-128-gcm</SelectItem>
                    <SelectItem value="2022-blake3-aes-256-gcm">2022-blake3-aes-256-gcm</SelectItem>
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
                    <Input className="bg-background font-mono text-xs" {...field} />
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
          <div className="text-xs font-medium text-foreground">
            {t("nodes.inbound.fields.shadowquicJlsTitle")}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="shadowquic_jls_addr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nodes.inbound.fields.shadowquicJlsAddr")}</FormLabel>
                  <FormControl>
                    <Input
                      className="bg-background"
                      placeholder="www.microsoft.com:443"
                      {...field}
                    />
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
                    <Input className="bg-background" placeholder="www.microsoft.com" {...field} />
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
                    <Input
                      placeholder="DIRECT"
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
            name="shadowquic_zero_rtt"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FormSwitchCard
                    label={t("nodes.inbound.fields.shadowquicZeroRtt")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
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
                    <SelectTrigger className="w-full bg-background">
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
                  <Input className="bg-background font-mono text-xs" {...field} />
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
                  <Input className="bg-background font-mono text-xs" {...field} />
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
                  <Select value={field.value || "chacha20-poly1305"} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full bg-background">
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
                      <SelectTrigger className="w-full bg-background">
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
                    <Input
                      placeholder="xpxvvpvv"
                      className="bg-background font-mono text-xs"
                      {...field}
                    />
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
                      <SelectTrigger className="w-full bg-background">
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
    </>
  )
}
