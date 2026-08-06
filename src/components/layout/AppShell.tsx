import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Bell, LogOut, Search, Sparkles } from "lucide-react";
import { navGroups } from "@/lib/nav";
import { getWorkspaceNavGroups } from "@/lib/workspaces";
import { cn } from "@/lib/utils";
import { clearSession, getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const groups = getWorkspaceNavGroups(location.pathname, navGroups);
  const session = getSession();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-sidebar/90 px-4 py-4 text-sidebar-foreground lg:border-r lg:border-b-0 lg:px-5">
          <div className="flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar/80 px-3 py-3">
            <div className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">FrotaK</p>
              <p className="truncate text-xs text-sidebar-foreground/70">Master Console</p>
            </div>
          </div>

          {session ? (
            <div className="mt-4 rounded-2xl border border-sidebar-border bg-sidebar/70 px-3 py-3">
              <p className="truncate text-sm font-semibold">{session.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/70">{session.email}</p>
              <p className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/55">
                {session.role}
              </p>
            </div>
          ) : null}

          <nav className="mt-6 space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-[11px] font-semibold tracking-[0.14em] text-sidebar-foreground/55 uppercase">
                  {group.label}
                </p>
                <div className="mt-2 space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      item.to === "/"
                        ? location.pathname === "/"
                        : location.pathname === item.to ||
                          location.pathname.startsWith(`${item.to}/`);

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-full bg-sidebar-border px-2 py-0.5 text-[10px] font-semibold">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-6">
            <Button
              variant="outline"
              className="w-full justify-center rounded-xl border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => {
                clearSession();
                navigate({ to: "/login", replace: true });
              }}
            >
              <LogOut className="size-4" />
              Sair
            </Button>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                <Search className="size-4 shrink-0" />
                <span className="truncate">Buscar clientes, módulos e eventos</span>
              </div>
              <button className="grid size-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground">
                <Bell className="size-4" />
              </button>
            </div>
          </header>

          <div className="px-4 py-4 lg:px-8 lg:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
