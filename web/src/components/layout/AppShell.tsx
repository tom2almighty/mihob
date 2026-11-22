import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation, useMatch, useNavigate } from "react-router-dom"
import {
  Bell,
  Check,
  ChevronsUpDown,
  FileCode2,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Network,
  Palette,
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  { to: "/notifications", labelKey: "nav.notifications" as const, icon: Bell },
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
        "flex h-9 w-full shrink-0 items-center rounded-md px-2.5 text-sm transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-2xs"
          : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-[opacity,max-width,margin] duration-200 ease-in-out",
          collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-40 opacity-100"
        )}
      >
        {label}
      </span>
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
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
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label={t("nav.ariaLabel")}>
      {NAV_ITEMS.map((item) => (
        <SidebarNavItem key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}

export function LanguageSwitcher({
  side = "bottom",
  align = "end",
  tooltipSide = "top",
}: {
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  tooltipSide?: "top" | "bottom" | "left" | "right"
} = {}) {
  const { t, i18n } = useTranslation()
  const current = normalizeLanguage(i18n.resolvedLanguage || i18n.language)

  const changeLang = (lng: SupportedLanguage) => {
    void i18n.changeLanguage(lng)
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label={t("nav.languageAria")}>
                  <Languages className="size-4" />
                </Button>
              }
            />
          }
        />
        <TooltipContent side={tooltipSide}>{t("nav.languageTooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side={side} align={align} sideOffset={6} className="min-w-36">
        <DropdownMenuItem onClick={() => changeLang("zh-CN")} className="whitespace-nowrap">
          <span className="flex-1">{t("nav.langZh")}</span>
          {current === "zh-CN" && <Check className="ml-2 size-3.5 shrink-0" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLang("en-US")} className="whitespace-nowrap">
          <span className="flex-1">{t("nav.langEn")}</span>
          {current === "en-US" && <Check className="ml-2 size-3.5 shrink-0" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThemeSwitcher({
  side = "bottom",
  align = "end",
  tooltipSide = "top",
  onOpenThemeSettings,
}: {
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  tooltipSide?: "top" | "bottom" | "left" | "right"
  onOpenThemeSettings?: () => void
} = {}) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label={t("nav.themeAria")}>
                  {theme === "dark" ? (
                    <Moon className="size-4" />
                  ) : theme === "light" ? (
                    <Sun className="size-4" />
                  ) : (
                    <Monitor className="size-4" />
                  )}
                </Button>
              }
            />
          }
        />
        <TooltipContent side={tooltipSide}>{t("nav.themeTooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side={side} align={align} sideOffset={6} className="min-w-48">
        <DropdownMenuItem onClick={() => setTheme("light")} className="whitespace-nowrap">
          <Sun className="mr-2 size-4 shrink-0" />
          <span className="flex-1">{t("nav.themeLight")}</span>
          {theme === "light" && <Check className="ml-2 size-3.5 shrink-0" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="whitespace-nowrap">
          <Moon className="mr-2 size-4 shrink-0" />
          <span className="flex-1">{t("nav.themeDark")}</span>
          {theme === "dark" && <Check className="ml-2 size-3.5 shrink-0" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="whitespace-nowrap">
          <Monitor className="mr-2 size-4 shrink-0" />
          <span className="flex-1">{t("nav.themeSystem")}</span>
          {theme === "system" && <Check className="ml-2 size-3.5 shrink-0" />}
        </DropdownMenuItem>
        {onOpenThemeSettings && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenThemeSettings} className="whitespace-nowrap">
              <Palette className="mr-2 size-4 shrink-0" />
              <span className="flex-1 truncate">{t("nav.manageThemes")}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarFooter({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { admin, logout } = useAuth()
  const navigate = useNavigate()
  const initial = (admin?.username || "A").slice(0, 1).toUpperCase()
  const username = admin?.username || "admin"

  const accountButton = (
    <Button
      variant="ghost"
      className={cn(
        "h-9 w-full justify-start px-2 font-normal text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "px-0 justify-center"
      )}
      aria-label={t("nav.adminAccount")}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {initial}
      </span>
      <span
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between overflow-hidden whitespace-nowrap transition-[opacity,max-width,margin] duration-200 ease-in-out",
          collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-40 opacity-100"
        )}
      >
        <span className="truncate text-sm font-medium">{username}</span>
        <ChevronsUpDown className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
      </span>
    </Button>
  )

  return (
    <div className="border-t border-sidebar-border p-3">
      <div
        className={cn(
          "flex gap-1.5 transition-all duration-200",
          collapsed ? "flex-col items-center" : "flex-col"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1",
            collapsed ? "flex-col" : "justify-between px-0.5"
          )}
        >
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap text-xs text-muted-foreground transition-[opacity,max-width] duration-200",
              collapsed ? "max-w-0 opacity-0" : "max-w-25 opacity-100"
            )}
          >
            {t("nav.preferences")}
          </span>
          <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
            <LanguageSwitcher
              side={collapsed ? "right" : "top"}
              align={collapsed ? "end" : "start"}
              tooltipSide={collapsed ? "right" : "top"}
            />
            <ThemeSwitcher
              side={collapsed ? "right" : "top"}
              align={collapsed ? "end" : "start"}
              tooltipSide={collapsed ? "right" : "top"}
              onOpenThemeSettings={() => {
                onNavigate?.()
                navigate("/settings?tab=appearance")
              }}
            />
          </div>
        </div>

        <DropdownMenu>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={<DropdownMenuTrigger render={accountButton} />}
              />
              <TooltipContent side="right" sideOffset={8}>
                {username}
              </TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenuTrigger render={accountButton} />
          )}
          <DropdownMenuContent
            side={collapsed ? "right" : "top"}
            align={collapsed ? "end" : "start"}
            sideOffset={8}
            className="w-48"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("nav.adminAccount")} · {username}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onNavigate?.()
                navigate("/settings")
              }}
            >
              <Settings className="mr-2 size-4" />
              {t("nav.settings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} variant="destructive">
              <LogOut className="mr-2 size-4" />
              {t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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
  const location = useLocation()

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
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out lg:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center px-3",
            collapsed ? "justify-center" : "justify-between gap-2"
          )}
        >
          <div
            className={cn(
              "flex min-w-0 items-center overflow-hidden transition-[opacity,max-width] duration-200 ease-in-out",
              collapsed ? "max-w-0 opacity-0" : "max-w-40 gap-2.5 pl-1 opacity-100"
            )}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="size-4" />
            </div>
            <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">
              mihob
            </span>
          </div>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
                >
                  {collapsed ? (
                    <PanelLeftOpen className="size-4" />
                  ) : (
                    <PanelLeftClose className="size-4" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="right" sideOffset={8}>
              {collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            </TooltipContent>
          </Tooltip>
        </div>

        <SidebarNav collapsed={collapsed} />
        <SidebarFooter collapsed={collapsed} />
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-64 flex-col bg-sidebar p-0">
          <SheetHeader className="flex h-14 flex-row items-center gap-2.5 px-5">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Network className="size-4" />
            </div>
            <SheetTitle className="text-base font-semibold">mihob</SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter onNavigate={() => setMobileOpen(false)} />
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
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 lg:px-6 lg:py-4">{children}</main>
      </div>
    </div>
  )
}
