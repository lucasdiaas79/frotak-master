import * as React from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Building2,
  ChevronRight,
  Container,
  FolderKanban,
  Fuel,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map as MapIcon,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  TrendingUp,
  Truck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  acceptMasterSsoFromUrl,
  getCurrentUser,
  getMasterLoginUrl,
  getProfile,
  signOut,
} from "@/lib/auth";
import { useFleet } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { vehicleTrailerLabel } from "@/lib/vehicle-trailers";
import logoCentral from "@/assets/logo-central.png";
import faviconCentral from "@/assets/favicon.png";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activePaths?: string[];
}

interface NavGroup {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  items: NavItem[];
}

const OPERACIONAL: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/gestao-frota", label: "Gestão de Frota", icon: ListChecks },
  { to: "/frotak-ia", label: "Frotak IA", icon: Bot },
  { to: "/historicos", label: "Históricos", icon: History },
  { to: "/abastecimentos", label: "Abastecimentos", icon: Fuel },
  { to: "/lucros-despesas", label: "Lucros e Despesas", icon: TrendingUp },
  { to: "/mapa", label: "Mapa da Frota", icon: MapIcon },
];

const CADASTROS: NavGroup[] = [
  {
    title: "Cadastro de Frota",
    icon: FolderKanban,
    items: [
      { to: "/veiculos", label: "Veículos", icon: Truck },
      { to: "/motoristas", label: "Motoristas", icon: Users },
      { to: "/carretas", label: "Caçambas", icon: Container },
    ],
  },
  {
    title: "Cadastro de Clientes",
    icon: Building2,
    to: "/clientes",
    items: [{ to: "/clientes", label: "Clientes", icon: Building2 }],
  },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/gestao-frota", label: "Gestão", icon: ListChecks },
  {
    to: "/historicos",
    label: "Históricos",
    icon: History,
    activePaths: ["/historicos", "/abastecimentos", "/lucros-despesas"],
  },
  { to: "/mapa", label: "Mapa", icon: MapIcon },
  {
    to: "/veiculos",
    label: "Frota",
    icon: FolderKanban,
    activePaths: ["/veiculos", "/motoristas", "/carretas"],
  },
  {
    to: "/clientes",
    label: "Clientes",
    icon: Building2,
    activePaths: ["/clientes", "/remetentes", "/destinatarios", "/produtos"],
  },
];

const ADMIN_NAV: NavItem[] = [{ to: "/usuarios", label: "Usuários", icon: Users }];

const ROUTE_TITLES: Record<string, string> = {
  "/": "Dashboard Operacional",
  "/gestao-frota": "Gestão de Frota",
  "/frotak-ia": "Frotak IA",
  "/historicos": "Históricos",
  "/abastecimentos": "Abastecimentos",
  "/lucros-despesas": "Lucros e Despesas",
  "/mapa": "Mapa da Frota",
  "/vinculacao": "Despacho Operacional",
  "/veiculos": "Veículos",
  "/motoristas": "Motoristas",
  "/carretas": "Caçambas",
  "/clientes": "Cadastro de Clientes",
  "/produtos": "Produtos",
  "/remetentes": "Cadastro de Clientes",
  "/destinatarios": "Cadastro de Clientes",
  "/usuarios": "Usuários",
};

const ROUTE_GROUPS: Record<string, string> = {
  "/": "Operacional",
  "/gestao-frota": "Operacional",
  "/frotak-ia": "Operacional",
  "/historicos": "Operacional",
  "/abastecimentos": "Operacional",
  "/lucros-despesas": "Operacional",
  "/mapa": "Operacional",
  "/vinculacao": "Operacional",
  "/veiculos": "Cadastros",
  "/motoristas": "Cadastros",
  "/carretas": "Cadastros",
  "/clientes": "Cadastros",
  "/produtos": "Cadastros",
  "/remetentes": "Cadastros",
  "/destinatarios": "Cadastros",
  "/usuarios": "Administração",
};

function getInitials(profile: Profile | null) {
  return (
    (profile?.name || profile?.email || "OP")
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "OP"
  );
}

