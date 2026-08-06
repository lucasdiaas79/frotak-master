import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/kit/ModulePage";
import { roles } from "@/lib/mock";

export const Route = createFileRoute("/funcoes")({
  head: () => ({
    meta: [
      { title: "Funções · FrotaK Master" },
      {
        name: "description",
        content: "RBAC: cargos internos, escopo de acesso e quantidade de permissões por função.",
      },
      { property: "og:title", content: "Funções · FrotaK Master" },
      { property: "og:description", content: "Cargos e escopos de acesso da plataforma." },
    ],
  }),
  component: () => (
    <ModulePage
      eyebrow="8 funções · modelo RBAC"
      title="Funções"
      description="Cargos internos com escopo de acesso granular por módulo e ação."
      crumb="Funções"
      kpis={[
        { label: "Funções ativas", value: "8", delta: "estável", trend: "flat" },
        { label: "Membros atribuídos", value: "62", delta: "+5", trend: "up" },
        { label: "Permissões mapeadas", value: "96", delta: "+8", trend: "up" },
        { label: "Funções privilegiadas", value: "2", delta: "auditadas", trend: "flat" },
      ]}
      columns={["Função", "Membros", "Escopo", "Permissões"]}
      rows={roles.map((r) => [r.name, r.members, r.scope, r.perms])}
    />
  ),
});
