import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { collectIssues, type ControlPanelTab } from "@/modules/control-panel/domain/control-panel";
import { getHostsFn } from "@/modules/control-panel/server";
import { AutoHealTab } from "@/modules/control-panel/ui/AutoHealTab";
import { BackupsTab } from "@/modules/control-panel/ui/BackupsTab";
import { ClientsTab } from "@/modules/control-panel/ui/ClientsTab";
import { ContainersTab } from "@/modules/control-panel/ui/ContainersTab";
import { DatabasesTab } from "@/modules/control-panel/ui/DatabasesTab";
import { formatAgo } from "@/modules/control-panel/ui/format";
import { OverviewTab } from "@/modules/control-panel/ui/OverviewTab";
import { ServersTab } from "@/modules/control-panel/ui/ServersTab";
import { ErrorBlock, LevelBadge, LoadingBlock } from "@/modules/control-panel/ui/shared";

const tabLabels: Record<ControlPanelTab, string> = {
  geral: "Visão geral",
  servidores: "Servidores",
  containers: "Containers",
  bancos: "Bancos de dados",
  clientes: "Clientes",
  autoheal: "Auto-heal",
  backups: "Backups",
};

export function ControlPanelPage({
  tab,
  onTabChange,
}: {
  tab: ControlPanelTab;
  onTabChange: (tab: ControlPanelTab) => void;
}) {
  const hosts = useQuery({
    queryKey: ["panel", "hosts"],
    queryFn: () => getHostsFn(),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });
  const issues = hosts.data ? collectIssues(hosts.data) : [];
  const critical = issues.some((issue) => issue.level === "critical");
  const capturedAt = hosts.data?.find((item) => item.reachable);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Infraestrutura"
        title="Painel de controle"
        description="Servidores, containers, bancos, auto-heal e backups, com dados reais das VPS."
        crumbs={[{ label: "Infraestrutura" }, { label: "Painel de controle" }]}
        actions={
          <>
            {hosts.data ? (
              <LevelBadge level={issues.length === 0 ? "ok" : critical ? "critical" : "warning"}>
                {issues.length === 0 ? "Tudo saudável" : `${issues.length} com atenção`}
              </LevelBadge>
            ) : null}
            {capturedAt?.reachable ? (
              <span className="text-xs text-muted-foreground">
                Medido {formatAgo(capturedAt.snapshot.capturedAt)}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void hosts.refetch()}
              disabled={hosts.isFetching}
            >
              <RefreshCw className={hosts.isFetching ? "size-4 animate-spin" : "size-4"} />
              Atualizar
            </Button>
          </>
        }
      />

      {hosts.isLoading ? (
        <LoadingBlock label="Falando com as sentinelas..." />
      ) : hosts.isError || !hosts.data ? (
        <ErrorBlock error={hosts.error} onRetry={() => void hosts.refetch()} />
      ) : (
        <Tabs value={tab} onValueChange={(next) => onTabChange(next as ControlPanelTab)}>
          <div className="mb-4 overflow-x-auto">
            <TabsList className="w-max">
              {(Object.keys(tabLabels) as ControlPanelTab[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {tabLabels[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="geral">
            <OverviewTab hosts={hosts.data} onNavigate={onTabChange} />
          </TabsContent>
          <TabsContent value="servidores">
            <ServersTab hosts={hosts.data} />
          </TabsContent>
          <TabsContent value="containers">
            <ContainersTab hosts={hosts.data} />
          </TabsContent>
          <TabsContent value="bancos">
            <DatabasesTab />
          </TabsContent>
          <TabsContent value="clientes">
            <ClientsTab hosts={hosts.data} />
          </TabsContent>
          <TabsContent value="autoheal">
            <AutoHealTab hosts={hosts.data} />
          </TabsContent>
          <TabsContent value="backups">
            <BackupsTab hosts={hosts.data} />
          </TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}
