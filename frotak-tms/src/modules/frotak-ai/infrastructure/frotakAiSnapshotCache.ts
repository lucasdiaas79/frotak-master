import type { FrotakAiContext } from "@/modules/frotak-ai/domain/frotakAiContext";

// O retrato do tenant vai no inicio de cada mensagem do chat. Guardar por 1 minuto, por usuario
// (as permissoes mudam o que ele traz), tira tres consultas ao banco das mensagens seguidas.
// Fica fora de frotakAiTools.ts, que so le o banco e e conferido por teste.
const SNAPSHOT_TTL_MS = 60_000;
const MAX_ENTRIES = 500;

export function createSnapshotCache(load: (context: FrotakAiContext) => Promise<string>) {
  const entries = new Map<string, { expiresAt: number; value: Promise<string> }>();

  return (context: FrotakAiContext) => {
    const key = `${context.tenantId}:${context.workspaceId}:${context.userId}`;
    const now = Date.now();
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = load(context).then((snapshot) => {
      // Retrato vazio e falha: nao guarda, para a proxima mensagem tentar de novo.
      if (!snapshot) entries.delete(key);
      return snapshot;
    });
    entries.set(key, { expiresAt: now + SNAPSHOT_TTL_MS, value });
    if (entries.size > MAX_ENTRIES) {
      for (const [entryKey, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(entryKey);
      }
    }
    return value;
  };
}
