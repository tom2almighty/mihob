import type { UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getProtocolSpec,
  NEEDS_CERT_ALWAYS,
  SUPPORTS_OPTIONAL_TLS,
  SUPPORTS_REALITY,
} from "@/features/mihomo/registry"
import { ProtocolAuthSections } from "@/features/mihomo/security/ProtocolAuthSections"
import {
  NoneSecuritySection,
  RealitySecuritySection,
} from "@/features/mihomo/security/RealitySecuritySection"
import { TlsSecuritySection } from "@/features/mihomo/security/TlsSecuritySection"
import { OtherTransportSections } from "@/features/mihomo/transport/OtherTransportSections"
import { QuicTransportSections } from "@/features/mihomo/transport/QuicTransportSections"
import { StreamTransportSection } from "@/features/mihomo/transport/StreamTransportSection"
import type { Certificate } from "@/lib/types"
import type { InboundFormValues } from "./inboundSchema"

export { NEEDS_CERT_ALWAYS, SUPPORTS_OPTIONAL_TLS, SUPPORTS_REALITY }

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
  const spec = getProtocolSpec(protocol)

  const needsCert =
    spec.needsCertAlways ||
    ((spec.supportsReality || spec.supportsOptionalTls) && security === "tls")
  const isReality = spec.supportsReality && security === "reality"

  if (section === "security") {
    return (
      <div className="space-y-4">
        {spec.supportsReality && (
          <FormField
            control={form.control}
            name="security"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nodes.inbound.fields.security")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
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

        {spec.supportsOptionalTls && (
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
                    <SelectTrigger className="w-full">
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

        {(spec.supportsReality || spec.supportsOptionalTls) && security === "none" && (
          <NoneSecuritySection form={form} protocol={protocol} />
        )}

        {isReality && (
          <RealitySecuritySection
            form={form}
            keygenLoading={keygenLoading}
            onGenerateReality={onGenerateReality}
          />
        )}

        {needsCert && (
          <TlsSecuritySection form={form} certs={certs} protocol={protocol} security={security} />
        )}

        <ProtocolAuthSections
          form={form}
          protocol={protocol}
          keygenLoading={keygenLoading}
          onGenerateSSKey={onGenerateSSKey}
          onGenerateSecret={onGenerateSecret}
        />
      </div>
    )
  }

  // section === "transport"
  return (
    <div className="space-y-4">
      {spec.supportsStreamTransport && <StreamTransportSection form={form} protocol={protocol} />}
      <QuicTransportSections form={form} protocol={protocol} />
      <OtherTransportSections form={form} protocol={protocol} />
    </div>
  )
}
