import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, PageHeader, Panel, StatusPill, Timeline } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil · FrotaK Master" },
      {
        name: "description",
        content:
          "Dados pessoais, preferências de tema e idioma, sessões ativas e segurança com 2FA.",
      },
      { property: "og:title", content: "Perfil · FrotaK Master" },
      { property: "og:description", content: "Preferências, sessões e segurança da conta." },
    ],
  }),
  component: () => (
    <AppShell>
      <PageHeader
        eyebrow="Conta administrativa"
        title="Perfil"
        description="Dados da conta, preferências de interface, sessões ativas e camadas de segurança."
        crumbs={[{ label: "Perfil" }]}
        actions={
          <Button size="sm" className="rounded-xl font-bold">
            Salvar
          </Button>
        }
      />
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2" eyebrow="Dados" title="Informações pessoais">
          <div className="flex items-center gap-4">
            <Avatar name="Administrador Central" className="size-16 rounded-2xl text-lg" />
            <div>
              <p className="font-bold">Administrador Central</p>
              <p className="text-xs text-muted-foreground">admin@frotak.com · Turno diurno</p>
              <Button variant="outline" size="sm" className="mt-2 rounded-xl">
                Trocar avatar
              </Button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="eyebrow">Nome</Label>
              <Input defaultValue="Administrador Central" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="eyebrow">E-mail</Label>
              <Input defaultValue="admin@frotak.com" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="eyebrow">Telefone</Label>
              <Input defaultValue="+55 79 99999-0000" className="mt-1.5 rounded-xl" />
            </div>
            <div>
              <Label className="eyebrow">Cargo</Label>
              <Input defaultValue="Administrador" className="mt-1.5 rounded-xl" />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {["Tema escuro por padrão", "Notificações por e-mail", "Resumo diário da operação"].map(
              (s, i) => (
                <div
                  key={s}
                  className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold"
                >
                  {s}
                  <Switch defaultChecked={i !== 2} />
                </div>
              ),
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel eyebrow="Segurança" title="Autenticação">
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold">
              2FA por aplicativo
              <StatusPill tone="success">Ativo</StatusPill>
            </div>
            <Button variant="outline" className="mt-3 w-full rounded-xl">
              Alterar senha
            </Button>
            <Button variant="outline" className="mt-2 w-full rounded-xl">
              Códigos de recuperação
            </Button>
          </Panel>
          <Panel eyebrow="Sessões" title="Dispositivos conectados">
            <Timeline
              items={[
                { title: "MacOS · Chrome · Aracaju/SE", meta: "sessão atual · 177.34.12.9" },
                { title: "iPhone · Safari", meta: "há 2 h · 201.17.88.2", tone: "info" },
                { title: "Windows · Edge", meta: "ontem · 189.5.201.44", tone: "neutral" },
              ]}
            />
            <Button variant="outline" className="mt-4 w-full rounded-xl text-destructive">
              Encerrar outras sessões
            </Button>
          </Panel>
        </div>
      </div>
    </AppShell>
  ),
});
