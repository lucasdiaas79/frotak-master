import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ShipperShell } from "@/components/shipper/ShipperShell";
import {
  ShipperPortalProvider,
  isDemoMode,
  shipperAccessToken,
  shipperSignOut,
  useShipperPortal,
} from "@/lib/shipper/client";

// Portal do embarcador (Frotak Embarcador). Fica fora do login da transportadora
// (ver AppLayout) e tem login proprio.

export const Route = createFileRoute("/embarcador")({
  head: () => ({
    meta: [
      { title: "Frotak Embarcador" },
      {
        name: "description",
        content: "Acompanhe todas as suas cargas e transportadoras num só lugar.",
      },
    ],
  }),
  component: EmbarcadorLayout,
});

const OPEN_PATHS = [
  "/embarcador/login",
  "/embarcador/cadastro",
  "/embarcador/convite/",
  "/embarcador/demo",
];

function EmbarcadorLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const open = OPEN_PATHS.some((path) => location.pathname.startsWith(path));
  const [state, setState] = useState<"checking" | "demo" | "session">("checking");

  useEffect(() => {
    if (open) return;
    let cancelled = false;
    (async () => {
      if (isDemoMode()) {
        if (!cancelled) setState("demo");
        return;
      }
      const token = await shipperAccessToken();
      if (cancelled) return;
      if (token) setState("session");
      else void navigate({ to: "/embarcador/login", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, navigate]);

  const goLogin = useCallback(() => {
    void navigate({ to: "/embarcador/login", replace: true });
  }, [navigate]);

  const logout = useCallback(async () => {
    await shipperSignOut();
    void navigate({ to: "/embarcador/login", replace: true });
  }, [navigate]);

  if (open) return <Outlet />;
  if (state === "checking") {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background text-[13px] text-muted-foreground">
        Carregando...
      </div>
    );
  }
  return (
    <ShipperPortalProvider demo={state === "demo"} onUnauthorized={goLogin}>
      <PortalFrame onLogout={logout} />
    </ShipperPortalProvider>
  );
}

function PortalFrame({ onLogout }: { onLogout: () => void }) {
  const { data, error, loading } = useShipperPortal();
  return (
    <ShipperShell profile={data?.profile} onLogout={onLogout}>
      {loading && !data ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="premium-card h-28 animate-pulse" />
            ))}
          </div>
          <div className="premium-card h-80 animate-pulse" />
        </div>
      ) : error && !data ? (
        <div className="premium-card px-6 py-10 text-center">
          <h1 className="text-[18px] font-extrabold">Não foi possível carregar</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">{error}</p>
        </div>
      ) : (
        <Outlet />
      )}
    </ShipperShell>
  );
}
