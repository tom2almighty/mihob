import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { Database, FolderGit2, Globe, Globe2, Palette, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/common/CommonUI"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AppearanceTab } from "./settings/AppearanceTab"
import { DatabaseTab } from "./settings/DatabaseTab"
import { GeneralTab } from "./settings/GeneralTab"
import { GeoDataTab } from "./settings/GeoDataTab"
import { ProjectsTab } from "./settings/ProjectsTab"
import { SecurityTab } from "./settings/SecurityTab"

type SettingsTab = "general" | "geodata" | "appearance" | "security" | "database" | "projects"

const VALID_SETTINGS_TABS = new Set<SettingsTab>([
  "general",
  "geodata",
  "appearance",
  "security",
  "database",
  "projects",
])

export function SettingsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get("tab") as SettingsTab | null
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    tabParam && VALID_SETTINGS_TABS.has(tabParam) ? tabParam : "general"
  )

  useEffect(() => {
    if (tabParam && VALID_SETTINGS_TABS.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam, activeTab])

  const handleTabChange = (next: SettingsTab) => {
    setActiveTab(next)
    if (next === "general") {
      searchParams.delete("tab")
    } else {
      searchParams.set("tab", next)
    }
    setSearchParams(searchParams, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Tabs
        value={activeTab}
        onValueChange={(v) => handleTabChange(v as SettingsTab)}
        className="max-w-4xl gap-6"
      >
        <TabsList className="h-auto max-w-full flex-wrap">
          <TabsTrigger value="general">
            <Globe className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.general")}</span>
          </TabsTrigger>
          <TabsTrigger value="geodata">
            <Globe2 className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.geodata")}</span>
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.appearance")}</span>
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.security")}</span>
          </TabsTrigger>
          <TabsTrigger value="database">
            <Database className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.database")}</span>
          </TabsTrigger>
          <TabsTrigger value="projects">
            <FolderGit2 className="size-3.5 shrink-0" />
            <span className="truncate">{t("settings.tabs.projects")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="geodata" className="mt-0">
          <GeoDataTab />
        </TabsContent>
        <TabsContent value="appearance" className="mt-0">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="security" className="mt-0">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="database" className="mt-0">
          <DatabaseTab />
        </TabsContent>
        <TabsContent value="projects" className="mt-0">
          <ProjectsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
