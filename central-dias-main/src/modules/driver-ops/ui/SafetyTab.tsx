import { useState } from "react";
import { Camera, Check, FileBadge, MapPin, Megaphone, Send, Siren, Wrench } from "lucide-react";
import { FrotakEmptyState, FrotakSection } from "@/components/frotak/FrotakPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createNotice,
  listChecklists,
  listComplianceDocs,
  listDrivers,
  listNotices,
  listOccurrences,
  opsFileUrl,
  replyOccurrence,
  resolveChecklist,
  saveComplianceDoc,
  type OccurrenceRow,
} from "@/modules/driver-ops/infrastructure/opsRepository";
import { LoadError, OCCURRENCE_LABEL, StatusBadge, act, dateTime, useLoad } from "./shared";

export function OccurrencesTab() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const list = useLoad(() => listOccurrences(onlyOpen), [onlyOpen], 20_000);
  const [selected, setSelected] = useState<string | null>(null);
  const current = list.data?.find((o) => o.id === selected) ?? list.data?.[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs">
        <Switch checked={onlyOpen} onCheckedChange={setOnlyOpen} id="only-open" />
        <Label htmlFor="only-open">Só abertas</Label>
      </div>
      <LoadError error={list.error} />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <FrotakSection contentClassName="p-0">
          {!list.data?.length ? (
            <FrotakEmptyState
              title="Nenhuma ocorrência"
              description="Pneu, quebra, avaria, recusa e emergência aparecem aqui na hora."
            />
          ) : (
            <ul className="flex max-h-[640px] flex-col divide-y divide-border overflow-y-auto">
              {list.data.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => setSelected(o.id)}
                    className={cn(
                      "flex w-full gap-3 px-5 py-3 text-left text-xs hover:bg-muted/40",
                      current?.id === o.id && "bg-primary/6",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                        o.kind === "emergencia" || o.severity === "alta"
                          ? "bg-destructive/12 text-destructive"
                          : "bg-warning/14 text-warning",
                      )}
                    >
                      {o.kind === "emergencia" ? (
                        <Siren className="size-4" />
                      ) : (
                        <Wrench className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {OCCURRENCE_LABEL[o.kind] ?? o.kind}
                      </span>
                      <span className="block truncate text-muted-foreground">
                        {o.driver?.name ?? "--"} · {o.vehicle?.plate ?? ""} ·{" "}
                        {dateTime(o.occurred_at)}
                      </span>
                    </span>
                    <StatusBadge
                      tone={
                        o.status === "resolvida"
                          ? "muted"
                          : o.status === "em_atendimento"
                            ? "warn"
                            : "danger"
                      }
                    >
                      {o.status === "em_atendimento"
                        ? "Atendendo"
                        : o.status === "resolvida"
                          ? "Resolvida"
                          : "Aberta"}
                    </StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FrotakSection>
        {current ? (
          <OccurrenceDetail key={current.id} occ={current} onChanged={() => void list.reload()} />
        ) : null}
      </div>
    </div>
  );
}

function OccurrenceDetail({ occ, onChanged }: { occ: OccurrenceRow; onChanged: () => void }) {
  const [text, setText] = useState("");
  const send = (status?: string) =>
    act(
      status === "resolvida" ? "Ocorrência encerrada" : "Resposta enviada ao motorista",
      () =>
        replyOccurrence(
          occ.id,
          text || (status === "resolvida" ? "Ocorrência encerrada pela central." : ""),
          status,
        ),
      () => {
        setText("");
        onChanged();
      },
    );
  return (
    <FrotakSection
      title={`${OCCURRENCE_LABEL[occ.kind] ?? occ.kind} · ${occ.driver?.name ?? ""}`}
      description={`${dateTime(occ.occurred_at)} · ${occ.vehicle?.plate ?? "sem veículo"} · gravidade ${occ.severity}`}
      actions={
        <div className="flex gap-2">
          {occ.geo ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps?q=${occ.geo!.lat},${occ.geo!.lng}`,
                  "_blank",
                )
              }
            >
              <MapPin className="size-4" /> Ver no mapa
            </Button>
          ) : null}
          {occ.photo_paths.map((p, i) => (
            <Button
              key={p}
              size="sm"
              variant="outline"
              onClick={() => void opsFileUrl(p).then((u) => window.open(u, "_blank"))}
            >
              <Camera className="size-4" /> Foto {i + 1}
            </Button>
          ))}
        </div>
      }
    >
      <p className="mb-4 text-sm">{occ.note}</p>
      <ol className="mb-4 flex flex-col gap-2">
        {occ.driver_occurrence_messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "max-w-[80%] rounded-[18px] px-4 py-2 text-xs",
              m.author_kind === "central"
                ? "self-end bg-primary text-primary-foreground"
                : "self-start bg-muted",
            )}
          >
            {m.body}
            <span className="mt-1 block text-[10px] opacity-70">{dateTime(m.created_at)}</span>
          </li>
        ))}
      </ol>
      {occ.status !== "resolvida" ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Responder ao motorista (aparece no app dele)"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void send("resolvida")}>
              <Check className="size-4" /> Encerrar
            </Button>
            <Button disabled={!text.trim()} onClick={() => void send("em_atendimento")}>
              <Send className="size-4" /> Responder
            </Button>
          </div>
        </div>
      ) : null}
    </FrotakSection>
  );
}

export function SafetySetupTab({ tenantId }: { tenantId: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChecklistsPanel />
      <DocumentsPanel tenantId={tenantId} />
      <NoticesPanel tenantId={tenantId} />
    </div>
  );
}

function ChecklistsPanel() {
  const [onlyPending, setOnlyPending] = useState(true);
  const list = useLoad(() => listChecklists(onlyPending), [onlyPending]);
  return (
    <FrotakSection
      title="Checklists e manutenção"
      description="Item reprovado abre pendência. Item crítico reprovado trava a saída da viagem."
      actions={
        <div className="flex items-center gap-2 text-xs">
          <Switch checked={onlyPending} onCheckedChange={setOnlyPending} id="chk-pending" />
          <Label htmlFor="chk-pending">Só pendentes</Label>
        </div>
      }
      contentClassName="p-0"
    >
      <LoadError error={list.error} />
      <ul className="flex max-h-[420px] flex-col divide-y divide-border overflow-y-auto">
        {(list.data ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-xs">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {c.vehicle?.plate ?? "--"} · {c.driver?.name ?? "--"} · {c.moment}
              </p>
              <p className="text-muted-foreground">
                {dateTime(c.performed_at)} ·{" "}
                {c.failed_items.length ? `reprovados: ${c.failed_items.join(", ")}` : "tudo ok"}
                {c.maintenance_note ? ` · ${c.maintenance_note}` : ""}
              </p>
            </div>
            <StatusBadge tone={c.approved ? (c.failed_items.length ? "warn" : "ok") : "danger"}>
              {c.approved ? "Liberado" : "Travado"}
            </StatusBadge>
            {c.maintenance_status === "pendente" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const note = window.prompt("O que foi feito na manutenção?") ?? "";
                  void act(
                    "Pendência resolvida",
                    () => resolveChecklist(c.id, note),
                    () => void list.reload(),
                  );
                }}
              >
                Resolver
              </Button>
            ) : null}
          </li>
        ))}
        {!list.data?.length ? (
          <li className="px-5 py-6 text-center text-xs text-muted-foreground">Nada pendente.</li>
        ) : null}
      </ul>
    </FrotakSection>
  );
}

const DOC_KINDS: Record<string, string> = {
  cnh: "CNH",
  toxicologico: "Exame toxicológico",
  aso: "ASO",
  direcao_defensiva: "Direção defensiva",
  nr11: "NR-11",
  mopp: "MOPP",
  integracao_cliente: "Integração do embarcador",
  outro: "Outro",
};

function DocumentsPanel({ tenantId }: { tenantId: string }) {
  const docs = useLoad(listComplianceDocs, []);
  const drivers = useLoad(listDrivers, []);
  const [driverId, setDriverId] = useState("");
  const [kind, setKind] = useState("cnh");
  const [expires, setExpires] = useState("");
  const now = Date.now();
  return (
    <FrotakSection
      title="Documentos dos motoristas"
      description="Aviso 30 dias antes. Documento obrigatório vencido aparece em vermelho no app."
      contentClassName="p-0"
    >
      <LoadError error={docs.error} />
      <ul className="flex max-h-[360px] flex-col divide-y divide-border overflow-y-auto">
        {(docs.data ?? []).map((d) => {
          const days = Math.round(
            (new Date(`${d.expires_at}T12:00:00`).getTime() - now) / 86_400_000,
          );
          return (
            <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-xs">
              <FileBadge
                className={cn(
                  "size-4 shrink-0",
                  days < 0 ? "text-destructive" : days <= 30 ? "text-warning" : "text-primary",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {d.driver?.name ?? "--"} · {d.label}
                </p>
                <p className="text-muted-foreground">
                  Vence {d.expires_at.split("-").reverse().join("/")}{" "}
                  {d.blocking ? "· obrigatório" : ""}
                </p>
              </div>
              {d.file_path ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void opsFileUrl(d.file_path!).then((u) => window.open(u, "_blank"))
                  }
                >
                  Ver
                </Button>
              ) : null}
              {d.status === "enviado" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    const next = window.prompt(
                      "Nova data de vencimento (AAAA-MM-DD)",
                      d.expires_at,
                    );
                    if (!next) return;
                    void act(
                      "Documento conferido",
                      () =>
                        saveComplianceDoc(tenantId, {
                          id: d.id,
                          driver_id: d.driver_id,
                          kind: d.kind,
                          label: d.label,
                          expires_at: next,
                          blocking: d.blocking,
                          status: "valido",
                        }),
                      () => void docs.reload(),
                    );
                  }}
                >
                  Conferir
                </Button>
              ) : (
                <StatusBadge tone={days < 0 ? "danger" : days <= 30 ? "warn" : "ok"}>
                  {days < 0 ? "Vencido" : `${days} dias`}
                </StatusBadge>
              )}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-2 border-t border-border p-5 sm:grid-cols-[1fr_1fr_150px_auto]">
        <Select value={driverId} onValueChange={setDriverId}>
          <SelectTrigger>
            <SelectValue placeholder="Motorista" />
          </SelectTrigger>
          <SelectContent>
            {(drivers.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DOC_KINDS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        <Button
          disabled={!driverId || !expires}
          onClick={() =>
            void act(
              "Documento cadastrado",
              () =>
                saveComplianceDoc(tenantId, {
                  driver_id: driverId,
                  kind,
                  label: DOC_KINDS[kind] ?? kind,
                  expires_at: expires,
                  blocking: kind !== "direcao_defensiva" && kind !== "outro",
                }),
              () => {
                setExpires("");
                void docs.reload();
              },
            )
          }
        >
          Adicionar
        </Button>
      </div>
    </FrotakSection>
  );
}

function NoticesPanel({ tenantId }: { tenantId: string }) {
  const notices = useLoad(listNotices, []);
  const drivers = useLoad(listDrivers, []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("operacao");
  const [ack, setAck] = useState(true);
  const total = drivers.data?.length ?? 0;
  return (
    <FrotakSection
      title="Avisos com ciência"
      description="DDS, regras do cliente e mudanças de janela. O motorista confirma que leu."
      className="xl:col-span-2"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Mensagem para os motoristas"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="seguranca">Segurança</SelectItem>
                <SelectItem value="operacao">Operação</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
                <SelectItem value="rh">RH</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 text-xs">
              <Switch checked={ack} onCheckedChange={setAck} id="notice-ack" />
              <Label htmlFor="notice-ack">Pedir ciência</Label>
            </div>
            <Button
              className="ml-auto"
              disabled={!title.trim() || !body.trim()}
              onClick={() =>
                void act(
                  "Aviso publicado no app",
                  () =>
                    createNotice(tenantId, {
                      title,
                      body,
                      tag,
                      requires_ack: ack,
                      author_label: "Central de operações",
                    }),
                  () => {
                    setTitle("");
                    setBody("");
                    void notices.reload();
                  },
                )
              }
            >
              <Megaphone className="size-4" /> Publicar
            </Button>
          </div>
        </div>
        <ul className="flex max-h-[300px] flex-col divide-y divide-border overflow-y-auto">
          {(notices.data ?? []).map((n) => (
            <li key={n.id} className="py-2.5 text-xs">
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-muted-foreground">
                {dateTime(n.published_at)} ·{" "}
                {n.requires_ack
                  ? `${n.driver_notice_acks.length}/${total} confirmaram`
                  : "sem ciência"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </FrotakSection>
  );
}
