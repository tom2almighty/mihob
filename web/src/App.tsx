import { lazy, Suspense, type ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider, useAuth } from "@/lib/auth"
import { ThemeProvider } from "@/lib/theme"

// Route-level code splitting: each page is fetched on first visit.
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))
)
const NodesPage = lazy(() => import("@/pages/NodesPage").then((m) => ({ default: m.NodesPage })))
const CertificatesPage = lazy(() =>
  import("@/pages/CertificatesPage").then((m) => ({ default: m.CertificatesPage }))
)
const UsersPage = lazy(() => import("@/pages/UsersPage").then((m) => ({ default: m.UsersPage })))
const TemplatesPage = lazy(() =>
  import("@/pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage }))
)
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
)
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })))
const SubscriptionPage = lazy(() =>
  import("@/pages/SubscriptionPage").then((m) => ({ default: m.SubscriptionPage }))
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
})

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
    </div>
  )
}

function ProtectedPage({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth()

  if (isLoading) return <FullScreenLoader />
  if (!token) return <Navigate to="/login" replace />

  // Suspense lives inside the shell so the sidebar/header stay mounted while a page chunk loads.
  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </AppShell>
  )
}

const PROTECTED_ROUTES: { path: string; element: ReactNode }[] = [
  { path: "/", element: <DashboardPage /> },
  { path: "/nodes", element: <NodesPage /> },
  { path: "/certificates", element: <CertificatesPage /> },
  { path: "/users", element: <UsersPage /> },
  { path: "/templates", element: <TemplatesPage /> },
  { path: "/settings", element: <SettingsPage /> },
]

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delay={200}>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<FullScreenLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  {PROTECTED_ROUTES.map((r) => (
                    <Route
                      key={r.path}
                      path={r.path}
                      element={<ProtectedPage>{r.element}</ProtectedPage>}
                    />
                  ))}
                  {/* Dynamic subscription paths (e.g. /sub/{token} or /{custom_sub_path}/{token}) */}
                  <Route path="*" element={<SubscriptionPage />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
