import { Link, useLocation } from "@tanstack/react-router";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  BarChart3,
  FileText,
  Handshake,
  IdCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Package,
  Sparkles,
  X,
} from "lucide-react";
import logoBranca from "@/assets/frotak-logo-branca.png";
import logoPreta from "@/assets/frotak-logo-preta.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import type { ShipperProfile } from "@/lib/shipper/types";

// Moldura do Frotak Embarcador, no mesmo desenho do menu da Frotak: menu lateral em vidro
// grafite, logo branca, grupos com sobrelinha e item ativo em verde com a barrinha.

type Item = {
  to: string;
  label: string;
  short: string;
  icon: ComponentType<{ className?: string }>;
  isNew?: boolean;
};

const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Operação",
    items: [
      { to: "/embarcador", label: "Painel", short: "Painel", icon: LayoutDashboard },
      { to: "/embarcador/cargas", label: "Cargas", short: "Cargas", icon: Package },
      { to: "/embarcador/ia", label: "Frotak IA", short: "IA", icon: Sparkles },
    ],
  },
  {
    title: "Parceiros",
    items: [
      {
        to: "/embarcador/transportadoras",
        label: "Transportadoras",
        short: "Transp.",
        icon: Handshake,
      },
      {
        to: "/embarcador/terceiros",
        label: "Terceiros",
        short: "Terceiros",
        icon: IdCard,
        isNew: true,
      },
      { to: "/embarcador/rede", label: "Rede Frotak", short: "Rede", icon: Network, isNew: true },
    ],
  },
  {
    title: "Controle",
    items: [
      { to: "/embarcador/documentos", label: "Documentos", short: "Docs", icon: FileText },
      { to: "/embarcador/indicadores", label: "Indicadores", short: "Índices", icon: BarChart3 },
    ],
  },
];

const ALL = GROUPS.flatMap((group) => group.items);
const MOBILE_MAIN = [
  "/embarcador",
  "/embarcador/cargas",
  "/embarcador/ia",
  "/embarcador/terceiros",
];

function useActive() {
  const location = useLocation();
  return (to: string) =>
    to === "/embarcador"
      ? location.pathname === "/embarcador" || location.pathname === "/embarcador/"
      : location.pathname === to || location.pathname.startsWith(`${to}/`);
}

