import { useState, type KeyboardEvent } from "react"
import { Plus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  disabled,
  className,
}: {
  value: string[]
  onChange: (next: string[]) => void
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")

  const addTag = (raw: string) => {
    const parts = raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...value]
    for (const part of parts) {
      if (!next.some((item) => item.toLowerCase() === part.toLowerCase())) {
        next.push(part)
      }
    }
    onChange(next)
    setDraft("")
  }

  const removeTag = (target: string) => {
    onChange(value.filter((item) => item !== target))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(draft)
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const unusedSuggestions = suggestions.filter(
    (s) => s.trim() && !value.some((v) => v.toLowerCase() === s.toLowerCase())
  )

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-muted-foreground/30 bg-background/80 px-2.5 py-1.5 shadow-2xs transition-colors hover:border-muted-foreground/50 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:border-muted-foreground/35 dark:bg-background/50 dark:hover:border-muted-foreground/55">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={t("common.removeTag", { tag })}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}
        <Input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) addTag(draft)
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="h-6 min-w-27.5 flex-1 border-0 bg-transparent px-1 py-0 text-xs shadow-none focus-visible:ring-0"
        />
      </div>

      {unusedSuggestions.length > 0 && !disabled && (
        <div className="flex flex-wrap items-center gap-1">
          {unusedSuggestions.slice(0, 12).map((s) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
              onClick={() => addTag(s)}
            >
              <Plus className="size-2.5" />
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
