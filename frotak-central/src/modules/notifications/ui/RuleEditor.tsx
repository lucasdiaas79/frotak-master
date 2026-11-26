import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  audienceRoles,
  fieldOf,
  linkTargets,
  notificationSources,
  opLabels,
  opsFor,
  sourceOf,
  triggerLabels,
  triggerWatchesChanges,
  valuelessOps,
  type CatalogField,
  type ConditionOp,
  type NotificationSource,
  type TriggerKind,
} from "@/modules/notifications/domain/catalog";
import {
  renderPreview,
  type NotificationCondition,
  type NotificationRuleDraft,
} from "@/modules/notifications/domain/rule";
import type { TenantOption } from "@/modules/notifications/domain/rule";

const ALL_CLIENTS = "__todos__";

const textareaClass =
  "flex min-h-[84px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function firstOp(field: CatalogField, trigger: TriggerKind): ConditionOp {
  return opsFor(field, trigger)[0];
}

/** Formulario da regra. Quem salva e valida de verdade e o servidor (validateRule). */
export function RuleEditor({
  draft,
  tenants,
  canTouchAllClients,
  onChange,
}: {
  draft: NotificationRuleDraft;
  tenants: TenantOption[];
  canTouchAllClients: boolean;
  onChange: (draft: NotificationRuleDraft) => void;
}) {
  const source = sourceOf(draft.source) ?? notificationSources[0];
  const lastText = useRef<"title" | "body">("title");
  const set = (patch: Partial<NotificationRuleDraft>) => onChange({ ...draft, ...patch });

  function changeSource(key: NotificationSource) {
    const next = sourceOf(key) ?? notificationSources[0];
    const trigger = next.triggers.includes(draft.triggerKind)
      ? draft.triggerKind
      : next.triggers[0];
    set({
      source: next.key,
      triggerKind: trigger,
      watchFields: [],
      conditions: [],
      linkPath: next.defaultLink,
    });
  }

  function changeTrigger(trigger: TriggerKind) {
    // Condicoes de "mudou" so existem em alteracao: saem se o gatilho deixar de observar mudancas.
    const conditions = draft.conditions.filter((condition) => {
      const field = fieldOf(source, condition.field);
      return field ? opsFor(field, trigger).includes(condition.op) : false;
    });
    set({
      triggerKind: trigger,
      watchFields: triggerWatchesChanges(trigger) ? draft.watchFields : [],
      conditions,
    });
  }

  function updateCondition(index: number, patch: Partial<NotificationCondition>) {
    set({
      conditions: draft.conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition,
      ),
    });
  }

  function insertField(key: string) {
    const token = `{{${key}}}`;
    if (lastText.current === "body") set({ bodyTemplate: `${draft.bodyTemplate} ${token}`.trim() });
    else set({ titleTemplate: `${draft.titleTemplate} ${token}`.trim() });
  }

  const preview = useMemo(
    () => ({
      title: renderPreview(draft.titleTemplate, source.sample),
      body: renderPreview(draft.bodyTemplate, source.sample),
    }),
    [draft.titleTemplate, draft.bodyTemplate, source],
  );

  return (
    <div className="grid gap-4">
      <Section title="Regra">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rule-name">Nome</Label>
            <Input
              id="rule-name"
              value={draft.name}
              maxLength={120}
              placeholder="Ex.: Frete chegou para descarregar"
              onChange={(event) => set({ name: event.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Para quais clientes</Label>
            <Select
              value={draft.tenantId ?? ALL_CLIENTS}
              onValueChange={(value) => set({ tenantId: value === ALL_CLIENTS ? null : value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CLIENTS} disabled={!canTouchAllClients}>
                  Todos os clientes{canTouchAllClients ? "" : " (só administrador)"}
                </SelectItem>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rule-description">
            Descrição (aparece para o usuário nas preferências)
          </Label>
          <Input
            id="rule-description"
            value={draft.description ?? ""}
            maxLength={300}
            placeholder="Ex.: Avisa quando o caminhão chega no cliente para descarregar."
            onChange={(event) => set({ description: event.target.value })}
          />
        </div>
      </Section>

      <Section
        title="Quando avisar"
        hint="O que a regra observa e em que momento ela confere as condições."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Observa</Label>
            <Select
              value={source.key}
              onValueChange={(value) => changeSource(value as NotificationSource)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {notificationSources.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{source.description}</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Dispara</Label>
            <Select
              value={draft.triggerKind}
              onValueChange={(value) => changeTrigger(value as TriggerKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {source.triggers.map((trigger) => (
                  <SelectItem key={trigger} value={trigger}>
                    {triggerLabels[trigger]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.triggerKind === "schedule" ? (
              <p className="text-xs text-muted-foreground">
                Cada registro avisa uma vez enquanto os campos das condições não mudam.
              </p>
            ) : null}
          </div>
        </div>

        {triggerWatchesChanges(draft.triggerKind) ? (
          <div className="grid gap-2">
            <Label>
              Só avisar quando um destes campos mudar (nenhum marcado: qualquer mudança)
            </Label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {source.fields.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.watchFields.includes(field.key)}
                    onCheckedChange={(checked) =>
                      set({
                        watchFields: checked
                          ? [...draft.watchFields, field.key]
                          : draft.watchFields.filter((key) => key !== field.key),
                      })
                    }
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Condições"
        hint="Todas precisam valer. Sem condição, avisa a cada vez que a regra dispara."
      >
        {draft.conditions.map((condition, index) => {
          const field = fieldOf(source, condition.field) ?? source.fields[0];
          const ops = opsFor(field, draft.triggerKind);
          return (
            <div
              key={index}
              className="grid gap-2 rounded-xl bg-muted/40 p-3 md:grid-cols-[1fr_1fr_1.2fr_auto]"
            >
              <Select
                value={field.key}
                onValueChange={(key) => {
                  const next = fieldOf(source, key) ?? field;
                  updateCondition(index, {
                    field: next.key,
                    op: firstOp(next, draft.triggerKind),
                    value: undefined,
                  });
                }}
              >
                <SelectTrigger aria-label="Campo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {source.fields.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={ops.includes(condition.op) ? condition.op : ops[0]}
                onValueChange={(op) =>
                  updateCondition(index, { op: op as ConditionOp, value: undefined })
                }
              >
                <SelectTrigger aria-label="Comparação">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ops.map((op) => (
                    <SelectItem key={op} value={op}>
                      {opLabels[op]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ConditionValueInput
                field={field}
                op={condition.op}
                value={condition.value}
                onChange={(value) => updateCondition(index, { value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover condição"
                onClick={() =>
                  set({ conditions: draft.conditions.filter((_, position) => position !== index) })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl"
            disabled={draft.conditions.length >= 10}
            onClick={() => {
              const field = source.fields[0];
              set({
                conditions: [
                  ...draft.conditions,
                  { field: field.key, op: firstOp(field, draft.triggerKind) },
                ],
              });
            }}
          >
            <Plus className="size-4" />
            Adicionar condição
          </Button>
        </div>
      </Section>

      <Section
        title="Texto do aviso"
        hint="Clique num campo para inserir no título ou no texto. Trecho entre [[ e ]] some quando algum campo dentro dele estiver vazio."
      >
        <div className="flex flex-wrap gap-1.5">
          {source.fields.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => insertField(field.key)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              {`{{${field.key}}}`}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rule-title">Título</Label>
          <Input
            id="rule-title"
            value={draft.titleTemplate}
            maxLength={140}
            onFocus={() => (lastText.current = "title")}
            onChange={(event) => set({ titleTemplate: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rule-body">Texto</Label>
          <textarea
            id="rule-body"
            className={textareaClass}
            value={draft.bodyTemplate}
            maxLength={500}
            onFocus={() => (lastText.current = "body")}
            onChange={(event) => set({ bodyTemplate: event.target.value })}
          />
        </div>
        <div className="rounded-2xl border border-border bg-elevated/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prévia com dados de exemplo
          </p>
          <p className="mt-2 text-sm font-semibold">{preview.title || "Sem título"}</p>
          {preview.body ? (
            <p className="mt-1 text-sm text-muted-foreground">{preview.body}</p>
          ) : null}
        </div>
      </Section>

      <Section title="Quem recebe e o que acontece ao clicar">
        <div className="grid gap-2">
          <Label>Papéis no sistema do cliente (nenhum marcado: todos os usuários ativos)</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {audienceRoles.map((role) => (
              <label key={role.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.audienceRoles.includes(role.value)}
                  onCheckedChange={(checked) =>
                    set({
                      audienceRoles: checked
                        ? [...draft.audienceRoles, role.value]
                        : draft.audienceRoles.filter((code) => code !== role.value),
                    })
                  }
                />
                {role.label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Ao clicar, abre</Label>
            <Select
              value={draft.linkPath ?? source.defaultLink}
              onValueChange={(value) => set({ linkPath: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {linkTargets.map((target) => (
                  <SelectItem key={target.value} value={target.value}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid content-start gap-3 pt-1">
            <label className="flex items-center justify-between gap-3 text-sm">
              Aviso do Windows ligado por padrão
              <Switch
                checked={draft.pushDefault}
                onCheckedChange={(pushDefault) => set({ pushDefault })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Regra ativa
              <Switch checked={draft.active} onCheckedChange={(active) => set({ active })} />
            </label>
          </div>
        </div>
      </Section>
    </div>
  );
}

function ConditionValueInput({
  field,
  op,
  value,
  onChange,
}: {
  field: CatalogField;
  op: ConditionOp;
  value: NotificationCondition["value"];
  onChange: (value: NotificationCondition["value"]) => void;
}) {
  if (valuelessOps.includes(op)) {
    return <p className="self-center text-xs text-muted-foreground">Sem valor a informar.</p>;
  }
  if ((op === "in" || op === "not_in") && field.options) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex max-h-32 flex-col gap-1.5 overflow-y-auto rounded-lg border border-input bg-background p-2">
        {field.options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  if (field.options) {
    return (
      <Select value={typeof value === "string" ? value : undefined} onValueChange={onChange}>
        <SelectTrigger aria-label="Valor">
          <SelectValue placeholder="Escolha" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "boolean") {
    return (
      <Select value={value === undefined ? undefined : String(value)} onValueChange={onChange}>
        <SelectTrigger aria-label="Valor">
          <SelectValue placeholder="Escolha" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Sim</SelectItem>
          <SelectItem value="false">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  const numeric = field.type === "number" || op === "within_days";
  return (
    <Input
      aria-label="Valor"
      type={numeric ? "number" : "text"}
      inputMode={numeric ? "decimal" : undefined}
      placeholder={op === "within_days" ? "Dias (ex.: 30)" : "Valor"}
      value={value === undefined || Array.isArray(value) ? "" : String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
