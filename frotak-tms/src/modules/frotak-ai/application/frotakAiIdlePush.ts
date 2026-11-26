import type {
  AiModuleGate,
  IdleFleetReader,
  IdleFleetSummary,
  PushMessage,
  PushSender,
  PushSubscription,
  PushSubscriptionStore,
} from "@/modules/frotak-ai/application/ports";

function idleMessage(result: IdleFleetSummary): PushMessage {
  const shown = result.veiculos.slice(0, 3).map((row) => {
    const days = row.dias_parado === null ? "" : ` ha ${Math.max(1, Math.round(row.dias_parado))}d`;
    const reason = row.precisa_motivo ? "sem motivo" : row.motivo.replace(/ \(.*\)$/, "");
    return `${row.placa}${days} (${reason})`;
  });
  const rest = result.quantidade - shown.length;
  return {
    title: `${result.quantidade} ${result.quantidade === 1 ? "veiculo" : "veiculos"} sem viagem ha mais de ${result.horas_minimas}h`,
    body: `${shown.join("; ")}${rest > 0 ? ` e mais ${rest}` : ""}.`,
    url: "/frotak-ia",
    tag: "frotak-veiculos-parados",
  };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Um aviso por aparelho, so quando ha veiculo parado e a empresa tem a Frotak IA liberada.
 * Assinaturas expiradas sao apagadas; falha num workspace nao interrompe os demais.
 */
export async function dispatchIdlePush(deps: {
  store: PushSubscriptionStore;
  sender: PushSender;
  idleFleet: IdleFleetReader;
  module: AiModuleGate;
}) {
  const subscriptions = await deps.store.listAll();
  const byWorkspace = new Map<string, PushSubscription[]>();
  for (const row of subscriptions) {
    byWorkspace.set(row.workspaceId, [...(byWorkspace.get(row.workspaceId) ?? []), row]);
  }

  const stats = {
    workspaces: byWorkspace.size,
    enviados: 0,
    removidos: 0,
    falhas: 0,
    semModulo: 0,
  };

  for (const [workspaceId, rows] of byWorkspace) {
    try {
      if (!(await deps.module.isEnabled(workspaceId))) {
        stats.semModulo += rows.length;
        continue;
      }
    } catch (error) {
      stats.falhas += rows.length;
      console.error("[frotakPush] entitlement check failed", {
        workspaceId,
        message: messageOf(error),
      });
      continue;
    }

    const activeUsers = await deps.store.listActiveMembers(workspaceId);
    const targets = rows.filter((row) => activeUsers.has(row.userId));
    if (!targets.length) continue;

    let idle: IdleFleetSummary;
    try {
      idle = await deps.idleFleet.listIdle(targets[0]);
    } catch (error) {
      stats.falhas += targets.length;
      console.error("[frotakPush] idle check failed", { workspaceId, message: messageOf(error) });
      continue;
    }
    if (!idle.quantidade) continue;
    const message = idleMessage(idle);

    for (const row of targets) {
      try {
        const sent = await deps.sender.send(row, message);
        if (sent.gone) {
          await deps.store.remove(row.id);
          stats.removidos += 1;
        } else if (sent.ok) {
          await deps.store.markSent(row.id);
          stats.enviados += 1;
        } else {
          await deps.store.markFailed(row.id, sent.status);
          stats.falhas += 1;
        }
      } catch (error) {
        stats.falhas += 1;
        console.error("[frotakPush] send failed", { workspaceId, message: messageOf(error) });
      }
    }
  }

  console.info("[frotakPush] dispatch", stats);
  return stats;
}
