import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useFleet } from "@/lib/store";
import { getCurrentAccessToken } from "@/lib/auth";
import { createDriverAppAccess } from "@/lib/driverAppUsers";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Driver } from "@/lib/types";
import { vehicleTrailerLabel } from "@/lib/vehicle-trailers";
import { KeyRound, Link2, Pencil, Plus, Search, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/motoristas")({
  head: () => ({
    meta: [
      { title: "Motoristas - Central Transportes" },
      { name: "description", content: "Gestão de motoristas." },
    ],
  }),
  component: MotoristasPage,
});

const blank: Driver = { id: "", name: "", phone: "", cnh: "", active: true };

function MotoristasPage() {
  const { drivers, vehicles, trailers, upsertDriver, link } = useFleet();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Driver | null>(null);
  const [linking, setLinking] = useState<Driver | null>(null);
  const [appAccessDriver, setAppAccessDriver] = useState<Driver | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [linkVehicleId, setLinkVehicleId] = useState<string>("");

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (tab === "active" && !d.active) return false;
      if (tab === "inactive" && d.active) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [drivers, tab, search]);

  const vehiclePlate = (id?: string) => vehicles.find((v) => v.id === id)?.plate ?? "-";
  const vehicleTrailers = (id?: string) => {
    const vehicle = vehicles.find((v) => v.id === id);
    return vehicle ? vehicleTrailerLabel(vehicle, trailers) : "-";
  };

  const onSave = () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Informe o nome");
    upsertDriver({ ...editing, id: editing.id || `d${Date.now()}` });
    toast.success("Motorista salvo");
    setEditing(null);
  };

  const onLink = () => {
    if (!linking || !linkVehicleId) return;
    const veh = vehicles.find((v) => v.id === linkVehicleId);
    if (!veh) return;
    link(veh.id, linking.id, veh.trailerIds?.[0] ?? veh.trailerId, { trailerIds: veh.trailerIds });
    toast.success(`${linking.name} vinculado a ${veh.plate}`);
    setLinking(null);
    setLinkVehicleId("");
  };

  const onCreateAppAccess = async () => {
    if (!appAccessDriver) return;
    if (!appAccessDriver.phone.trim()) return toast.error("Informe o telefone do motorista");
    if (temporaryPassword.trim().length < 6)
      return toast.error("Informe uma senha com pelo menos 6 caracteres");

    try {
      const accessToken = await getCurrentAccessToken();
      if (!accessToken) return toast.error("Sessao expirada. Entre novamente.");

      await createDriverAppAccess({
        data: {
          accessToken,
          driverId: appAccessDriver.id,
          phone: appAccessDriver.phone,
          temporaryPassword,
        },
      });

      toast.success("Acesso do app motorista criado");
      setAppAccessDriver(null);
      setTemporaryPassword("");
      void useFleet.getState().loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel criar acesso");
    }
  };

  const availableVehicles = vehicles.filter((v) => !v.driverId || v.driverId === linking?.id);

  return (
    <>
      <PageHeader
        title="Motoristas"
        subtitle={`${filtered.length} de ${drivers.length} motoristas cadastrados`}
        actions={
          <Button size="sm" className="h-9 text-[12px]" onClick={() => setEditing({ ...blank })}>
            <Plus className="size-3.5" /> Novo motorista
          </Button>
        }
      />

      <section className="premium-card mx-3 mt-4 px-4 py-4 md:mx-0 md:px-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label-tiny">Filtros de condutores</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">Equipe operacional</h2>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-9 bg-surface-2/80">
              <TabsTrigger value="all" className="text-[12px]">
                Todos
              </TabsTrigger>
              <TabsTrigger value="active" className="text-[12px]">
                Ativos
              </TabsTrigger>
              <TabsTrigger value="inactive" className="text-[12px]">
                Inativos
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="h-10 pl-9 text-[12.5px]"
          />
        </div>
      </section>

      <section className="premium-card mx-3 my-4 overflow-hidden md:mx-0">
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-tiny">Cadastro administrativo</p>
            <h2 className="mt-1 text-[17px] font-extrabold text-foreground">Motoristas da frota</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary">
            <UsersRound className="size-3.5" />
            {filtered.length} registros
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[880px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>CNH</th>
                <th>Status</th>
                <th>Ve?culo vinculado</th>
                <th>Caçambas</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                        <UserRound className="size-4" />
                      </span>
                      <span className="font-semibold text-foreground">{d.name}</span>
                    </div>
                  </td>
                  <td className="font-sans text-[12.5px] text-muted-foreground">{d.phone}</td>
                  <td className="font-sans text-[12.5px] text-muted-foreground">{d.cnh}</td>
                  <td>
                    <StatusPill active={d.active} />
                  </td>
                  <td className="font-sans text-[12.5px]">{vehiclePlate(d.vehicleId)}</td>
                  <td className="font-sans text-[12.5px] text-muted-foreground">
                    {vehicleTrailers(d.vehicleId)}
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setAppAccessDriver(d);
                          setTemporaryPassword("");
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        title={d.authUserId ? "Atualizar acesso do app" : "Criar acesso do app"}
                      >
                        <KeyRound className="size-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setLinking(d);
                          setLinkVehicleId(d.vehicleId ?? "");
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        title="Vincular"
                      >
                        <Link2 className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setEditing(d)}
                        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        title="Editar"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <span className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-2">
                        <Search className="size-5" />
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        Nenhum motorista encontrado
                      </span>
                      <span className="text-[12px]">Revise a busca ou o filtro de status.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? "Editar motorista" : "Novo motorista"}
        footer={
          <>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-9" onClick={onSave}>
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="label-tiny mb-1.5 block">Nome completo</Label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Telefone</Label>
              <Input
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                className="h-9 font-sans"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">CNH</Label>
              <Input
                value={editing.cnh}
                onChange={(e) => setEditing({ ...editing, cnh: e.target.value })}
                className="h-9 font-sans"
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-2xl border border-border/70 bg-surface/60 px-4 py-3">
              <div>
                <Label className="text-[12.5px] font-bold">Motorista ativo</Label>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Disponível para vínculo operacional.
                </p>
              </div>
              <Switch
                checked={editing.active}
                onCheckedChange={(v) => setEditing({ ...editing, active: v })}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!appAccessDriver}
        onOpenChange={(o) => !o && setAppAccessDriver(null)}
        title={`Acesso app motorista`}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setAppAccessDriver(null)}
            >
              Cancelar
            </Button>
            <Button size="sm" className="h-9" onClick={onCreateAppAccess}>
              Salvar acesso
            </Button>
          </>
        }
      >
        {appAccessDriver && (
          <div className="grid gap-3">
            <div className="rounded-2xl border border-border/70 bg-surface/60 px-4 py-3 text-[12px] text-muted-foreground">
              O login será feito pelo telefone cadastrado. O motorista não recebe acesso
              administrativo ao sistema cliente.
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Motorista</Label>
              <Input value={appAccessDriver.name} readOnly className="h-9 font-sans" />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Telefone de login</Label>
              <Input
                value={appAccessDriver.phone}
                onChange={(e) => setAppAccessDriver({ ...appAccessDriver, phone: e.target.value })}
                className="h-9 font-sans"
              />
            </div>
            <div>
              <Label className="label-tiny mb-1.5 block">Senha temporária</Label>
              <Input
                type="password"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
                className="h-9 font-sans"
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!linking}
        onOpenChange={(o) => !o && setLinking(null)}
        title={`Vincular ${linking?.name ?? ""} a um veículo`}
        footer={
          <>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setLinking(null)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-9" disabled={!linkVehicleId} onClick={onLink}>
              Confirmar vínculo
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-surface/60 px-4 py-3 text-[12px] text-muted-foreground">
            Selecione um veículo disponível. Vínculos antigos serão substituídos.
          </div>
          <Select value={linkVehicleId} onValueChange={setLinkVehicleId}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Selecione um veículo..." />
            </SelectTrigger>
            <SelectContent>
              {availableVehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="font-sans font-semibold">{v.plate}</span> - {v.type} - {v.city}/
                  {v.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Modal>
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-[0.12em] ${
        active
          ? "border-success/25 bg-success/10 text-success"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-success ring-4 ring-success/15" : "bg-muted-foreground"}`}
      />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}
