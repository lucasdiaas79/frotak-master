import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { getMasterLoginUrl } from "@/lib/auth";
import {
  exchangeSecureMasterHandoff,
  readSecureHandoffFromLocation,
} from "@/lib/clientHandoff";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redirecionando - Frotak" },
      { name: "description", content: "Acesso centralizado pelo Frotak Master." },
    ],
  }),
  component: LoginRedirect,
});

function LoginRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function redirect() {
      const handoff = readSecureHandoffFromLocation();

      if (!handoff.code || !handoff.tenantId || handoff.source !== "frotak-master") {
        window.location.replace(getMasterLoginUrl());
        return;
      }

      try {
        await exchangeSecureMasterHandoff();
        if (!cancelled) navigate({ to: "/", replace: true });
      } catch {
        window.location.replace(getMasterLoginUrl());
      }
    }

    void redirect();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-[13px] text-muted-foreground">
      Carregando sistema...
    </div>
  );
}
