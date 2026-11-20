import { useEffect, useMemo } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, queryKeys } from "@/lib/api"

type CertFormValues = {
  name: string
  source: "acme" | "self_signed" | "manual"
  domain?: string
  sans?: string
  acme_provider: "cloudflare" | "alidns" | "dnspod" | "http"
  acme_email?: string
  auto_renew: boolean
  cf_api_token?: string
  ali_access_key?: string
  ali_secret_key?: string
  dnspod_token?: string
  valid_days?: number
  cert_pem?: string
  key_pem?: string
}

export function CertFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const certSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("certificates.form.validation.nameRequired")),
        source: z.enum(["acme", "self_signed", "manual"]),
        domain: z.string().trim().optional(),
        sans: z.string().trim().optional(),
        acme_provider: z.enum(["cloudflare", "alidns", "dnspod", "http"]),
        acme_email: z.string().trim().optional(),
        auto_renew: z.boolean(),
        cf_api_token: z.string().trim().optional(),
        ali_access_key: z.string().trim().optional(),
        ali_secret_key: z.string().trim().optional(),
        dnspod_token: z.string().trim().optional(),
        valid_days: z.coerce.number().int().min(1).max(3650).optional(),
        cert_pem: z.string().optional(),
        key_pem: z.string().optional(),
      }),
    [t]
  )

  const form = useForm<CertFormValues>({
    resolver: zodResolver(certSchema),
    defaultValues: {
      name: "",
      source: "acme",
      domain: "",
      sans: "",
      acme_provider: "cloudflare",
      acme_email: "",
      auto_renew: true,
      cf_api_token: "",
      ali_access_key: "",
      ali_secret_key: "",
      dnspod_token: "",
      valid_days: 3650,
      cert_pem: "",
      key_pem: "",
    },
  })

  useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  const source = form.watch("source")
  const provider = form.watch("acme_provider")

  const mutation = useMutation({
    mutationFn: (v: CertFormValues) => {
      const sans = (v.sans || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)

      const creds: Record<string, string> = {}
      if (v.source === "acme") {
        if (v.acme_provider === "cloudflare" && v.cf_api_token) {
          creds.api_token = v.cf_api_token
        } else if (v.acme_provider === "alidns") {
          creds.access_key = v.ali_access_key || ""
          creds.secret_key = v.ali_secret_key || ""
        } else if (v.acme_provider === "dnspod") {
          creds.login_token = v.dnspod_token || ""
        }
      }

      return api.createCertificate({
        name: v.name,
        source: v.source,
        domain: v.domain || "",
        sans,
        acme_provider: v.source === "acme" ? v.acme_provider : "",
        acme_email: v.source === "acme" ? v.acme_email || "" : "",
        acme_credentials: creds,
        auto_renew: v.source === "acme" ? v.auto_renew : false,
        valid_days: v.valid_days,
        cert_pem: v.cert_pem,
        key_pem: v.key_pem,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.certificates })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      toast.success(t("certificates.toastCreated"))
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" expandable className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 pt-5 pr-20 pb-4">
          <SheetTitle>{t("certificates.form.title")}</SheetTitle>
          <SheetDescription>{t("certificates.form.desc")}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id="cert-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs
              value={source}
              onValueChange={(val) => form.setValue("source", val as CertFormValues["source"])}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="border-b border-border px-5 py-3">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="acme">{t("certificates.form.optAcme")}</TabsTrigger>
                  <TabsTrigger value="self_signed">{t("certificates.form.optSelfSigned")}</TabsTrigger>
                  <TabsTrigger value="manual">{t("certificates.form.optManual")}</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="space-y-4 group-data-[expanded=true]/sheet:mx-auto group-data-[expanded=true]/sheet:w-full group-data-[expanded=true]/sheet:max-w-3xl">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("certificates.form.name")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("certificates.form.namePlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="domain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {source === "manual"
                            ? t("certificates.form.domainOptional")
                            : t("certificates.form.domain")}
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t("certificates.form.domainPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {source !== "manual" && (
                  <FormField
                    control={form.control}
                    name="sans"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("certificates.form.sans")}</FormLabel>
                        <FormControl>
                          <Input placeholder="jp.example.com, hk.example.com" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {source === "acme" && (
                  <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="acme_provider"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("certificates.form.provider")}</FormLabel>
                            <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="cloudflare">
                                  {t("certificates.form.providerCloudflare")}
                                </SelectItem>
                                <SelectItem value="alidns">
                                  {t("certificates.form.providerAlidns")}
                                </SelectItem>
                                <SelectItem value="dnspod">
                                  {t("certificates.form.providerDnspod")}
                                </SelectItem>
                                <SelectItem value="http">
                                  {t("certificates.form.providerHttp")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="acme_email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("certificates.form.acmeEmail")}</FormLabel>
                            <FormControl>
                              <Input placeholder="admin@example.com" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {provider === "cloudflare" && (
                      <FormField
                        control={form.control}
                        name="cf_api_token"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("certificates.form.cfToken")}</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder={t("certificates.form.cfTokenPlaceholder")}
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}

                    {provider === "alidns" && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="ali_access_key"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("certificates.form.aliAccessKey")}</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="ali_secret_key"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("certificates.form.aliSecretKey")}</FormLabel>
                              <FormControl>
                                <Input type="password" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {provider === "dnspod" && (
                      <FormField
                        control={form.control}
                        name="dnspod_token"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("certificates.form.dnspodToken")}</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="123456,abcdef..." {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}

                    {provider === "http" && (
                      <p className="text-xs text-muted-foreground">{t("certificates.form.httpHint")}</p>
                    )}

                    <FormField
                      control={form.control}
                      name="auto_renew"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                          <div>
                            <FormLabel className="text-xs">{t("certificates.form.autoRenew")}</FormLabel>
                            <FormDescription className="text-xs">
                              {t("certificates.form.autoRenewDesc")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {source === "self_signed" && (
                  <FormField
                    control={form.control}
                    name="valid_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("certificates.form.validDays")}</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} max={3650} className="tabular-nums" {...field} />
                        </FormControl>
                        <FormDescription>{t("certificates.form.validDaysDesc")}</FormDescription>
                      </FormItem>
                    )}
                  />
                )}

                {source === "manual" && (
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="cert_pem"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("certificates.form.certPem")}</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={4}
                              className="font-mono text-xs"
                              placeholder="-----BEGIN CERTIFICATE-----"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="key_pem"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("certificates.form.keyPem")}</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={4}
                              className="font-mono text-xs"
                              placeholder="-----BEGIN PRIVATE KEY-----"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                </div>
              </div>
            </Tabs>
          </form>
        </Form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="cert-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {source === "acme"
              ? t("certificates.form.submitAcme")
              : source === "self_signed"
                ? t("certificates.form.submitSelfSigned")
                : t("certificates.form.submitManual")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
