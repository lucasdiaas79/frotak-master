import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import faviconPng from "@/assets/favicon.png";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="premium-card max-w-md px-6 py-8 text-center">
        <h1 className="font-mono text-7xl font-black text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-extrabold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">A rota solicitada não existe.</p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary-hover"
        >
          Voltar ao Dashboard
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#16a34a" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Frotak" },
      { title: "Central Transportes e Serviços - TMS" },
      { name: "description", content: "Sistema de gestão de frota rodoviária - TMS corporativo." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", href: faviconPng },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
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
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[pwa] service worker registration failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      return;
    }

    window.addEventListener("load", registerServiceWorker, { once: true });
    return () => window.removeEventListener("load", registerServiceWorker);
  }, []);

  return (
    <>
      <AppLayout />
      <Toaster position="top-right" />
    </>
  );
}
