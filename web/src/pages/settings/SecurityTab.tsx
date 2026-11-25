import { useMemo } from "react"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { PasswordInput } from "@/components/common/FormControls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import { api, setStoredToken } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

function getPasswordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10 && /[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++
  if (pw.length >= 12 && /[^a-zA-Z0-9]/.test(pw)) score++
  return Math.max(1, Math.min(3, score)) as 1 | 2 | 3
}

type PasswordFormValues = {
  old_password: string
  new_password: string
  confirm_password: string
}

export function SecurityTab() {
  const { t } = useTranslation()
  const { admin } = useAuth()

  const schema = useMemo(
    () =>
      z
        .object({
          old_password: z.string().min(1, t("settings.validation.oldPwRequired")),
          new_password: z.string().min(6, t("settings.validation.newPwMin")),
          confirm_password: z.string().min(1, t("settings.validation.confirmPwRequired")),
        })
        .refine((d) => d.new_password === d.confirm_password, {
          message: t("settings.validation.pwMismatch"),
          path: ["confirm_password"],
        }),
    [t]
  )

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      old_password: "",
      new_password: "",
      confirm_password: "",
    },
  })

  const pwMutation = useMutation({
    mutationFn: (v: PasswordFormValues) =>
      api.changePassword({ old_password: v.old_password, new_password: v.new_password }),
    onSuccess: (res) => {
      if (res.token) {
        setStoredToken(res.token)
      }
      form.reset()
      toast.success(t("settings.toastPwUpdated"))
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const watchedNewPw = form.watch("new_password")
  const pwStrength = getPasswordStrength(watchedNewPw || "")

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">{t("settings.pwCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.pwCardDesc")}</p>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {(admin?.username || "A").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{t("settings.currentAccountLabel")}</div>
            <div className="font-mono text-sm font-medium text-foreground">
              {admin?.username || "admin"}
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs font-normal">
          {t("settings.adminRoleBadge")}
        </Badge>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => pwMutation.mutate(v))} className="space-y-5">
          <FormField
            control={form.control}
            name="old_password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.oldPassword")}</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.newPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirm_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.confirmPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {pwStrength > 0 && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      pwStrength >= step
                        ? pwStrength === 1
                          ? "bg-destructive"
                          : pwStrength === 2
                            ? "bg-warning"
                            : "bg-success"
                        : "bg-muted"
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {pwStrength === 1
                  ? t("settings.pwStrengthWeak")
                  : pwStrength === 2
                    ? t("settings.pwStrengthMedium")
                    : t("settings.pwStrengthStrong")}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end border-t border-border pt-4">
            <Button type="submit" size="sm" disabled={pwMutation.isPending}>
              {pwMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t("settings.updatePassword")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
