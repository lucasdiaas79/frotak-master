import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { acceptMasterSsoFromUrl } from "@/lib/auth";

const MASTER_LOGIN_URL = "https://login.frotak.log.br";

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
      const params = new URLSearchParams(window.location.search);
      const token = params.get("sso_token");
      const source = params.get("source");

      if (!token || source !== "frotak-master") {
        window.location.replace(MASTER_LOGIN_URL);
        return;
      }

      try {
        await acceptMasterSsoFromUrl(window.location.search);
        if (!cancelled) navigate({ to: "/", replace: true });
      } catch {
        window.location.replace(MASTER_LOGIN_URL);
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
