import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, type FrotakAiContext } from "@/lib/frotakAiContext";

// Acoes de escrita da Frotak IA. A IA so PREPARA a acao: a ferramenta devolve um resumo e um
// token assinado. Nada e gravado ate o usuario tocar em "Confirmar" na tela, que chama
// executeFrotakAiAction com esse token. Toda execucao fica registrada em audit_logs.

type Row = Record<string, unknown>;

export const FROTAK_AI_ACTION_TOOL_NAMES = [
  "lancar_despesa_frete",
  "atualizar_situacao_veiculo",
  "registrar_ocorrencia",
] as const;

export type FrotakAiActionName = (typeof FROTAK_AI_ACTION_TOOL_NAMES)[number];

export function isFrotakAiActionName(name: string): name is FrotakAiActionName {
  return (FROTAK_AI_ACTION_TOOL_NAMES as readonly string[]).includes(name);
}

export const FROTAK_AI_EXPENSE_CATEGORIES = [
  "pedagio",
  "alimentacao",
  "estacionamento",
  "manutencao",
  "outros",
] as const;

// Situacoes que a IA pode aplicar. Mudancas de etapa de frete continuam so pela Gestao da Frota.
export const FROTAK_AI_VEHICLE_SITUATIONS = {
  disponivel_patio: "disponivel-patio",
  disponivel_oficina: "disponivel-oficina",
  manutencao: "manutencao",
  quebrado: "parado-quebrado",
  parado: "parado-aguardando-comando",
} as const;

type VehicleSituation = keyof typeof FROTAK_AI_VEHICLE_SITUATIONS;

type ActionPayload =
  | {
      kind: "lancar_despesa_frete";
      vehicleId: string;
      plate: string;
      category: (typeof FROTAK_AI_EXPENSE_CATEGORIES)[number];
      amount: number;
      description: string;
    }
  | {
      kind: "atualizar_situacao_veiculo";
      vehicleId: string;
      plate: string;
      situation: VehicleSituation;
      note?: string;
    }
  | { kind: "registrar_ocorrencia"; vehicleId: string; plate: string; description: string };

type SignedAction = ActionPayload & {
  userId: string;
  workspaceId: string;
  tenantId: string;
  nonce: string;
  exp: number;
  summary: string;
};

const ACTION_TTL_MS = 10 * 60_000;

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function actionSecret() {
  const secret = readEnv("FROTAK_AI_ACTION_SECRET") || readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Acoes da Frotak IA indisponiveis: segredo nao configurado.");
  return secret;
}

function serviceClient() {
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Auditoria indisponivel: service role nao configurada.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(actionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64Url(new Uint8Array(signature));
}

async function signAction(action: SignedAction) {
  const body = base64Url(new TextEncoder().encode(JSON.stringify(action)));
  return `${body}.${await hmac(body)}`;
}

async function verifyAction(token: string): Promise<SignedAction | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(body);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  if (diff !== 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SignedAction;
  } catch {
    return null;
  }
}

