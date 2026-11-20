import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react"
import { useTheme } from "@/lib/theme"

const Toaster = ({ closeButton = true, toastOptions, ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      closeButton={closeButton}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
        close: <XIcon className="size-3.5" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: "cn-toast !pr-9",
          closeButton:
            "!left-auto !right-2 !top-1/2 !-translate-y-1/2 !translate-x-0 !size-6 !rounded-md !border-0 !bg-transparent !text-current opacity-60 transition-opacity hover:opacity-100 hover:!bg-foreground/10",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
