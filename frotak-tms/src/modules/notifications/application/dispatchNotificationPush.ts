import type { NotificationPushPorts, PushDevice } from "@/modules/notifications/application/ports";
import { pushOutcome, pushPayloadOf } from "@/modules/notifications/domain/notification";

/**
 * Manda ao Windows (Web Push) os avisos pendentes: cada aviso vai para todos os aparelhos do
 * destinatario. Aparelho que o navegador descartou (404/410) sai do cadastro. Falha de um aparelho
 * nao interrompe os outros; o aviso tenta de novo ate o limite e continua no sino de qualquer jeito.
 */
export async function dispatchNotificationPush(
  ports: NotificationPushPorts,
  options: { limit?: number } = {},
) {
  const pending = await ports.listPending(options.limit ?? 300);
  const stats = { avisos: pending.length, enviados: 0, semAparelho: 0, falhas: 0, removidos: 0 };
  if (pending.length === 0) return stats;

  const devices = await ports.listDevices([...new Set(pending.map((item) => item.userId))]);
  const byUser = new Map<string, PushDevice[]>();
  for (const device of devices) {
    byUser.set(device.userId, [...(byUser.get(device.userId) ?? []), device]);
  }

  const gone = new Set<string>();
  const results: Array<{
    id: string;
    status: ReturnType<typeof pushOutcome>;
    attempts: number;
  }> = [];

  for (const notification of pending) {
    const targets = (byUser.get(notification.userId) ?? []).filter(
      (device) => !gone.has(device.id),
    );
    let delivered = 0;
    for (const device of targets) {
      try {
        const result = await ports.send(device, pushPayloadOf(notification));
        if (result.ok) delivered += 1;
        if (result.gone) gone.add(device.id);
      } catch {
        // Aparelho fora do ar: conta como nao entregue.
      }
    }
    const status = pushOutcome({
      devices: targets.length,
      delivered,
      attempts: notification.attempts,
    });
    if (status === "sent") stats.enviados += 1;
    if (status === "skipped") stats.semAparelho += 1;
    if (status === "failed" || status === "pending") stats.falhas += 1;
    results.push({
      id: notification.id,
      status,
      attempts: notification.attempts + (targets.length > 0 ? 1 : 0),
    });
  }

  for (const id of gone) {
    await ports.removeDevice(id);
    stats.removidos += 1;
  }
  await ports.mark(results);
  return stats;
}
