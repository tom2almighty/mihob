import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import i18n from "@/lib/i18n"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "",
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[mihob] unhandled render error:", error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: "" })
    window.location.assign("/")
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-xs">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <h1 className="text-base font-semibold tracking-tight">
            {i18n.t("common.errorBoundary.title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {i18n.t("common.errorBoundary.description")}
          </p>
          {this.state.errorMessage && (
            <pre className="mt-4 max-h-28 overflow-auto rounded-lg border border-border bg-muted/40 p-2.5 text-left font-mono text-xs text-muted-foreground">
              {this.state.errorMessage}
            </pre>
          )}
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={this.handleGoHome}>
              {i18n.t("common.errorBoundary.backHome")}
            </Button>
            <Button type="button" size="sm" onClick={this.handleReload}>
              <RefreshCw className="mr-1.5 size-3.5" />
              {i18n.t("common.errorBoundary.reload")}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
