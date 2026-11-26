import { createFileRoute } from "@tanstack/react-router";
import {
  ClientDetailPage,
  clientDetailTabs,
  type ClientDetailTab,
} from "@/modules/tenants/ui/ClientDetailPage";

export const Route = createFileRoute("/clientes_/$slug")({
  validateSearch: (search: Record<string, unknown>): { aba?: ClientDetailTab } => {
    const tab = search.aba as ClientDetailTab;
    return clientDetailTabs.includes(tab) ? { aba: tab } : {};
  },
  head: () => ({
    meta: [
      { title: "Cliente - FrotaK Master" },
      {
        name: "description",
        content: "Cadastro, endereço, ambiente criado, logins e módulos de um cliente FrotaK.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const { aba } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ClientDetailPage
      slug={slug}
      tab={aba ?? "resumo"}
      onTabChange={(next) => void navigate({ search: { aba: next }, replace: true })}
    />
  );
}
