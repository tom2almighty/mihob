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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
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
import { Textarea } from "@/components/ui/textarea"
import { api, queryKeys } from "@/lib/api"
import type { RuleSet } from "@/lib/types"

type RuleSetFormValues = {
  name: string
  behavior: "domain" | "ipcidr"
  description?: string
  rules_text: string
}

export function RuleSetFormDialog({
  open,
  onOpenChange,
  ruleSet,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ruleSet: RuleSet | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(ruleSet)

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("templates.rulesets.validation.nameRequired"))
          .regex(
            /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/,
            t("templates.rulesets.validation.namePattern")
          ),
        behavior: z.enum(["domain", "ipcidr"]),
        description: z.string().trim().optional(),
        rules_text: z.string().trim().min(1, t("templates.rulesets.validation.rulesRequired")),
      }),
    [t]
  )

  const form = useForm<RuleSetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      behavior: "domain",
      description: "",
      rules_text: "",
    },
  })

  useEffect(() => {
    if (!open) return
    if (ruleSet) {
      form.reset({
        name: ruleSet.name,
        behavior: ruleSet.behavior,
        description: ruleSet.description || "",
        rules_text: ruleSet.rules_text || "",
      })
    } else {
      form.reset({
        name: "",
        behavior: "domain",
        description: "",
        rules_text: "",
      })
    }
  }, [open, ruleSet, form])

  const mutation = useMutation({
    mutationFn: (v: RuleSetFormValues) =>
      isEdit && ruleSet ? api.updateRuleSet(ruleSet.id, v) : api.createRuleSet(v),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.ruleSets })
      if (res.last_error) {
        toast.warning(t("templates.rulesets.toastSavedCompileWarn", { error: res.last_error }))
      } else {
        toast.success(
          isEdit ? t("templates.rulesets.toastUpdated") : t("templates.rulesets.toastCreated")
        )
      }
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const behavior = form.watch("behavior")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        expandable
        className="flex h-[min(640px,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 pt-5 pr-20 pb-4">
          <DialogTitle>
            {isEdit ? t("templates.rulesets.editTitle") : t("templates.rulesets.createTitle")}
          </DialogTitle>
          <DialogDescription>{t("templates.rulesets.dialogDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="ruleset-form"
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templates.rulesets.name")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("templates.rulesets.namePlaceholder")}
                        className="font-mono text-xs sm:text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="behavior"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("templates.rulesets.behavior")}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange((v as "domain" | "ipcidr") || "domain")}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="domain">
                          {t("templates.rulesets.behaviorDomain")}
                        </SelectItem>
                        <SelectItem value="ipcidr">
                          {t("templates.rulesets.behaviorIpcidr")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("templates.form.description")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("templates.rulesets.descPlaceholder")} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rules_text"
              render={({ field }) => (
                <FormItem className="flex flex-1 flex-col">
                  <FormLabel>{t("templates.rulesets.rulesText")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={
                        behavior === "ipcidr"
                          ? "1.1.1.0/24\n8.8.8.8/32\n2606:4700::/32"
                          : "+.openai.com\n+.example.com\nwww.mydomain.org"
                      }
                      className="min-h-56 flex-1 font-mono text-xs leading-relaxed"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="ruleset-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("templates.rulesets.saveAndCompile")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
