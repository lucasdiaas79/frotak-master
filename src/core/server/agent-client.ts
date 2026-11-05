import { DomainError } from "@/core/domain/domain-error";

/**
 * Com FROTAK_AGENT_URL, cada cliente tem banco próprio, criado pelo agente da VPS de banco. Sem ela,
 * vale o banco único: é o caso da produção atual, que continua funcionando igual.
 */
export function isClientDatabaseMode() {
  return Boolean(process.env.FROTAK_AGENT_URL?.trim());
}

type AgentFailure = { code?: string; message?: string };

/** Fala com o agente pela rede privada entre as VPS. Erro de negócio chega com a mensagem dele. */
export async function agentRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = process.env.FROTAK_AGENT_URL?.trim();
  const token = process.env.FROTAK_AGENT_TOKEN?.trim();
  if (!url || !token) {
    throw new DomainError("UNAVAILABLE", "Servidor sem acesso ao agente dos bancos.");
  }

  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });
  } catch (error) {
    console.error("[agent] sem resposta", path, error);
    throw new DomainError("UNAVAILABLE", "O servidor de bancos não respondeu. Tente novamente.");
  }

  const payload = (await response.json().catch(() => null)) as (T & AgentFailure) | null;
  if (response.ok) return payload as T;

  console.error("[agent] recusou", path, response.status, payload?.code);
  const message = payload?.message ?? "O servidor de bancos recusou o pedido.";
  if (response.status === 400) throw new DomainError("INVALID_INPUT", message);
  if (response.status === 404) throw new DomainError("NOT_FOUND", message);
  if (response.status === 409) throw new DomainError("CONFLICT", message);
  throw new DomainError(
    "UNAVAILABLE",
    "O servidor de bancos não concluiu o pedido. Tente novamente.",
  );
}
