import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { BellRing, CalendarClock, History, SlidersHorizontal } from "lucide-react"
import { PageHeader } from "@/components/common/CommonUI"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChannelsTab } from "./notifications/ChannelsTab"
import { LogsTab } from "./notifications/LogsTab"
import { RulesTab } from "./notifications/RulesTab"
import { SchedulesTab } from "./notifications/SchedulesTab"

type NotificationTab = "channels" | "rules" | "schedules" | "logs"

const VALID_TABS = new Set<NotificationTab>(["channels", "rules", "schedules", "logs"])

export function NotificationsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get("tab") as NotificationTab | null
  const [activeTab, setActiveTab] = useState<NotificationTab>(() =>
    tabParam && VALID_TABS.has(tabParam) ? tabParam : "channels"
  )

  useEffect(() => {
    if (tabParam && VALID_TABS.has(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam, activeTab])

  const handleTabChange = (next: NotificationTab) => {
    setActiveTab(next)
    if (next === "channels") {
      searchParams.delete("tab")
    } else {
      searchParams.set("tab", next)
    }
    setSearchParams(searchParams, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.description")}
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => handleTabChange((v as NotificationTab) || "channels")}
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="channels" className="gap-1.5">
            <BellRing className="size-3.5" />
            <span>{t("notifications.tabChannels")}</span>
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <SlidersHorizontal className="size-3.5" />
            <span>{t("notifications.tabRules")}</span>
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5">
            <CalendarClock className="size-3.5" />
            <span>{t("notifications.tabSchedules")}</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <History className="size-3.5" />
            <span>{t("notifications.tabLogs")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-0">
          <ChannelsTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-0">
          <RulesTab />
        </TabsContent>
        <TabsContent value="schedules" className="mt-0">
          <SchedulesTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-0">
          <LogsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
