const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  let current = Math.max(value, 0);
  let unit = 0;
  while (current >= 1024 && unit < BYTE_UNITS.length - 1) {
    current /= 1024;
    unit += 1;
  }
  const digits = current >= 100 || unit === 0 ? 0 : 1;
  return `${current.toLocaleString("pt-BR", { maximumFractionDigits: digits })} ${BYTE_UNITS[unit]}`;
}

export function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${formatBytes(value)}/s`;
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
}

export function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toLocaleString("pt-BR");
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || seconds < 0) return "—";
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
  }
  return `${Math.floor(seconds / 86400)} d ${Math.floor((seconds % 86400) / 3600)} h`;
}

export function formatAgo(epochSeconds: number | null | undefined) {
  if (!epochSeconds) return "—";
  const elapsed = Date.now() / 1000 - epochSeconds;
  return elapsed < 5 ? "agora" : `há ${formatDuration(elapsed)}`;
}

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayAndClock = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(epochSeconds: number | null | undefined) {
  return epochSeconds ? dateTime.format(new Date(epochSeconds * 1000)) : "—";
}

export function formatChartTime(epochSeconds: number, hours: number) {
  const date = new Date(epochSeconds * 1000);
  return hours > 24 ? dayAndClock.format(date) : clock.format(date);
}

/** Aceita ISO do Docker e do Postgres e o formato do systemd ("Thu 2026-11-05 15:25:16 UTC"). */
export function toEpoch(value: string | null | undefined) {
  if (!value || value === "n/a" || value.startsWith("0001-")) return null;
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) return direct / 1000;
  const match = /(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (\w+)/.exec(value);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T${match[2]}${match[3] === "UTC" ? "Z" : ""}`);
  return Number.isNaN(parsed) ? null : parsed / 1000;
}

const serviceNames: Record<string, string> = {
  caddy: "Caddy (HTTPS)",
  "frotak-app@master": "Master",
  "frotak-app@tms": "TMS",
  "redis-server": "Redis",
  "wg-quick@wg0": "WireGuard",
  docker: "Docker",
  "frotak-agent": "Agente dos bancos",
  pgbouncer: "PgBouncer",
  "frotak-sentinel": "Sentinela",
};

export function serviceLabel(name: string) {
  return serviceNames[name] ?? name;
}
