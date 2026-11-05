import { useState, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, StatusPill, TableWrap, Td, Th, Tr } from "@/components/kit/ui-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usageLevel, type HealthLevel } from "@/modules/control-panel/domain/control-panel";
import { formatChartTime, formatDateTime } from "@/modules/control-panel/ui/format";

const levelTone = {
  ok: "success",
  warning: "warning",
  critical: "danger",
  idle: "neutral",
} as const;

const levelIcon: Record<HealthLevel, ComponentType<{ className?: string }>> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
  idle: CircleSlash,
};

const levelText: Record<HealthLevel, string> = {
  ok: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
  idle: "text-muted-foreground",
};

/** Estado sempre com ícone e texto: a cor nunca é o único sinal. */
export function LevelBadge({ level, children }: { level: HealthLevel; children: ReactNode }) {
  const Icon = levelIcon[level];
  return (
    <StatusPill tone={levelTone[level]} dot={false} className="whitespace-nowrap">
      <Icon className="size-3.5" />
      {children}
    </StatusPill>
  );
}

export function LevelIcon({ level, className }: { level: HealthLevel; className?: string }) {
  const Icon = levelIcon[level];
  return <Icon className={cn("size-4 shrink-0", levelText[level], className)} />;
}

const meterFill: Record<HealthLevel, string> = {
  ok: "bg-primary",
  warning: "bg-warning",
  critical: "bg-destructive",
  idle: "bg-muted-foreground",
};

export function UsageMeter({
  label,
  percent,
  hint,
  warning,
  critical,
}: {
  label: string;
  percent: number;
  hint?: string;
  warning?: number;
  critical?: number;
}) {
  const safe = Math.max(0, Math.min(100, percent));
  const level = usageLevel(percent, warning, critical);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold">{label}</span>
        <span className="truncate text-muted-foreground tabular-nums">
          {hint ?? `${safe.toFixed(0)}%`}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(safe)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-2 rounded-full transition-[width]", meterFill[level])}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  level,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  level?: HealthLevel;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <article className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <span className="icon-tile size-9 shrink-0 text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-1 truncate text-2xl font-semibold">{value}</p>
      <div className="mt-2 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
        {level ? <LevelIcon level={level} className="size-3.5" /> : null}
        <span className="truncate">{hint}</span>
      </div>
    </article>
  );
}

export function LoadingBlock({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      title="Não foi possível carregar"
      description={error instanceof Error ? error.message : "Tente novamente."}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : undefined
      }
    />
  );
}

const chartRanges = [
  { hours: 1, label: "1 h" },
  { hours: 6, label: "6 h" },
  { hours: 24, label: "24 h" },
  { hours: 168, label: "7 dias" },
];

export function RangeFilter({
  hours,
  onChange,
  ranges = chartRanges,
}: {
  hours: number;
  onChange: (hours: number) => void;
  ranges?: { hours: number; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
      {ranges.map((range) => (
        <Button
          key={range.hours}
          size="sm"
          variant={range.hours === hours ? "default" : "outline"}
          aria-pressed={range.hours === hours}
          onClick={() => onChange(range.hours)}
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
}

type ChartPoint = { ts: number; value: number };

function ChartTooltip({
  active,
  payload,
  title,
  format,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  title: string;
  format: (value: number) => string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-sm font-semibold tabular-nums">{format(point.value)}</p>
      <p className="text-muted-foreground">
        {title} · {formatDateTime(point.ts)}
      </p>
    </div>
  );
}

/**
 * Uma medida por gráfico, nunca dois eixos. Linha de 2 px com lavagem de 10%, valor atual no título,
 * cruz que acompanha o ponteiro e tabela para quem não lê o gráfico.
 */
export function MetricChart({
  title,
  points,
  hours,
  format,
  max,
  emptyHint = "Coletando dados. Cada ponto leva 1 minuto.",
}: {
  title: string;
  points: ChartPoint[];
  hours: number;
  format: (value: number) => string;
  max?: number;
  emptyHint?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const latest = points.at(-1);
  const step = Math.max(1, Math.ceil(points.length / 24));
  const tableRows = points.filter((_, index) => index % step === 0).reverse();

  return (
    <figure className="rounded-2xl border border-border bg-card/60 p-4">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        <span className="text-sm font-semibold tabular-nums">
          {latest ? format(latest.value) : "—"}
        </span>
      </figcaption>
      {points.length < 2 ? (
        <p className="py-14 text-center text-xs text-muted-foreground">{emptyHint}</p>
      ) : showTable ? (
        <TableWrap className="max-h-44 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th className="text-right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((point) => (
                <Tr key={point.ts}>
                  <Td className="py-1.5 text-xs">{formatDateTime(point.ts)}</Td>
                  <Td className="py-1.5 text-right text-xs tabular-nums">{format(point.value)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <div className="h-40" role="img" aria-label={`${title}: gráfico`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => formatChartTime(value, hours)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={56}
              />
              <YAxis
                width={58}
                domain={[0, max ?? "auto"]}
                tickFormatter={format}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickCount={3}
              />
              <Tooltip
                isAnimationActive={false}
                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                content={<ChartTooltip title={title} format={format} />}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="var(--primary)"
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2, fill: "var(--primary)" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {points.length >= 2 ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setShowTable((current) => !current)}
        >
          {showTable ? "Ver gráfico" : "Ver tabela"}
        </button>
      ) : null}
    </figure>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>;
}
