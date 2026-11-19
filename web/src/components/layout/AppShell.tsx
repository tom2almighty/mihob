import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useMatch, useNavigate } from "react-router-dom"
import {
  Check,
  FileCode2,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/lib/auth"
import { normalizeLanguage, type SupportedLanguage } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

const SIDEBAR_STORAGE_KEY = "mihob_sidebar_collapsed"

const NAV_ITEMS = [
  { to: "/", labelKey: "nav.dashboard" as const, icon: LayoutDashboard, end: true },
  { to: "/nodes", labelKey: "nav.nodes" as const, icon: Server },
  { to: "/certificates", labelKey: "nav.certificates" as const, icon: ShieldCheck },
  { to: "/users", labelKey: "nav.users" as const, icon: Users },
  { to: "/templates", labelKey: "nav.templates" as const, icon: FileCode2 },
  { to: "/settings", labelKey: "nav.settings" as const, icon: Settings },
]

type NavItem = (typeof NAV_ITEMS)[number]

function SidebarNavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  // Resolve active state here so className stays a plain string.
  // Radix Slot (used by TooltipTrigger asChild) cannot merge function classNames.
  const isActive = Boolean(useMatch({ path: item.to, end: "end" in item ? item.end : false }))
  const Icon = item.icon
  const label = t(item.labelKey)

  const link = (
    <NavLink
      to={item.to}
      end={"end" in item ? item.end : undefined}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "flex shrink-0 items-center rounded-md text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "size-10 justify-center" : "h-9 gap-2.5 px-3",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()

  return (
    <nav
      className={cn("flex flex-1 flex-col gap-1 py-4", collapsed ? "items-center" : "px-3")}
      aria-label={t("nav.ariaLabel")}
    >
      {NAV_ITEMS.map((item) => (
        <SidebarNavItem key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = normalizeLanguage(i18n.resolvedLanguage || i18n.language)

  const changeLang = (lng: SupportedLanguage) => {
    void i18n.changeLanguage(lng)
  }

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("nav.languageAria")}>
              <Languages className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("nav.languageTooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => changeLang("zh-CN")}>
          <span className="flex-1">{t("nav.langZh")}</span>
          {current === "zh-CN" && <Check className="ml-2 size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLang("en-US")}>
          <span className="flex-1">{t("nav.langEn")}</span>
          {current === "en-US" && <Check className="ml-2 size-3.5" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThemeSwitcher() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("nav.themeAria")}>
              {theme === "dark" ? (
                <Moon className="size-4" />
              ) : theme === "light" ? (
                <Sun className="size-4" />
              ) : (
                <Monitor className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("nav.themeTooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 size-4" />
          <span className="flex-1">{t("nav.themeLight")}</span>
          {theme === "light" && <Check className="ml-2 size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 size-4" />
          <span className="flex-1">{t("nav.themeDark")}</span>
          {theme === "dark" && <Check className="ml-2 size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 size-4" />
          <span className="flex-1">{t("nav.themeSystem")}</span>
          {theme === "system" && <Check className="ml-2 size-3.5" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })
  const { admin, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0")
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  const activeItem =
    NAV_ITEMS.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to))) ??
    NAV_ITEMS[0]

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center",
            collapsed ? "justify-center px-0" : "justify-between gap-2 px-4"
          )}
        >
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Network className="size-4" />
              </div>
              <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">mihob</span>
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "shrink-0 text-muted-foreground hover:text-sidebar-foreground",
                  collapsed ? "size-10" : "size-8"
                )}
                onClick={toggleCollapsed}
                aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator className="bg-sidebar-border" />
        <SidebarNav collapsed={collapsed} />
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetHeader className="flex h-14 flex-row items-center gap-2.5 border-b border-sidebar-border px-5">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="size-4" />
            </div>
            <SheetTitle className="text-base font-semibold">mihob</SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm lg:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label={t("nav.openMenu")}
            >
              <Menu className="size-5" />
            </Button>
            <span className="text-sm font-medium text-foreground">{t(activeItem.labelKey)}</span>
          </div>

          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeSwitcher />

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-1 gap-2 font-normal">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {(admin?.username || "A").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline">{admin?.username || "admin"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {t("nav.adminAccount")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 size-4" />
                  {t("nav.settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 size-4" />
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 lg:px-6 lg:py-5">{children}</main>
      </div>
    </div>
  )
}
