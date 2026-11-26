import { useEffect, useState } from "react";
import { FrotakPage, FrotakPageHeader } from "@/components/frotak/FrotakPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveTenantId } from "@/lib/auth";
import { isModuleEnabled, type ModuleCode, type WorkspaceEntitlements } from "@/lib/entitlements";
import { getWorkspaceEntitlements } from "@/lib/entitlementsAccess";
import { getActiveWorkspaceId } from "@/modules/driver-ops/infrastructure/workspace";
import { FuelTab } from "./FuelTab";
import { JourneyTab } from "./JourneyTab";
import { PerformanceTab } from "./PerformanceTab";
import { RoutesTab } from "./RoutesTab";
import { OccurrencesTab, SafetySetupTab } from "./SafetyTab";

const TABS: { id: string; label: string; module: ModuleCode }[] = [
  { id: "rotas", label: "Rotas do dia", module: "delivery_routes" },
  { id: "jornada", label: "Jornada e ponto", module: "driver_journey" },
  { id: "ocorrencias", label: "Ocorrências", module: "driver_safety" },
  { id: "combustivel", label: "Combustível", module: "fuel_control" },
  { id: "desempenho", label: "Desempenho", module: "driver_performance" },
  { id: "seguranca", label: "Checklist, documentos e avisos", module: "driver_safety" },
];

export function OperacaoPage() {
  const tenantId = getActiveTenantId();
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements | null>(null);
  useEffect(() => {
    void getWorkspaceEntitlements(getActiveWorkspaceId())
      .then(setEntitlements)
      .catch(() => setEntitlements(null));
  }, []);
  const tabs = TABS.filter((t) => isModuleEnabled(entitlements, t.module));
  const [tab, setTab] = useState("rotas");
  const current = tabs.find((t) => t.id === tab)?.id ?? tabs[0]?.id ?? "rotas";

  return (
    <FrotakPage>
      <FrotakPageHeader
        eyebrow="Operação com embarcador"
        title="Operação do dia"
        description="Rotas, jornada, ocorrências e combustível que chegam do app do motorista em tempo real. Tudo em um lugar, no lugar de três aplicativos."
      />
      <Tabs value={current} onValueChange={setTab}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="rotas" className="mt-4">
          <RoutesTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="jornada" className="mt-4">
          <JourneyTab />
        </TabsContent>
        <TabsContent value="ocorrencias" className="mt-4">
          <OccurrencesTab />
        </TabsContent>
        <TabsContent value="combustivel" className="mt-4">
          <FuelTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="desempenho" className="mt-4">
          <PerformanceTab />
        </TabsContent>
        <TabsContent value="seguranca" className="mt-4">
          <SafetySetupTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </FrotakPage>
  );
}
