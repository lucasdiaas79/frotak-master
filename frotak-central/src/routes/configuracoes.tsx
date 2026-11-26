import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatusPill } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · FrotaK Master" },
      {
        name: "description",
        content:
          "Branding, SMTP, domínio, API, segurança, storage, backup e feature flags da plataforma.",
      },
      { property: "og:title", content: "Configurações · FrotaK Master" },
      { property: "og:description", content: "Configurações globais da plataforma FrotaK." },
    ],
  }),
  component: () => (
    <AppShell>
      <PageHeader
        eyebrow="Ambiente produção · sa-east-1"
        title="Configurações"
        description="Parâmetros globais da plataforma, identidade visual, segurança e feature flags."
        crumbs={[{ label: "Configurações" }]}
        actions={
          <Button size="sm" className="rounded-xl font-bold">
            Salvar alterações
          </Button>
        }
      />
      <Panel eyebrow="Plataforma" title="Preferências globais">
        <Tabs defaultValue="brand">
          <TabsList className="w-full justify-start overflow-x-auto rounded-xl">
            <TabsTrigger value="brand">Branding</TabsTrigger>
            <TabsTrigger value="smtp">SMTP</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="sec">Segurança</TabsTrigger>
            <TabsTrigger value="flags">Feature flags</TabsTrigger>
          </TabsList>

          <TabsContent value="brand" className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="eyebrow">Nome da plataforma</Label>
              <Input defaultValue="FrotaK" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="eyebrow">Domínio principal</Label>
              <Input defaultValue="app.frotak.com" className="mt-1.5 rounded-xl" />
            </div>
            <div className="sm:col-span-2">
              <Label className="eyebrow">Paleta do produto</Label>
              <div className="mt-2 flex gap-2">
                {["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"].map((c) => (
                  <span
                    key={c}
                    className="size-9 rounded-xl ring-1 ring-border"
                    style={{ background: `var(${c})` }}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="smtp" className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="eyebrow">Host</Label>
              <Input defaultValue="smtp.frotak.com" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="eyebrow">Porta</Label>
              <Input defaultValue="587" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="eyebrow">Remetente</Label>
              <Input defaultValue="no-reply@frotak.com" className="mt-1.5 rounded-xl" />
            </div>
            <div className="flex items-end">
              <StatusPill tone="success">TLS 1.3 ativo</StatusPill>
            </div>
          </TabsContent>

          <TabsContent value="api" className="mt-4 space-y-3">
            {[
              "Chave pública · pk_live_••••4f81",
              "Chave privada · sk_live_••••a91f",
              "Rate limit · 12.000 req/min",
            ].map((k) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-xl border border-border bg-elevated/50 px-4 py-3 font-mono text-xs"
              >
                {k}
                <Button variant="outline" size="sm" className="rounded-lg">
                  Rotacionar
                </Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="sec" className="mt-4 space-y-3">
            {[
              "Exigir 2FA para administradores",
              "Bloquear login fora do Brasil",
              "Expirar sessão após 8h",
              "Registrar IP em auditoria",
            ].map((s, i) => (
              <div
                key={s}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold"
              >
                {s}
                <Switch defaultChecked={i !== 1} />
              </div>
            ))}
          </TabsContent>

          <TabsContent value="flags" className="mt-4 space-y-3">
            {[
              "Copiloto de IA na torre",
              "Novo mapa com clusters",
              "Faturamento em USD",
              "Portal do motorista v2",
            ].map((s, i) => (
              <div
                key={s}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold"
              >
                {s}
                <Switch defaultChecked={i < 2} />
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </Panel>
    </AppShell>
  ),
});
