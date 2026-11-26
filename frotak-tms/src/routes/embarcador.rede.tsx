import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  Lock,
  MapPin,
  Network,
  Send,
  ShieldCheck,
  Star,
  Truck,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { DocStatePill, DriverAvatar, ScoreStar } from "@/components/shipper/DriverUi";
import { Card, EmptyState, PageTitle, Pill } from "@/components/shipper/ShipperUi";
import { Button } from "@/components/ui/button";
import { useShipperPortal, type NetworkFilters } from "@/lib/shipper/client";
import type { NetworkDriver, ShipperNetworkSettings } from "@/lib/shipper/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/embarcador/rede")({
  component: NetworkPage,
});

const UFS = ["SE", "BA", "AL", "PE", "PB", "RN", "CE", "MG", "SP"];

function NetworkPage() {
  const { thirdParties, saveSettings, searchNetwork, data } = useShipperPortal();
  const settings = thirdParties?.settings;
  const [filters, setFilters] = useState<NetworkFilters>({ docsOk: true });
  const [result, setResult] = useState<{
    drivers: NetworkDriver[];
    total: number;
    locked: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    setLoading(true);
    searchNetwork(filters)
      .then((next) => !cancelled && setResult(next))
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Não foi possível buscar."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, settings?.shareApproved]);

  async function toggle(key: keyof ShipperNetworkSettings) {
    if (!settings) return;
    try {
      await saveSettings({ ...settings, [key]: !settings[key] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  function indicate(driver: NetworkDriver) {
    const message = `Olá! Na Rede Frotak encontrei o motorista ${driver.name} (${driver.vehicleKind ?? "veículo"}, ${driver.baseCity ?? ""}), nota ${driver.score?.toFixed(1).replace(".", ",") ?? "-"} e documentos em dia. Vocês conseguem acionar ele para as próximas cargas da ${data?.profile.companyName ?? "nossa empresa"}?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  const set = (patch: Partial<NetworkFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  return (
    <div className="space-y-4">
      <PageTitle
        eyebrow="Rede Frotak"
        title="Terceiros validados por outras empresas"
        subtitle="Embarcadores que escolheram compartilhar a base de terceiros. Cada motorista autoriza o que aparece."
        actions={
          result && !result.locked ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-[#44AD60]/50 bg-[#44AD60]/12 px-3 py-1.5 text-[12.5px] font-bold text-primary">
              <span className="size-2 rounded-full bg-[#44AD60] shadow-[0_0_0_3px_rgba(68,173,96,0.2)]" />
              {result.total} motoristas na rede
            </span>
          ) : undefined
        }
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={filters.state ?? ""}
              onChange={(event) => set({ state: event.target.value || undefined })}
              className="h-9 rounded-full border border-border bg-card px-3 text-[12px] font-bold"
              aria-label="Estado"
            >
              <option value="">Todos os estados</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
            <select
              value={filters.vehicle ?? ""}
              onChange={(event) => set({ vehicle: event.target.value || undefined })}
              className="h-9 rounded-full border border-border bg-card px-3 text-[12px] font-bold"
              aria-label="Veículo"
            >
              <option value="">Todo veículo</option>
              <option value="carreta">Carreta</option>
              <option value="bitrem">Bitrem</option>
              <option value="truck">Truck</option>
              <option value="bitruck">Bitruck</option>
            </select>
            <Chip active={filters.docsOk === true} onClick={() => set({ docsOk: !filters.docsOk })}>
              <ShieldCheck className="size-3.5" /> Docs em dia
            </Chip>
            <Chip
              active={filters.minScore === 4.5}
              onClick={() => set({ minScore: filters.minScore === 4.5 ? undefined : 4.5 })}
            >
              <Star className="size-3.5" /> Nota 4,5+
            </Chip>
          </div>

          {result?.locked ? (
            <Card>
              <EmptyState
                icon={Lock}
                title="Ligue o compartilhamento para ver a rede"
                text="A rede é uma troca: quem compartilha os terceiros aprovados enxerga os das outras empresas. Ligue em Sua participação, ao lado."
              />
            </Card>
          ) : loading && !result ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="premium-card h-44 animate-pulse" />
              ))}
            </div>
          ) : !result?.drivers.length ? (
            <Card>
              <EmptyState
                icon={Network}
                title="Nenhum motorista neste filtro"
                text="Mude o estado, o veículo ou tire o filtro de nota."
              />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {result.drivers.map((driver) => (
                <Card key={driver.profileId} className="flex min-w-0 flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <DriverAvatar initials={driver.initials} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold">{driver.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {driver.vehicleKind ?? "Veículo não informado"}
                      </p>
                    </div>
                    <ScoreStar score={driver.score} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <DocStatePill state={driver.docState} />
                    {driver.validatedBy > 0 && (
                      <Pill tone="neutral" className="uppercase tracking-[0.06em] text-[10px]">
                        <BadgeCheck className="size-3" /> Validado por {driver.validatedBy}{" "}
                        empresa(s)
                      </Pill>
                    )}
                    {driver.availableNote && (
                      <Pill
                        tone={/agora/i.test(driver.availableNote) ? "good" : "muted"}
                        className="text-[10px] uppercase tracking-[0.06em]"
                      >
                        {driver.availableNote}
                      </Pill>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                    {driver.baseCity && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {driver.baseCity}
                      </span>
                    )}
                    <span>
                      <b className="font-mono text-foreground">{driver.trips}</b> viagens na rede
                    </span>
                    {driver.onTimeRate !== undefined && (
                      <span>
                        <b className="font-mono text-foreground">{driver.onTimeRate}%</b> no prazo
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button size="sm" className="rounded-full" onClick={() => indicate(driver)}>
                      <Send className="size-3.5" /> Indicar à minha transportadora
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-5">
            <p className="label-tiny text-primary">Sua participação</p>
            <SettingRow
              title="Compartilhar meus terceiros aprovados"
              hint="Só quem também compartilha enxerga a rede."
              on={settings?.shareApproved === true}
              onClick={() => toggle("shareApproved")}
              strong
            />
            <div className="my-3 h-px bg-border" />
            <SettingRow
              title="Incluir as avaliações que eu dei"
              on={settings?.shareRatings === true}
              onClick={() => toggle("shareRatings")}
            />
            <SettingRow
              title="Usar meus bloqueios para esconder o motorista (sem o motivo)"
              on={settings?.shareBlocks === true}
              onClick={() => toggle("shareBlocks")}
            />
            {data?.profile.role !== "admin" && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Só o administrador muda isso.
              </p>
            )}
          </Card>
          <Card className="p-5">
            <p className="label-tiny">O que a rede mostra</p>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              {[
                "Nome, veículo e região do motorista",
                "Documentos e validade",
                "Nota e % no prazo das viagens reais",
                "Quantas empresas aprovaram",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CircleCheck className="size-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="label-tiny mt-5">O que nunca aparece</p>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              {[
                "Valor pago ao motorista",
                "Com qual transportadora ele rodou",
                "Clientes e rotas das outras empresas",
                "Telefone, CPF e suas observações internas",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CircleX className="size-4 shrink-0 text-destructive" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex gap-2 rounded-[16px] border border-dashed border-border bg-surface/60 p-3 text-[11.5px] text-muted-foreground">
              <UserCheck className="size-3.5 shrink-0 text-primary" />O motorista entra na rede pelo
              link dele e pode sair quando quiser.
            </p>
            <p className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
              <Truck className="size-3.5 shrink-0" />A contratação continua com a sua
              transportadora.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SettingRow({
  title,
  hint,
  on,
  onClick,
  strong,
}: {
  title: string;
  hint?: string;
  on: boolean;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px]", strong ? "font-bold" : "font-semibold")}>{title}</p>
        {hint && <p className="text-[11.5px] text-muted-foreground">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={onClick}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition",
          on ? "bg-[#44AD60]" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-[18px] rounded-full bg-white transition-all",
            on ? "left-[19px]" : "left-[3px]",
          )}
        />
      </button>
    </div>
  );
}
