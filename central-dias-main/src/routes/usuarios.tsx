import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, LockKeyhole, Mail, Plus, Search, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { getCurrentAccessToken } from "@/lib/auth";
import {
  createWorkspaceUser,
  getWorkspaceUserAccess,
  listWorkspaceUsers,
  type WorkspaceUser,
  type WorkspaceUserAccess,
} from "@/lib/workspaceUsers";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários - Central Transportes" },
      {
        name: "description",
        content: "Gestão de usuários do workspace cliente.",
      },
    ],
  }),
  component: UsuariosPage,
  errorComponent: UsuariosErrorFallback,
});

type FormState = {
  name: string;
  email: string;
  phone: string;
  sector: string;
  temporaryPassword: string;
};

type UsuariosState =
  | { status: "loading"; message?: string }
  | { status: "success" }
  | { status: "accessDenied"; message?: string }
  | { status: "sessionExpired"; message?: string }
  | { status: "error"; message: string };

const emptyForm = (): FormState => ({
  name: "",
  email: "",
  phone: "",
  sector: "",
  temporaryPassword: "",
});

const statusLabel: Record<WorkspaceUser["status"], string> = {
  active: "Ativo",
  invited: "Convidado",
  suspended: "Suspenso",
  revoked: "Revogado",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function UsuariosPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [access, setAccess] = useState<WorkspaceUserAccess | null>(null);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [routeState, setRouteState] = useState<UsuariosState>({
    status: "loading",
    message: "Carregando usuarios...",
  });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function reloadUsers(token: string) {
    console.info("[USUARIOS] getWorkspaceUserAccess started");
    let accessData: WorkspaceUserAccess;
    try {
      accessData = await getWorkspaceUserAccess({ data: { accessToken: token } });
    } catch (accessError) {
      console.error("[USUARIOS] getWorkspaceUserAccess error", accessError);
      throw accessError;
    }
    console.info("[USUARIOS] getWorkspaceUserAccess success", {
      isOwner: accessData.isOwner,
      workspaceName: accessData.workspaceName,
      tenantName: accessData.tenantName,
    });

    setAccess(accessData);

    if (accessData.isOwner !== true) {
      setUsers([]);
      setRouteState({
        status: "accessDenied",
        message: "Apenas o owner do workspace pode gerenciar usuarios.",
      });
      return;
    }

    console.info("[USUARIOS] listWorkspaceUsers started");
    let userRows: WorkspaceUser[];
    try {
      userRows = await listWorkspaceUsers({ data: { accessToken: token } });
    } catch (listError) {
      console.error("[USUARIOS] listWorkspaceUsers error", listError);
      throw listError;
    }
    console.info("[USUARIOS] listWorkspaceUsers success", { count: userRows.length });
    setUsers(userRows);
    setRouteState({ status: "success" });
  }

  useEffect(() => {
    let active = true;
    console.info("[USUARIOS] route mounted");

    async function load() {
      setRouteState({ status: "loading", message: "Carregando usuarios..." });
      try {
        console.info("[USUARIOS] auth ready");
        const token = await getCurrentAccessToken();
        console.info(`[USUARIOS] access token: ${token ? "YES" : "NO"}`);
        if (!token) {
          if (active) {
            setAccess(null);
            setUsers([]);
            setAccessToken(null);
            setRouteState({
              status: "sessionExpired",
              message: "Sessao expirada. Entre novamente pelo login central.",
            });
          }
          return;
        }

        if (active) setAccessToken(token);
        await reloadUsers(token);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Nao foi possivel carregar os usuarios.";
        console.error("[USUARIOS] load error", loadError);
        if (active) {
          setAccess(null);
          setUsers([]);
          setRouteState({ status: "error", message });
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.name, user.email, user.phone, user.sector, statusLabel[user.status]]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search, users]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    if (!accessToken) {
      toast.error("Sessão expirada. Entre novamente pelo login central.");
      return;
    }

    if (
      !form.name.trim() ||
      !form.email.trim() ||
      !form.sector.trim() ||
      !form.temporaryPassword.trim()
    ) {
      toast.error("Preencha nome completo, login, setor e senha.");
      return;
    }

    if (form.temporaryPassword.trim().length < 8) {
      toast.error("A senha temporária deve ter pelo menos 8 caracteres.");
      return;
    }

    setSaving(true);
    try {
      await createWorkspaceUser({
        data: {
          accessToken,
          name: form.name,
          email: form.email,
          phone: form.phone,
          sector: form.sector,
          temporaryPassword: form.temporaryPassword,
        },
      });
      setForm(emptyForm());
      setOpen(false);
      await reloadUsers(accessToken);
      toast.success("Usuário criado com sucesso.");
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Não foi possível criar o usuário.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (routeState.status === "loading") {
    return (
      <div className="mx-3 mt-3 md:mx-0 md:mt-0">
        <div className="premium-card flex min-h-[260px] items-center justify-center px-6 py-12 text-[13px] font-semibold text-muted-foreground">
          {routeState.message || "Carregando usuarios..."}
        </div>
      </div>
    );
  }

  if (routeState.status === "sessionExpired") {
    return (
      <UsuariosStatusCard
        icon="alert"
        title="Sessao expirada"
        message={routeState.message || "Entre novamente pelo login central."}
      />
    );
  }

  if (routeState.status === "accessDenied") {
    return (
      <UsuariosStatusCard
        icon="lock"
        title="Acesso restrito"
        message={routeState.message || "Apenas o owner do workspace pode gerenciar usuarios."}
      />
    );
  }

  if (routeState.status === "error") {
    return (
      <UsuariosStatusCard
        icon="alert"
        title="Nao foi possivel carregar usuarios"
        message={routeState.message}
      />
    );
  }

  if (!access || access.isOwner !== true) {
    return (
      <UsuariosStatusCard
        icon="lock"
        title="Acesso restrito"
        message="Apenas o owner do workspace pode gerenciar usuarios."
      />
    );
  }

  const ownerAccess = access;

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle={`${ownerAccess.tenantName || "Workspace"} · ${users.length} usuários`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 text-[12px]">
                <Plus className="size-3.5" />
                Novo usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo usuário</DialogTitle>
                <DialogDescription>
                  O acesso será criado como funcionário deste tenant.
                </DialogDescription>
              </DialogHeader>
              <form className="grid gap-4" onSubmit={createUser}>
                <Field label="Nome completo">
                  <Input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Nome do funcionário"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Login / e-mail">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="funcionario@empresa.com.br"
                    autoComplete="email"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Setor">
                    <Input
                      value={form.sector}
                      onChange={(event) => setForm({ ...form, sector: event.target.value })}
                      placeholder="Ex.: Operação"
                      autoComplete="organization-title"
                    />
                  </Field>
                  <Field label="Telefone">
                    <Input
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      placeholder="(00) 00000-0000"
                      autoComplete="tel"
                    />
                  </Field>
                </div>
                <Field label="Senha temporária">
                  <Input
                    type="password"
                    value={form.temporaryPassword}
                    onChange={(event) =>
                      setForm({ ...form, temporaryPassword: event.target.value })
                    }
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                  />
                </Field>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => setOpen(false)}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" className="h-9" disabled={saving}>
                    {saving ? "Criando..." : "Criar usuário"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
          <div>
            <Label className="label-tiny mb-1.5 block">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, e-mail ou status"
                className="h-10 pl-9 text-[12.5px]"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary">
            {ownerAccess.workspaceName || "Workspace atual"}
          </div>
        </div>
      </section>

      <section className="premium-card mx-3 my-4 overflow-hidden md:mx-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-tiny">Acessos do workspace</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">
              Funcionários e owner
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <ShieldCheck className="size-3.5" />
            Somente owner
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[780px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Setor</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={`${user.email}-${user.createdAt}`}>
                  <td>
                    <div className="flex min-w-[220px] items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <UserRound className="size-4" />
                      </span>
                      <div>
                        <div className="font-sans text-[13px] font-extrabold text-foreground">
                          {user.name}
                        </div>
                        {user.isOwner ? (
                          <div className="mt-1 text-[11px] font-bold text-primary">Owner</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 font-sans text-[12.5px] text-muted-foreground">
                      <Mail className="size-3.5 text-primary" />
                      {user.email || "-"}
                    </div>
                  </td>
                  <td className="font-sans text-[12.5px] text-muted-foreground">
                    {user.sector || "-"}
                  </td>
                  <td className="font-sans text-[12.5px] text-muted-foreground">
                    {user.phone || "-"}
                  </td>
                  <td>
                    <Badge variant={user.status === "active" ? "default" : "outline"}>
                      {statusLabel[user.status]}
                    </Badge>
                  </td>
                  <td className="font-sans text-[12.5px] text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-2">
                        <Search className="size-5" />
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        Nenhum usuário encontrado
                      </span>
                      <span className="text-[12px]">
                        Crie um novo funcionário ou ajuste a busca.
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="label-tiny mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function UsuariosStatusCard({
  icon,
  title,
  message,
}: {
  icon: "alert" | "lock";
  title: string;
  message: string;
}) {
  const Icon = icon === "lock" ? LockKeyhole : AlertCircle;

  return (
    <div className="mx-3 mt-3 md:mx-0 md:mt-0">
      <div className="premium-card flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
          <Icon className="size-5" />
        </div>
        <h1 className="text-[20px] font-extrabold text-foreground">{title}</h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">{message}</p>
        <Button asChild className="mt-6 h-9 rounded-2xl text-[12px]">
          <Link to="/">Voltar ao dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function UsuariosErrorFallback({ error }: { error: Error }) {
  console.error("[USUARIOS ROUTE ERROR]", error);

  return (
    <div className="mx-3 mt-3 md:mx-0 md:mt-0">
      <div className="premium-card flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
          <AlertCircle className="size-5" />
        </div>
        <h1 className="text-[20px] font-extrabold text-foreground">
          Nao foi possivel abrir usuarios
        </h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Atualize a pagina ou entre novamente pelo login central.
        </p>
        {import.meta.env.DEV ? (
          <pre className="mt-4 max-h-64 max-w-xl overflow-auto rounded-2xl border border-border bg-surface/70 px-4 py-3 text-left font-mono text-[11px] text-muted-foreground">
            {[
              `name: ${error.name || "Error"}`,
              `message: ${error.message || "-"}`,
              `stack: ${error.stack || "-"}`,
            ].join("\n")}
          </pre>
        ) : null}
        <Button asChild className="mt-6 h-9 rounded-2xl text-[12px]">
          <Link to="/">Voltar ao dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
