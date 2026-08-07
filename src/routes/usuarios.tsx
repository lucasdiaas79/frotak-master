import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { KeyRound, LockKeyhole, Plus, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  KpiCard,
  PageHeader,
  Panel,
  StatusPill,
  TableWrap,
  Td,
  Th,
  Tr,
} from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createManagedUser,
  getManagedUsers,
  masterEmail,
  type CreateUserInput,
  type ManagedUser,
} from "@/lib/auth";
import { clients } from "@/lib/mock";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios - FrotaK Master" },
      {
        name: "description",
        content: "Gestao central de usuarios master e clientes.",
      },
    ],
  }),
  component: Usuarios,
});

const emptyForm: CreateUserInput = {
  name: "",
  email: "",
  password: "",
  role: "Cliente administrador",
  team: "",
  scope: "client",
  clientId: clients[0]?.id,
  status: "Ativo",
};

function Usuarios() {
  const [users, setUsers] = useState<ManagedUser[]>(() =>
    getManagedUsers().filter((user) => user.scope === "client"),
  );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateUserInput>(emptyForm);
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    const active = users.filter((user) => user.status === "Ativo").length;
    const clientUsers = users.filter((user) => user.scope === "client").length;

    return { active, clientUsers };
  }, [users]);

  function updateForm(field: keyof CreateUserInput, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      scope: "client",
    }));
  }

  function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      createManagedUser(form);
      setUsers(getManagedUsers().filter((user) => user.scope === "client"));
      setForm(emptyForm);
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nao foi possivel criar o usuario.");
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Acesso central"
        title="Usuarios"
        description="Todo usuario criado aqui e um cliente. O acesso master e unico e fixo."
        crumbs={[{ label: "Usuarios" }]}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 rounded-xl font-bold">
                <Plus className="size-4" />
                Novo usuario
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <form onSubmit={handleCreateUser}>
                <DialogHeader>
                  <DialogTitle>Novo usuario</DialogTitle>
                  <DialogDescription>
                    Crie o acesso do cliente. Ao fazer login, ele sera enviado ao sistema cliente.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(value) => updateForm("status", value)}
                    >
                      <SelectTrigger className="mt-1.5 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Ativo">Ativo</SelectItem>
                        <SelectItem value="Suspenso">Suspenso</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-2">
                    <Label className="text-xs">Nome</Label>
                    <Input
                      required
                      value={form.name}
                      onChange={(event) => updateForm("name", event.target.value)}
                      placeholder="Nome do usuario"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">E-mail</Label>
                    <Input
                      required
                      type="email"
                      value={form.email}
                      onChange={(event) => updateForm("email", event.target.value)}
                      placeholder="usuario@empresa.com.br"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Senha inicial</Label>
                    <Input
                      required
                      value={form.password}
                      onChange={(event) => updateForm("password", event.target.value)}
                      placeholder="Senha"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Perfil</Label>
                    <Input
                      required
                      value={form.role}
                      onChange={(event) => updateForm("role", event.target.value)}
                      placeholder="Administrador"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Cliente</Label>
                    <Select
                      value={form.clientId}
                      onValueChange={(value) => updateForm("clientId", value)}
                    >
                      <SelectTrigger className="mt-1.5 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {error ? (
                  <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <DialogFooter className="mt-5">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Criar usuario</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Usuarios ativos"
          value={String(totals.active)}
          delta="centralizado"
          trend="flat"
          icon={Users}
        />
        <KpiCard
          label="Usuarios cliente"
          value={String(totals.clientUsers)}
          delta="SSO pronto"
          trend="up"
          icon={KeyRound}
        />
        <KpiCard
          label="Usuarios master"
          value="1"
          delta={masterEmail}
          trend="flat"
          icon={LockKeyhole}
        />
        <KpiCard
          label="Provider"
          value="Supabase"
          delta="Auth real"
          trend="flat"
        />
      </div>

      <Panel className="mt-3" eyebrow="Acessos" title="Usuarios cadastrados">
        <TableWrap>
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Tipo</Th>
                <Th>Perfil</Th>
                <Th>Cliente/Time</Th>
                <Th>Provider</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Tr key={user.id}>
                  <Td className="font-semibold">{user.name}</Td>
                  <Td>{user.email}</Td>
                  <Td>
                    <StatusPill tone={user.scope === "client" ? "info" : "success"} dot={false}>
                      {user.scope === "client" ? "Cliente" : "Master"}
                    </StatusPill>
                  </Td>
                  <Td>{user.role}</Td>
                  <Td>{user.clientName || user.team}</Td>
                  <Td>{user.provider}</Td>
                  <Td>
                    <StatusPill tone={user.status === "Ativo" ? "success" : "warning"}>
                      {user.status}
                    </StatusPill>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </AppShell>
  );
}