export function ShipperShell({
  profile,
  onLogout,
  children,
}: {
  profile?: ShipperProfile;
  onLogout: () => void;
  children: ReactNode;
}) {
  const isActive = useActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const initials = (profile?.companyName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-background md:p-4">
      <aside className="hidden w-[232px] shrink-0 md:flex">
        <div className="glass relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[28px] border-sidebar-border bg-sidebar/80 text-sidebar-foreground shadow-[var(--shadow-soft)]">
          <Link
            to="/embarcador"
            className="flex flex-col gap-1.5 border-b border-sidebar-border/80 px-6 pb-5 pt-6"
          >
            <img src={logoBranca} alt="Frotak" className="h-7 w-auto self-start" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#66BB1A]">
              Embarcador
            </span>
          </Link>
          <div className="flex-1 overflow-y-auto py-2">
            {GROUPS.map((group) => (
              <section key={group.title} className="px-2 py-2">
                <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-muted">
                  {group.title}
                </div>
                <nav className="flex flex-col gap-1">
                  {group.items.map((item) => {
                    const active = isActive(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "group/item relative flex min-h-11 items-center gap-3 overflow-hidden rounded-2xl px-3 text-[13px] font-bold transition-all duration-200",
                          active
                            ? "text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/72 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute inset-0 rounded-2xl border transition-all",
                            active
                              ? "border-sidebar-primary/30 bg-sidebar-primary/14 shadow-sm"
                              : "border-transparent",
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
                          <item.icon className="size-4" />
                        </span>
                        <span className="relative z-10 truncate">{item.label}</span>
                        {item.isNew && (
                          <span className="relative z-10 ml-auto rounded-full bg-[#66BB1A] px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.08em] text-[#10210a]">
                            NOVO
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </section>
            ))}
          </div>
          <div className="space-y-2 border-t border-sidebar-border/80 p-3">
            {profile?.demo && (
              <div className="rounded-2xl border border-sidebar-primary/30 bg-sidebar-primary/12 p-3 text-[12px]">
                <p className="flex items-center gap-1.5 font-bold text-sidebar-primary">
                  <Sparkles className="size-3.5" /> Demonstração
                </p>
                <p className="mt-1 text-sidebar-foreground/70">
                  Dados fictícios para conhecer o portal.
                </p>
                <Link
                  to="/embarcador/cadastro"
                  className="mt-1.5 inline-block font-bold text-sidebar-primary hover:underline"
                >
                  Criar conta grátis
                </Link>
              </div>
            )}
            <div className="flex items-center gap-2.5 rounded-2xl bg-sidebar-accent/50 p-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-[12px] font-extrabold text-sidebar-primary">
                {initials || "FE"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-bold">{profile?.companyName ?? "..."}</p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-sidebar-muted">
                  {profile?.demo ? "Demonstração" : "Plano grátis"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex h-10 w-full items-center gap-2.5 rounded-full px-3 text-[13px] font-semibold text-sidebar-foreground/72 transition hover:bg-destructive/15 hover:text-destructive"
            >
              <LogOut className="size-4" /> {profile?.demo ? "Sair da demonstração" : "Sair"}
            </button>
          </div>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden md:pl-4">
        <header className="flex items-center justify-between gap-3 px-4 py-3 md:rounded-[25px] md:border md:border-border md:bg-surface/80 md:px-5 md:py-2.5 md:backdrop-blur">
          <div className="flex items-center gap-2 md:hidden">
            <img src={logoPreta} alt="Frotak" className="h-5 w-auto dark:hidden" />
            <img src={logoBranca} alt="Frotak" className="hidden h-5 w-auto dark:block" />
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9.5px] font-extrabold tracking-[0.12em] text-primary">
              EMBARCADOR
            </span>
          </div>
          <div className="hidden min-w-0 md:block">
            <p className="label-tiny">Frotak Embarcador · torre de controle das suas cargas</p>
            <p className="truncate text-[14px] font-bold">{profile?.companyName}</p>
          </div>
          <div className="flex items-center gap-2">
            {profile?.demo && (
              <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                Demonstração
              </span>
            )}
            <ThemeToggle />
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 md:flex">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-extrabold text-primary">
                {(profile?.userName ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="max-w-[160px] truncate text-[12.5px] font-bold">
                {profile?.userName}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto overscroll-contain px-4 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-1 md:pb-4 md:pt-5">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>

        <nav className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-full border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur md:hidden">
          {ALL.filter((item) => MOBILE_MAIN.includes(item.to)).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-bold",
                isActive(item.to) ? "bg-primary/12 text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.short}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] font-bold",
              ALL.some((item) => !MOBILE_MAIN.includes(item.to) && isActive(item.to))
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground",
            )}
          >
            <Menu className="size-4" />
            Mais
          </button>
        </nav>

        {moreOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Mais opções">
            <button
              type="button"
              aria-label="Fechar"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMoreOpen(false)}
            />
            <div className="absolute inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] rounded-[28px] border border-border bg-card p-3 shadow-xl">
              <div className="flex items-center justify-between px-2 pb-2">
                <p className="label-tiny">Mais</p>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="inline-flex size-8 items-center justify-center rounded-full border border-border"
                  aria-label="Fechar"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL.filter((item) => !MOBILE_MAIN.includes(item.to)).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-3 py-3 text-[13px] font-bold",
                      isActive(item.to)
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={onLogout}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-border px-3 py-3 text-[13px] font-bold text-muted-foreground"
                >
                  <LogOut className="size-4" /> {profile?.demo ? "Sair da demonstração" : "Sair"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