function NavSection({
  title,
  items,
  collapsed,
  compact,
}: {
  title: string;
  items: NavItem[];
  collapsed: boolean;
  compact?: boolean;
}) {
  const loc = useLocation();

  return (
    <section className={cn("px-2 py-2", compact && "py-1")}>
      <div
        className={cn(
          "px-3 pb-2 font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-muted transition-opacity duration-200",
          compact && "pb-1 text-[9.5px]",
          collapsed && "hidden",
        )}
      >
        {title}
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active = loc.pathname === item.to;
          const Icon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group/item relative flex min-h-11 items-center gap-3 overflow-hidden rounded-2xl text-[13px] font-bold transition-all duration-200",
                collapsed ? "justify-center px-2" : "px-3",
                active
                  ? "text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/72 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute inset-0 rounded-2xl transition-all duration-200",
                  active
                    ? "border border-sidebar-primary/30 bg-sidebar-primary/14 shadow-sm"
                    : "border border-transparent",
                )}
              />
              {active && (
                <span className="absolute left-0 top-2.5 h-6 w-1 rounded-r-full bg-sidebar-primary" />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-xl transition-all",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground glow-primary-sm"
                    : "bg-sidebar-accent/70 text-sidebar-foreground/72 group-hover/item:text-sidebar-primary",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span
                className={cn("relative z-10 truncate transition-opacity", collapsed && "hidden")}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

function CadastrosSection({ collapsed }: { collapsed: boolean }) {
  const loc = useLocation();
  const frotaItems = CADASTROS[0].items;
  const frotaActive = frotaItems.some((item) => loc.pathname === item.to);
  const clientesActive =
    loc.pathname === "/clientes" ||
    loc.pathname === "/produtos" ||
    loc.pathname === "/remetentes" ||
    loc.pathname === "/destinatarios";
  const [frotaOpen, setFrotaOpen] = React.useState(frotaActive);

  React.useEffect(() => {
    if (frotaActive) setFrotaOpen(true);
  }, [frotaActive]);

  const frotaIcon = CADASTROS[0].icon;
  const clientesIcon = CADASTROS[1].icon;
  const frotaEmphasis = frotaActive || (!collapsed && frotaOpen);

  return (
    <section className="px-2 py-2">
      <div
        className={cn(
          "px-3 pb-2 font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-muted transition-opacity duration-200",
          collapsed && "hidden",
        )}
      >
        Cadastros
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setFrotaOpen((value) => !value)}
          className={cn(
            "group/item relative flex min-h-11 items-center gap-3 overflow-hidden rounded-2xl text-[13px] font-bold transition-all duration-200",
            collapsed ? "justify-center px-2" : "px-3",
            frotaEmphasis
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground/72 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
          title={collapsed ? "Cadastro de Frota" : undefined}
        >
          <span
            className={cn(
              "absolute inset-0 rounded-2xl transition-all duration-200",
              frotaEmphasis
                ? "border border-sidebar-primary/30 bg-sidebar-primary/14 shadow-sm"
                : "border border-transparent",
            )}
          />
          {frotaActive && (
            <span className="absolute left-0 top-2.5 h-6 w-1 rounded-r-full bg-sidebar-primary" />
          )}
          <span
            className={cn(
              "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-xl transition-all",
              frotaEmphasis
                ? "bg-sidebar-primary text-sidebar-primary-foreground glow-primary-sm"
                : "bg-sidebar-accent/70 text-sidebar-foreground/72 group-hover/item:text-sidebar-primary",
            )}
          >
            {React.createElement(frotaIcon, { className: "size-4" })}
          </span>
          <span className={cn("relative z-10 truncate transition-opacity", collapsed && "hidden")}>
            Cadastro de Frota
          </span>
          <ChevronRight
            className={cn(
              "relative z-10 ml-auto size-4 shrink-0 transition-transform",
              frotaOpen && "rotate-90",
              collapsed && "hidden",
            )}
          />
        </button>

        {frotaOpen && (
          <div
            className={cn(
              "ml-6 flex flex-col gap-1 border-l border-sidebar-border/70 pl-3",
              collapsed && "hidden",
            )}
          >
            {frotaItems.map((item) => {
              const active = loc.pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group/item relative flex min-h-10 items-center gap-3 overflow-hidden rounded-2xl px-3 text-[12.5px] font-bold transition-all duration-200",
                    active
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/72 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-0 rounded-2xl transition-all duration-200",
                      active
                        ? "border border-sidebar-primary/25 bg-sidebar-primary/12"
                        : "border border-transparent",
                    )}
                  />
                  <span
                    className={cn(
                      "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-xl transition-all",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "bg-sidebar-accent/70 text-sidebar-foreground/72 group-hover/item:text-sidebar-primary",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="relative z-10 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}

        <Link
          to="/clientes"
          title={collapsed ? "Cadastro de Clientes" : undefined}
          className={cn(
            "group/item relative flex min-h-11 items-center gap-3 overflow-hidden rounded-2xl text-[13px] font-bold transition-all duration-200",
            collapsed ? "justify-center px-2" : "px-3",
            clientesActive
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground/72 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
          <span
            className={cn(
              "absolute inset-0 rounded-2xl transition-all duration-200",
              clientesActive
                ? "border border-sidebar-primary/30 bg-sidebar-primary/14 shadow-sm"
                : "border border-transparent",
            )}
          />
          {clientesActive && (
            <span className="absolute left-0 top-2.5 h-6 w-1 rounded-r-full bg-sidebar-primary" />
          )}
          <span
            className={cn(
              "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-xl transition-all",
              clientesActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground glow-primary-sm"
                : "bg-sidebar-accent/70 text-sidebar-foreground/72 group-hover/item:text-sidebar-primary",
            )}
          >
            {React.createElement(clientesIcon, { className: "size-4" })}
          </span>
          <span className={cn("relative z-10 truncate transition-opacity", collapsed && "hidden")}>
            Cadastro de Clientes
          </span>
        </Link>

        <Link
          to="/produtos"
          title={collapsed ? "Produtos" : undefined}
          className={cn(
            "group/item relative flex min-h-11 items-center gap-3 overflow-hidden rounded-2xl text-[13px] font-bold transition-all duration-200",
            collapsed ? "justify-center px-2" : "px-3",
            loc.pathname === "/produtos"
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground/72 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
          <span
            className={cn(
              "absolute inset-0 rounded-2xl transition-all duration-200",
              loc.pathname === "/produtos"
                ? "border border-sidebar-primary/30 bg-sidebar-primary/14 shadow-sm"
                : "border border-transparent",
            )}
          />
          {loc.pathname === "/produtos" && (
            <span className="absolute left-0 top-2.5 h-6 w-1 rounded-r-full bg-sidebar-primary" />
          )}
          <span
            className={cn(
              "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-xl transition-all",
              loc.pathname === "/produtos"
                ? "bg-sidebar-primary text-sidebar-primary-foreground glow-primary-sm"
                : "bg-sidebar-accent/70 text-sidebar-foreground/72 group-hover/item:text-sidebar-primary",
            )}
          >
            <Package className="size-4" />
          </span>
          <span className={cn("relative z-10 truncate transition-opacity", collapsed && "hidden")}>
            Produtos
          </span>
        </Link>
      </div>
    </section>
  );
}

function SidebarBody({
  collapsed,
  onToggle,
  onLogout,
  profile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
  profile: Profile | null;
}) {
  const initials = getInitials(profile);
  const profileLabel = profile?.name || profile?.email || "Operador Logístico";

  return (
    <div className="glass relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[28px] border-sidebar-border bg-sidebar/80 text-sidebar-foreground shadow-[var(--shadow-strong)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_28%_0%,oklch(1_0_0_/_0.08),transparent_58%)]" />

      <div
        className={cn(
          "relative z-10 flex h-28 items-center overflow-visible border-b border-sidebar-border/80 transition-all",
          collapsed ? "justify-center px-3" : "justify-center px-4",
        )}
      >
        <Link
          to="/"
          className={cn(
            "flex min-w-0 items-center gap-3 overflow-visible",
            collapsed ? "justify-center" : "justify-center",
          )}
        >
          <img
            src={faviconCentral}
            alt="Central logomarca"
            className={cn(
              "shrink-0 rounded-2xl bg-white/95 object-contain p-1.5 shadow-sm transition-all",
              collapsed ? "size-10" : "hidden",
            )}
          />
          <img
            src={logoCentral}
            alt="Central Transportes e Serviços"
            className={cn(
              "h-24 w-auto max-w-[320px] min-w-0 scale-[1.35] object-contain object-center transition-all",
              collapsed ? "hidden" : "block",
            )}
          />
        </Link>

        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "absolute right-3 top-1/2 inline-flex size-9 shrink-0 -translate-y-1/2 items-center justify-center rounded-2xl border border-sidebar-border bg-sidebar-accent/80 text-sidebar-foreground/80 transition hover:border-sidebar-primary/40 hover:bg-sidebar-primary/12 hover:text-sidebar-primary",
            collapsed && "hidden",
          )}
          title={collapsed ? "Expandir" : "Recolher"}
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto py-3">
        {collapsed && (
          <div className="px-2 pb-1">
            <button
              type="button"
              onClick={onToggle}
              className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-sidebar-border bg-sidebar-accent/70 text-sidebar-foreground/80 transition hover:border-sidebar-primary/40 hover:bg-sidebar-primary/12 hover:text-sidebar-primary"
              title="Expandir"
              aria-label="Expandir sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </div>
        )}
        <NavSection title="Operacional" items={OPERACIONAL} collapsed={collapsed} />
        <div className="mx-5 my-2 h-px bg-sidebar-border/80" />
        <CadastrosSection collapsed={collapsed} />
        {profile?.isOwner && (
          <>
            <div className="mx-5 my-2 h-px bg-sidebar-border/80" />
            <NavSection title="Administração" items={ADMIN_NAV} collapsed={collapsed} compact />
          </>
        )}
      </div>

      <div className="relative z-10 border-t border-sidebar-border/80 p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/55 p-2.5 shadow-inner",
            collapsed && "justify-center",
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary/16 font-sans text-[12px] font-black text-sidebar-primary ring-1 ring-sidebar-primary/25">
            {initials}
          </div>
          <div className={cn("min-w-0 leading-tight", collapsed && "hidden")}>
            <div className="truncate text-[12px] font-extrabold text-sidebar-accent-foreground">
              {profileLabel}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.16em] text-sidebar-muted">
              Turno diurno
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? "Sair do sistema" : undefined}
          className={cn(
            "mt-2 flex min-h-10 w-full items-center gap-2 rounded-2xl px-3 text-[12.5px] font-bold text-sidebar-foreground/78 transition hover:bg-destructive/12 hover:text-destructive",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="size-4 shrink-0" />
          <span className={cn(collapsed && "hidden")}>Sair do sistema</span>
        </button>
      </div>
    </div>
  );
}

function Topbar({
  profile,
  onLogout,
  onMobileMenu,
}: {
  profile: Profile | null;
  onLogout: () => void;
  onMobileMenu: () => void;
}) {
  const initials = getInitials(profile);
  const navigate = useNavigate();
  const { vehicles, drivers, trailers } = useFleet();
  const [globalSearch, setGlobalSearch] = React.useState("");

  const driverById = React.useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );
  const searchResults = React.useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return [];

    return vehicles
      .map((vehicle) => {
        const driver = vehicle.driverId ? driverById.get(vehicle.driverId) : undefined;
        const trailerLabel = vehicleTrailerLabel(vehicle, trailers, "");
        return { vehicle, driver, trailerLabel };
      })
      .filter(({ vehicle, driver, trailerLabel }) =>
        [vehicle.plate, driver?.name, trailerLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 6);
  }, [driverById, globalSearch, trailers, vehicles]);

  const openVehicle = (vehicleId: string) => {
    setGlobalSearch("");
    navigate({ to: "/mapa", search: { focus: vehicleId } });
  };

  return (
    <header className="glass relative z-20 flex min-h-16 shrink-0 items-center gap-3 border-x-0 border-t-0 px-3 md:rounded-[28px] md:border md:px-5">
      <div className="flex min-w-0 items-center gap-3 md:hidden">
        <button
          type="button"
          onClick={onMobileMenu}
          className="inline-flex size-10 items-center justify-center rounded-2xl border border-border bg-surface-2/70 text-muted-foreground"
          aria-label="Abrir menu"
        >
          <Menu className="size-4" />
        </button>
        <img src={faviconCentral} alt="Central" className="size-10 rounded-2xl object-contain" />
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="field-shell flex h-10 w-full items-center gap-2 rounded-2xl px-3 text-[12px] text-muted-foreground">
          <Search className="size-4 shrink-0 text-primary" />
          <input
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchResults[0])
                openVehicle(searchResults[0].vehicle.id);
              if (event.key === "Escape") setGlobalSearch("");
            }}
            placeholder="Buscar placa, motorista, caçamba..."
            className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
          {globalSearch ? (
            <button
              type="button"
              onClick={() => setGlobalSearch("")}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="ml-auto hidden rounded-lg border border-border bg-surface px-2 py-0.5 font-sans text-[10px] text-muted-foreground md:inline-flex">
              Enter
            </kbd>
          )}
        </div>
        {globalSearch.trim() && (
          <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[var(--shadow-strong)]">
            {searchResults.length > 0 ? (
              searchResults.map(({ vehicle, driver, trailerLabel }) => (
                <button
                  key={vehicle.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openVehicle(vehicle.id)}
                  className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-2.5 text-left last:border-b-0 hover:bg-accent"
                >
                  <Truck className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-[12.5px] font-black text-foreground">
                      {vehicle.plate}
                    </span>
                    <span className="block truncate text-[11px] font-medium text-muted-foreground">
                      {driver?.name ?? "Sem motorista"} · {trailerLabel || "Sem caçamba"}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-[12px] font-semibold text-muted-foreground">
                Nenhum caminhão encontrado.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="relative inline-flex size-10 items-center justify-center rounded-2xl border border-border bg-surface-2/70 text-muted-foreground transition hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
          aria-label="Notificações"
        >
          <Bell className="size-4" />
          <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-primary">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
          </span>
        </button>

        <ThemeToggle className="size-10 rounded-2xl border border-border bg-surface-2/70 hover:border-primary/35 hover:bg-primary/10" />

        <div className="hidden h-10 items-center gap-2 rounded-2xl border border-border bg-surface-2/70 px-2.5 md:flex">
          <div className="flex size-7 items-center justify-center rounded-xl bg-primary/15 font-sans text-[11px] font-black text-primary ring-1 ring-primary/20">
            {initials}
          </div>
          <div className="hidden min-w-0 leading-tight lg:block">
            <div className="max-w-[120px] truncate text-[11.5px] font-bold">
              {profile?.name || "Operador"}
            </div>
            <div className="font-sans text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Online
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex size-10 items-center justify-center rounded-2xl border border-border bg-surface-2/70 text-muted-foreground transition hover:border-destructive/35 hover:bg-destructive/10 hover:text-destructive md:hidden"
          aria-label="Sair"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}

export function AppLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const loadAll = useFleet((s) => s.loadAll);
  const subscribeRealtime = useFleet((s) => s.subscribeRealtime);
  const [checkingAuth, setCheckingAuth] = React.useState(true);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });

  React.useEffect(() => {
    let cancelled = false;
    let unsubscribeRealtime: (() => void) | undefined;

    async function checkAuth() {
      if (loc.pathname === "/login") {
        setCheckingAuth(false);
        return;
      }

      setCheckingAuth(true);
      try {
        await acceptMasterSsoFromUrl(window.location.search);
        const user = await getCurrentUser();
        if (!user) {
          if (!cancelled) {
            window.location.href = getMasterLoginUrl();
          }
          return;
        }

        const loadedProfile = await getProfile(user.id);
        if (!cancelled) {
          setProfile(loadedProfile);
          try {
            await loadAll();
          } catch (error) {
            console.error("Failed to load fleet data after authentication.", error);
          }
          unsubscribeRealtime = subscribeRealtime();
          setCheckingAuth(false);
        }
      } catch {
        if (!cancelled) {
          window.location.href = getMasterLoginUrl();
        }
      }
    }

    void checkAuth();

    return () => {
      cancelled = true;
      unsubscribeRealtime?.();
    };
  }, [loc.pathname, navigate, loadAll, subscribeRealtime]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  if (loc.pathname === "/login") {
    return <Outlet />;
  }

  if (checkingAuth) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-[13px] text-muted-foreground">
        Carregando sistema...
      </div>
    );
  }

  async function handleLogout() {
    await signOut();
    window.location.href = getMasterLoginUrl();
  }

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-background md:p-4">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,color-mix(in_oklch,var(--color-primary)_12%,transparent),transparent_28%),radial-gradient(circle_at_92%_12%,color-mix(in_oklch,var(--color-alert)_8%,transparent),transparent_26%),radial-gradient(circle_at_72%_92%,color-mix(in_oklch,var(--color-maintenance)_10%,transparent),transparent_34%)] dark:bg-[radial-gradient(circle_at_8%_8%,oklch(1_0_0_/_0.04),transparent_28%),radial-gradient(circle_at_92%_12%,oklch(1_0_0_/_0.025),transparent_26%),radial-gradient(circle_at_72%_92%,oklch(1_0_0_/_0.03),transparent_34%)]" />
      </div>

      <aside
        className={cn(
          "group/sidebar relative z-30 hidden shrink-0 transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-[76px]" : "w-[232px]",
        )}
      >
        <SidebarBody
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onLogout={handleLogout}
          profile={profile}
        />
      </aside>

      <div
        className={cn(
          "relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden",
          collapsed ? "md:pl-4" : "md:pl-4",
        )}
      >
        <Topbar
          profile={profile}
          onLogout={handleLogout}
          onMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 overflow-auto overscroll-contain pb-[calc(92px+env(safe-area-inset-bottom))] md:pb-0 md:pt-5">
          <Outlet />
        </main>

        <nav className="glass fixed inset-x-3 bottom-3 z-40 grid h-[76px] grid-cols-6 rounded-[28px] border border-sidebar-border bg-sidebar/88 px-1.5 pb-[env(safe-area-inset-bottom)] text-sidebar-foreground shadow-[var(--shadow-strong)] ring-1 ring-white/8 md:hidden">
          {MOBILE_NAV.map((item) => {
            const active = item.activePaths?.includes(loc.pathname) ?? loc.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group/item relative flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl px-1 pt-1 text-[10px] font-bold transition-all duration-200",
                  active
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/72 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={cn(
                    "absolute inset-x-1 top-1 h-[3px] rounded-full bg-sidebar-primary opacity-0 transition-opacity",
                    active && "opacity-100",
                  )}
                />
                <span
                  className={cn(
                    "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-xl transition-all",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground glow-primary-sm"
                      : "bg-sidebar-accent/70 text-sidebar-foreground/72 group-hover/item:text-sidebar-primary",
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="relative z-10 max-w-full truncate leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[min(88vw,360px)] overflow-y-auto p-0">
          <SheetHeader className="border-b border-border/80 px-5 py-5">
            <div className="flex items-center gap-3">
              <img
                src={faviconCentral}
                alt="Central"
                className="size-10 rounded-2xl bg-white/95 object-contain p-1.5"
              />
              <div className="min-w-0">
                <SheetTitle>Central Transportes</SheetTitle>
                <SheetDescription>Menu operacional</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="space-y-4 p-3">
            <MobileMenuSection
              title="Operacional"
              items={OPERACIONAL}
              currentPath={loc.pathname}
              onNavigate={() => setMobileMenuOpen(false)}
            />
            <MobileMenuSection
              title="Cadastros"
              items={CADASTROS}
              currentPath={loc.pathname}
              onNavigate={() => setMobileMenuOpen(false)}
            />
            {profile?.isOwner && (
              <MobileMenuSection
                title="Administração"
                items={ADMIN_NAV}
                currentPath={loc.pathname}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                void handleLogout();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-[13px] font-bold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4" />
              Sair do sistema
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MobileMenuSection({
  title,
  items,
  currentPath,
  onNavigate,
}: {
  title: string;
  items: Array<NavItem | NavGroup>;
  currentPath: string;
  onNavigate: () => void;
}) {
  return (
    <section>
      <div className="label-tiny px-3 py-2">{title}</div>
      <nav className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isGroup = "items" in item;
          const itemLabel = isGroup ? item.title : item.label;
          const active = isGroup
            ? item.items.some((subItem) => currentPath === subItem.to) ||
              Boolean(item.to && currentPath === item.to)
            : currentPath === item.to;

          if (isGroup && !item.to) {
            return (
              <div key={item.title} className="grid gap-1">
                <div
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[13px] font-bold transition",
                    active
                      ? "border border-primary/25 bg-primary/10 text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-xl",
                      active ? "bg-primary/15" : "bg-surface-2/70",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {itemLabel}
                </div>
                <div className="ml-6 grid gap-1 border-l border-border/70 pl-3">
                  {item.items.map((subItem) => {
                    const SubIcon = subItem.icon;
                    const subActive = currentPath === subItem.to;

                    return (
                      <Link
                        key={subItem.to}
                        to={subItem.to}
                        onClick={onNavigate}
                        className={cn(
                          "flex min-h-10 items-center gap-3 rounded-2xl px-3 text-[12.5px] font-bold transition",
                          subActive
                            ? "border border-primary/25 bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-xl",
                            subActive ? "bg-primary/15" : "bg-surface-2/70",
                          )}
                        >
                          <SubIcon className="size-3.5" />
                        </span>
                        {subItem.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[13px] font-bold transition",
                active
                  ? "border border-primary/25 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-xl",
                  active ? "bg-primary/15" : "bg-surface-2/70",
                )}
              >
                <Icon className="size-4" />
              </span>
              {itemLabel}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
