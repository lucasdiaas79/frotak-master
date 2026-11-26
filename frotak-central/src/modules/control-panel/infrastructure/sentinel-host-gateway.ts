import { DomainError } from "@/core/domain/domain-error";
import type { HostGateway, TargetKind } from "@/modules/control-panel/application/ports";
import {
  hostRoles,
  type ContainerMetricPoint,
  type HealEvent,
  type HostResult,
  type HostRole,
  type HostSnapshot,
  type MetricPoint,
  type MetricSeries,
} from "@/modules/control-panel/domain/control-panel";

type SentinelFailure = { code?: string; message?: string };

function baseUrl(role: HostRole) {
  const value =
    role === "db" ? process.env.FROTAK_SENTINEL_DB_URL : process.env.FROTAK_SENTINEL_SERVICE_URL;
  return value?.trim() || null;
}

/** Fala com a sentinela de cada VPS pela rede privada. */
export class SentinelHostGateway implements HostGateway {
  isConfigured() {
    return Boolean(
      process.env.FROTAK_SENTINEL_TOKEN?.trim() && baseUrl("db") && baseUrl("service"),
    );
  }

  private async request<T>(
    role: HostRole,
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 25_000,
  ): Promise<T> {
    const url = baseUrl(role);
    const token = process.env.FROTAK_SENTINEL_TOKEN?.trim();
    if (!url || !token) throw new DomainError("UNAVAILABLE", "Sentinela não configurada.");

    let response: Response;
    try {
      response = await fetch(`${url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      console.error("[sentinela] sem resposta", role, path, error);
      throw new DomainError("UNAVAILABLE", "A sentinela desta VPS não respondeu.");
    }

    const payload = (await response.json().catch(() => null)) as (T & SentinelFailure) | null;
    if (response.ok) return payload as T;

    console.error("[sentinela] recusou", role, path, response.status, payload?.code);
    if (response.status === 404) {
      throw new DomainError("NOT_FOUND", payload?.message ?? "Não encontrado.");
    }
    if (response.status === 400) {
      throw new DomainError("INVALID_INPUT", payload?.message ?? "Pedido inválido.");
    }
    throw new DomainError("UNAVAILABLE", "A sentinela não concluiu o pedido.");
  }

  async hosts(): Promise<HostResult[]> {
    const results = await Promise.allSettled(
      hostRoles.map((role) => this.request<HostSnapshot>(role, "GET", "/overview")),
    );
    return results.map((result, index): HostResult => {
      const role = hostRoles[index];
      return result.status === "fulfilled"
        ? { role, reachable: true, snapshot: result.value }
        : { role, reachable: false, error: "Sem resposta." };
    });
  }

  hostMetrics(role: HostRole, hours: number) {
    return this.request<MetricSeries<MetricPoint>>(role, "GET", `/metrics?hours=${hours}`);
  }

  containerMetrics(role: HostRole, name: string, hours: number) {
    const query = new URLSearchParams({ name, hours: String(hours) });
    return this.request<MetricSeries<ContainerMetricPoint>>(
      role,
      "GET",
      `/container-metrics?${query}`,
    );
  }

  async logs(role: HostRole, kind: TargetKind, name: string, lines: number) {
    const query = new URLSearchParams({ kind, name, lines: String(lines) });
    const { lines: output } = await this.request<{ lines: string[] }>(
      role,
      "GET",
      `/logs?${query}`,
    );
    return output;
  }

  async events(role: HostRole, limit: number) {
    const { events } = await this.request<{ events: HealEvent[] }>(
      role,
      "GET",
      `/events?limit=${limit}`,
    );
    return events;
  }

  async restart(role: HostRole, kind: TargetKind, name: string, actorEmail: string) {
    await this.request(role, "POST", "/restart", { kind, name, actor: actorEmail }, 200_000);
  }

  async setHeal(role: HostRole, enabled: boolean, actorEmail: string) {
    await this.request(role, "POST", "/heal", { enabled, actor: actorEmail });
  }
}
