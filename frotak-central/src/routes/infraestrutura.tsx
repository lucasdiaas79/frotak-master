import { createFileRoute } from "@tanstack/react-router";
import {
  controlPanelTabs,
  type ControlPanelTab,
} from "@/modules/control-panel/domain/control-panel";
import { ControlPanelPage } from "@/modules/control-panel/ui/ControlPanelPage";

export const Route = createFileRoute("/infraestrutura")({
  validateSearch: (search: Record<string, unknown>): { aba?: ControlPanelTab } => {
    const tab = search.aba as ControlPanelTab;
    return controlPanelTabs.includes(tab) ? { aba: tab } : {};
  },
  head: () => ({
    meta: [
      { title: "Painel de controle - FrotaK Master" },
      {
        name: "description",
        content: "Servidores, containers, bancos de dados, auto-heal e backups do FrotaK.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { aba } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ControlPanelPage
      tab={aba ?? "geral"}
      onTabChange={(next) => void navigate({ search: { aba: next }, replace: true })}
    />
  );
}
