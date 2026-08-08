import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  getPlatformAuthState,
  subscribeToAuth,
  type AuthGateState,
} from "@/lib/auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O recurso que você procura não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado do nosso lado. Tente atualizar ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FrotaK Master · Painel Administrativo" },
      {
        name: "description",
        content:
          "Painel master do SaaS FrotaK: clientes, receita, operações, monitoramento e governança em um único console enterprise.",
      },
      { name: "author", content: "FrotaK" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap",
      },
      { rel: "icon", href: "/frotak-system-icon.png", type: "image/png", sizes: "1122x1122" },
      { rel: "apple-touch-icon", href: "/frotak-system-icon.png", sizes: "1122x1122" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={200}>
          <AuthGate>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
          </AuthGate>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthGateState>({
    status: "LOADING",
    session: null,
  });

  const isLoginRoute = location.pathname === "/login";
  const redirectTarget = (() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    return params.get("redirect") || "/";
  })();

  useEffect(() => {
    let active = true;

    const sync = async () => {
      if (isLoginRoute) {
        setAuthState({ status: "UNAUTHENTICATED", session: null });
        return;
      }

      setAuthState({ status: "LOADING", session: null });
      const nextState = await getPlatformAuthState();
      if (active) setAuthState(nextState);
    };

    void sync();
    const unsubscribe = subscribeToAuth(() => {
      void sync();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isLoginRoute]);

  useEffect(() => {
    if (authState.status === "LOADING") return;

    if (
      (authState.status === "UNAUTHENTICATED" || authState.status === "UNAUTHORIZED") &&
      !isLoginRoute
    ) {
      const next = `${location.pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
      navigate({
        to: "/login",
        search: {
          redirect: next,
          reason: authState.status === "UNAUTHORIZED" ? "unauthorized" : "",
        },
        replace: true,
      });
    }

    if (authState.status === "AUTHENTICATED_PLATFORM_USER" && isLoginRoute) {
      navigate({ to: redirectTarget, replace: true });
    }
  }, [authState.status, isLoginRoute, location.pathname, navigate, redirectTarget]);

  if (authState.status === "LOADING") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground">
          Carregando acesso...
        </div>
      </div>
    );
  }

  if (
    ((authState.status === "UNAUTHENTICATED" || authState.status === "UNAUTHORIZED") &&
      !isLoginRoute) ||
    (authState.status === "AUTHENTICATED_PLATFORM_USER" && isLoginRoute)
  ) {
    return null;
  }

  return <>{children}</>;
}
