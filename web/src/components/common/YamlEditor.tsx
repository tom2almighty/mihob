import { useMemo, useRef, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"

function highlightScalar(raw: string, keyPrefix: string): ReactNode {
  if (!raw) return null

  // Leading whitespace
  const leadMatch = /^(\s*)(.*)$/.exec(raw)
  const lead = leadMatch ? leadMatch[1] : ""
  const rest = leadMatch ? leadMatch[2] : raw

  if (!rest) return lead

  // Inline comment (outside quotes)
  let valuePart = rest
  let commentPart = ""
  if (!rest.startsWith('"') && !rest.startsWith("'")) {
    const hashIdx = rest.indexOf(" #")
    if (hashIdx !== -1) {
      valuePart = rest.slice(0, hashIdx)
      commentPart = rest.slice(hashIdx)
    }
  }

  const trimmed = valuePart.trim()
  let styledVal: ReactNode

  if (/^\{\{[A-Z0-9_]+\}\}$/.test(trimmed)) {
    styledVal = (
      <span className="rounded bg-info/15 px-0.5 font-semibold text-info">{valuePart}</span>
    )
  } else if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    styledVal = <span className="text-success">{valuePart}</span>
  } else if (/^(true|false|yes|no|null|~)$/i.test(trimmed)) {
    styledVal = <span className="font-medium text-warning">{valuePart}</span>
  } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    styledVal = <span className="text-chart-1">{valuePart}</span>
  } else {
    styledVal = <span className="text-foreground">{valuePart}</span>
  }

  return (
    <span key={keyPrefix}>
      {lead}
      {styledVal}
      {commentPart && <span className="italic text-muted-foreground">{commentPart}</span>}
    </span>
  )
}

function highlightYamlLine(line: string, lineIndex: number): ReactNode {
  if (line === "") return "\n"

  // Full-line comment
  if (/^\s*#/.test(line)) {
    return (
      <span key={lineIndex} className="italic text-muted-foreground">
        {line}
        {"\n"}
      </span>
    )
  }

  // Standalone template placeholder line like {{PROXIES}} or {{PROXY_NAMES}}
  const placeholderMatch = /^(\s*)(\{\{[A-Z0-9_]+\}\})(\s*)$/.exec(line)
  if (placeholderMatch) {
    return (
      <span key={lineIndex}>
        {placeholderMatch[1]}
        <span className="rounded bg-info/15 px-0.5 font-semibold text-info">
          {placeholderMatch[2]}
        </span>
        {placeholderMatch[3]}
        {"\n"}
      </span>
    )
  }

  // Document separator --- or ...
  if (/^(---|\.\.\.)\s*$/.test(line)) {
    return (
      <span key={lineIndex} className="font-semibold text-muted-foreground">
        {line}
        {"\n"}
      </span>
    )
  }

  // List item + optional key: value, e.g. "  - name: value" or "  - item"
  const listMatch = /^(\s*)(-)(\s+)(.*)$/.exec(line)
  if (listMatch) {
    const [, indent, dash, space, afterDash] = listMatch
    const kvMatch = /^([^:#\s][^:#]*?)(:)(\s.*|$)$/.exec(afterDash)
    if (kvMatch) {
      return (
        <span key={lineIndex}>
          {indent}
          <span className="font-semibold text-muted-foreground">{dash}</span>
          {space}
          <span className="font-medium text-info">{kvMatch[1]}</span>
          <span className="text-muted-foreground">{kvMatch[2]}</span>
          {highlightScalar(kvMatch[3], `${lineIndex}-lv`)}
          {"\n"}
        </span>
      )
    }
    return (
      <span key={lineIndex}>
        {indent}
        <span className="font-semibold text-muted-foreground">{dash}</span>
        {space}
        {highlightScalar(afterDash, `${lineIndex}-li`)}
        {"\n"}
      </span>
    )
  }

  // Standard key: value
  const kvMatch = /^(\s*)([^:#\s][^:#]*?)(:)(\s.*|$)$/.exec(line)
  if (kvMatch) {
    return (
      <span key={lineIndex}>
        {kvMatch[1]}
        <span className="font-medium text-info">{kvMatch[2]}</span>
        <span className="text-muted-foreground">{kvMatch[3]}</span>
        {highlightScalar(kvMatch[4], `${lineIndex}-v`)}
        {"\n"}
      </span>
    )
  }

  return (
    <span key={lineIndex}>
      {highlightScalar(line, `${lineIndex}-raw`)}
      {"\n"}
    </span>
  )
}

export function highlightYaml(code: string): ReactNode[] {
  return code.split("\n").map((line, i) => highlightYamlLine(line, i))
}

export function YamlCodeBlock({ value, className }: { value: string; className?: string }) {
  const highlighted = useMemo(() => highlightYaml(value), [value])

  return (
    <pre
      className={cn(
        "overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground",
        className
      )}
    >
      <code>{highlighted}</code>
    </pre>
  )
}

export function YamlEditor({
  value,
  onChange,
  onBlur,
  name,
  placeholder,
  className,
  minHeightClass = "min-h-[360px]",
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  name?: string
  placeholder?: string
  className?: string
  minHeightClass?: string
}) {
  const preRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const lines = useMemo(() => value.split("\n"), [value])
  const highlighted = useMemo(() => lines.map((line, i) => highlightYamlLine(line, i)), [lines])

  const syncScroll = () => {
    const ta = textareaRef.current
    if (!ta) return
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop
      preRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = `${value.slice(0, start)}  ${value.slice(end)}`
      onChange(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }

  return (
    <div
      className={cn(
        "relative flex w-full overflow-hidden rounded-md border border-input bg-muted/30 font-mono text-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        minHeightClass,
        className
      )}
    >
      {/* Line numbers gutter */}
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="w-10 shrink-0 select-none overflow-hidden border-r border-border/60 bg-muted/40 py-3 pr-2 text-right leading-5 text-muted-foreground/60 tabular-nums"
      >
        {lines.map((_, idx) => (
          <div key={idx}>{idx + 1}</div>
        ))}
      </div>

      {/* Synchronized Highlight + Transparent Textarea */}
      <div className="relative min-w-0 flex-1">
        <pre
          ref={preRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-3 font-mono text-xs leading-5"
        >
          <code>{highlighted}</code>
        </pre>

        <textarea
          ref={textareaRef}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="relative z-10 block h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-3 font-mono text-xs leading-5 text-transparent caret-foreground outline-none selection:bg-primary/20"
        />
      </div>
    </div>
  )
}
