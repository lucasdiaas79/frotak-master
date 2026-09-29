const performanceEnabled = import.meta.env.DEV || import.meta.env.VITE_PERF_DEBUG === "1";

const counters = new Map<string, number>();

export function perfStart(label: string, metadata?: Record<string, string | number | boolean>) {
  if (!performanceEnabled) return () => 0;

  const startedAt = performance.now();
  console.debug(`[perf] ${label}:start`, metadata ?? {});
  return () => {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    console.debug(`[perf] ${label}:end`, { durationMs, ...(metadata ?? {}) });
    return durationMs;
  };
}

export function perfCount(label: string, metadata?: Record<string, string | number | boolean>) {
  if (!performanceEnabled) return 0;

  const count = (counters.get(label) ?? 0) + 1;
  counters.set(label, count);
  console.debug(`[perf] ${label}`, { count, ...(metadata ?? {}) });
  return count;
}

export function perfRender(screen: string) {
  return perfCount(`render:${screen}`);
}
