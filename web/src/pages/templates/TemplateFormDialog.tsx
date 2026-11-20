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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, queryKeys } from "@/lib/api"
import type { Template } from "@/lib/types"

type TemplateFormValues = {
  name: string
  description?: string
  content: string
  is_default: boolean
}

const STARTER_YAML = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: true

proxies:
{{PROXIES}}

proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
{{PROXY_NAMES}}
      - DIRECT

rules:
  - GEOIP,LAN,DIRECT,no-resolve
  - GEOIP,CN,DIRECT,no-resolve
  - MATCH,Proxy
`

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: Template | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(template)

  const templateSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("templates.form.validation.nameRequired")),
        description: z.string().trim().optional(),
        content: z.string().min(10, t("templates.form.validation.contentMin")),
        is_default: z.boolean(),
      }),
    [t]
  )

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      content: STARTER_YAML,
      is_default: false,
    },
  })

  useEffect(() => {
    if (!open) return
    if (template) {
      form.reset({
        name: template.name,
        description: template.description || "",
        content: template.content,
        is_default: template.is_default,
      })
    } else {
      form.reset({
        name: "",
        description: "",
        content: STARTER_YAML,
        is_default: false,
      })
    }
  }, [open, template, form])

  const mutation = useMutation({
    mutationFn: (v: TemplateFormValues) =>
      isEdit && template ? api.updateTemplate(template.id, v) : api.createTemplate(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.templates })
      toast.success(isEdit ? t("templates.toastUpdated") : t("templates.toastCreated"))
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-5 pt-5 pb-4">
          <SheetTitle>
            {isEdit ? t("templates.form.editTitle") : t("templates.form.createTitle")}
          </SheetTitle>
          <SheetDescription>
            {t("templates.form.descBefore")}{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{"{{PROXIES}}"}</code>{" "}
            {t("templates.form.descMiddle")}{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {"{{PROXY_NAMES}}"}
            </code>{" "}
            {t("templates.form.descAfter")}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            id="template-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templates.form.name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("templates.form.namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templates.form.description")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("templates.form.descriptionPlaceholder")} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("templates.form.content")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={16}
                      spellCheck={false}
                      className="font-mono text-xs leading-relaxed"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("templates.form.setDefault")}</FormLabel>
                    <FormDescription>{t("templates.form.setDefaultDesc")}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="template-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("templates.form.saveTemplate")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