function text(args: Row, key: string, max = 200) {
  const value = args[key];
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function plateKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function findVehicle(context: FrotakAiContext, plateInput: string) {
  const key = plateKey(plateInput);
  if (key.length < 3) return null;
  const supabase = getSupabaseServerClient(context.accessToken);
  const { data, error } = await supabase
    .from("vehicles")
    .select(
      "id, plate, status, vehicle_situation, freight_stage, current_freight_id, driver_id, city, state",
    )
    .eq("tenant_id", context.tenantId)
    .ilike("plate", `%${key.split("").join("%")}%`)
    .limit(10);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return (
    rows.find((row) => plateKey(String(row.plate ?? "")) === key) ??
    (rows.length === 1 ? rows[0] : null)
  );
}

function businessError(error: string, code: string) {
  return { error, code };
}

// Chamado pela ferramenta: valida e devolve o pedido de confirmacao. Nao grava nada.
export async function prepareFrotakAiAction(
  context: FrotakAiContext,
  name: FrotakAiActionName,
  args: Row,
): Promise<Row> {
  if (!context.isOwner) {
    return businessError(
      "Somente o owner da empresa pode pedir acoes pela Frotak IA.",
      "OWNER_REQUIRED",
    );
  }
  const vehicle = await findVehicle(context, text(args, "placa", 12));
  if (!vehicle)
    return businessError("Veiculo nao encontrado para essa placa.", "VEHICLE_NOT_FOUND");
  const plate = String(vehicle.plate);
  const vehicleId = String(vehicle.id);

  let payload: ActionPayload;
  let summary: string;
  if (name === "lancar_despesa_frete") {
    const category = text(args, "categoria", 30).toLowerCase();
    if (!(FROTAK_AI_EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      return businessError(
        `Categoria invalida. Use: ${FROTAK_AI_EXPENSE_CATEGORIES.join(", ")}.`,
        "INVALID_ACTION",
      );
    }
    const amount = Math.round(Number(String(args.valor ?? "").replace(",", ".")) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
      return businessError("Informe um valor entre R$ 0,01 e R$ 100.000.", "INVALID_ACTION");
    }
    if (!vehicle.current_freight_id) {
      return businessError(
        `O veiculo ${plate} nao tem frete ativo para lancar despesa.`,
        "NO_ACTIVE_FREIGHT",
      );
    }
    const description = text(args, "descricao") || category;
    payload = {
      kind: name,
      vehicleId,
      plate,
      category: category as (typeof FROTAK_AI_EXPENSE_CATEGORIES)[number],
      amount,
      description,
    };
    summary = `Lancar ${brl(amount)} de ${category} no frete ativo do ${plate} (${description}).`;
  } else if (name === "atualizar_situacao_veiculo") {
    const situation = text(args, "situacao", 30).toLowerCase() as VehicleSituation;
    if (!(situation in FROTAK_AI_VEHICLE_SITUATIONS)) {
      return businessError(
        `Situacao invalida. Use: ${Object.keys(FROTAK_AI_VEHICLE_SITUATIONS).join(", ")}.`,
        "INVALID_ACTION",
      );
    }
    if (vehicle.current_freight_id) {
      return businessError(
        `O ${plate} esta com frete ativo; mude a situacao pela Gestao da Frota para nao quebrar o fluxo do frete.`,
        "ACTIVE_FREIGHT",
      );
    }
    const note = text(args, "observacao") || undefined;
    payload = { kind: name, vehicleId, plate, situation, note };
    summary = `Mudar o ${plate} para ${situation.replace(/_/g, " ")}${note ? ` (${note})` : ""}.`;
  } else {
    const description = text(args, "descricao", 500);
    if (description.length < 3) return businessError("Descreva a ocorrencia.", "INVALID_ACTION");
    payload = { kind: name, vehicleId, plate, description };
    summary = `Registrar ocorrencia no ${plate}: ${description}.`;
  }

  const token = await signAction({
    ...payload,
    userId: context.userId,
    workspaceId: context.workspaceId,
    tenantId: context.tenantId,
    nonce: crypto.randomUUID(),
    exp: Date.now() + ACTION_TTL_MS,
    summary,
  });
  return {
    status: "aguardando_confirmacao",
    resumo: summary,
    instrucao:
      "Nada foi gravado. Leia o resumo para o usuario e peca que ele toque em Confirmar na tela. Nao diga que a acao foi feita.",
    confirmacao: { token, resumo: summary },
  };
}

async function alreadyExecuted(nonce: string) {
  const { data, error } = await serviceClient()
    .from("audit_logs")
    .select("id")
    .like("action", "frotak_ai.%")
    .eq("metadata->>nonce", nonce)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function audit(
  action: SignedAction,
  entityType: string,
  entityId: string | null,
  newData: Row,
) {
  const { error } = await serviceClient()
    .from("audit_logs")
    .insert({
      actor_user_id: action.userId,
      tenant_id: action.tenantId,
      workspace_id: action.workspaceId,
      action: `frotak_ai.${action.kind}`,
      entity_type: entityType,
      entity_id: entityId,
      new_data: newData,
      metadata: { source: "frotak_ia", nonce: action.nonce, summary: action.summary },
    });
  if (error)
    console.error("[frotakAi] audit failed", { message: error.message, kind: action.kind });
}

// Chamado so pelo botao "Confirmar" da tela.
export async function executeFrotakAiAction(context: FrotakAiContext, token: string) {
  const action = await verifyAction(token);
  if (!action) return { ok: false, error: "Confirmacao invalida." };
  if (action.exp < Date.now())
    return { ok: false, error: "A confirmacao expirou. Peca a acao de novo." };
  if (
    action.userId !== context.userId ||
    action.workspaceId !== context.workspaceId ||
    action.tenantId !== context.tenantId
  ) {
    return { ok: false, error: "Esta confirmacao pertence a outro usuario ou empresa." };
  }
  if (!context.isOwner) return { ok: false, error: "Somente o owner pode confirmar acoes." };
  if (await alreadyExecuted(action.nonce))
    return { ok: false, error: "Esta acao ja foi confirmada." };

  const supabase = getSupabaseServerClient(context.accessToken);
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, plate, status, freight_stage, current_freight_id, driver_id, city, state")
    .eq("tenant_id", context.tenantId)
    .eq("id", action.vehicleId)
    .maybeSingle();
  if (vehicleError) return { ok: false, error: vehicleError.message };
  if (!vehicle) return { ok: false, error: "Veiculo nao encontrado." };

  if (action.kind === "lancar_despesa_frete") {
    const freightId = vehicle.current_freight_id as string | null;
    if (!freightId) return { ok: false, error: `O ${action.plate} nao tem mais frete ativo.` };
    const { data: freight } = await supabase
      .from("freights")
      .select("trip_cycle_id")
      .eq("tenant_id", context.tenantId)
      .eq("id", freightId)
      .maybeSingle();
    const { data: expense, error } = await supabase
      .from("freight_expenses")
      .insert({
        tenant_id: context.tenantId,
        freight_id: freightId,
        trip_cycle_id: (freight?.trip_cycle_id as string | null) ?? null,
        vehicle_id: action.vehicleId,
        driver_id: vehicle.driver_id ?? null,
        category: action.category,
        description: action.description,
        amount: action.amount,
        payment_source: "company_payable",
        source: "operator",
        recorded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    await supabase.from("fleet_events").insert({
      tenant_id: context.tenantId,
      vehicle_id: action.vehicleId,
      freight_id: freightId,
      status: vehicle.status,
      freight_stage: vehicle.freight_stage,
      city: vehicle.city,
      state: vehicle.state,
      source: "Operador",
      description: `Despesa lancada pela Frotak IA: ${action.summary}`,
      created_by: context.userId,
      event_type: "frotak_ai_expense_registered",
      action_origin: "frotak_ia",
      metadata: { expense_id: expense.id },
    });
    await audit(action, "freight_expense", String(expense.id), {
      freight_id: freightId,
      category: action.category,
      amount: action.amount,
      description: action.description,
    });
    return { ok: true, message: `Pronto: ${action.summary}` };
  }

  if (action.kind === "atualizar_situacao_veiculo") {
    if (vehicle.current_freight_id) {
      return { ok: false, error: `O ${action.plate} entrou em frete; use a Gestao da Frota.` };
    }
    const status = FROTAK_AI_VEHICLE_SITUATIONS[action.situation];
    const { error } = await supabase.rpc("set_vehicle_status", {
      p_vehicle_id: action.vehicleId,
      p_status: status,
      p_source: "Operador",
      p_description: action.note ? `Frotak IA: ${action.note}` : "Situacao alterada pela Frotak IA",
      p_freight_stage: null,
    });
    if (error) return { ok: false, error: error.message };
    await audit(action, "vehicle", action.vehicleId, {
      old_status: vehicle.status,
      new_status: status,
      note: action.note ?? null,
    });
    return { ok: true, message: `Pronto: ${action.summary}` };
  }

  const { data: event, error } = await supabase
    .from("fleet_events")
    .insert({
      tenant_id: context.tenantId,
      vehicle_id: action.vehicleId,
      freight_id: vehicle.current_freight_id ?? null,
      status: vehicle.status,
      freight_stage: vehicle.freight_stage,
      city: vehicle.city,
      state: vehicle.state,
      source: "Operador",
      description: action.description,
      created_by: context.userId,
      event_type: "ocorrencia",
      action_origin: "frotak_ia",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await audit(action, "fleet_event", String(event.id), { description: action.description });
  return { ok: true, message: `Pronto: ${action.summary}` };
}
