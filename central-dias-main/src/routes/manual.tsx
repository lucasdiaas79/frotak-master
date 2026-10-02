import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Banknote,
  BookOpenCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Fuel,
  Landmark,
  MapPinned,
  MonitorCheck,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  WalletCards,
  X,
} from "lucide-react";

export const Route = createFileRoute("/manual")({
  head: () => ({
    meta: [
      { title: "Manual Operacional - Frotak" },
      {
        name: "description",
        content: "Manual completo de uso da Central Frotak e do app motorista.",
      },
    ],
  }),
  component: ManualPage,
});

type IconType = ComponentType<{ className?: string }>;
type Topic = "todos" | "operacao" | "motorista" | "financeiro" | "cadastros" | "suporte";

interface ManualModule {
  title: string;
  topic: Exclude<Topic, "todos">;
  icon: IconType;
  summary: string;
  items: string[];
}

interface FlowStep {
  title: string;
  text: string;
}

const topics: Array<{ key: Topic; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "operacao", label: "Operação" },
  { key: "motorista", label: "App motorista" },
  { key: "financeiro", label: "Financeiro" },
  { key: "cadastros", label: "Cadastros" },
  { key: "suporte", label: "Suporte" },
];

const modules: ManualModule[] = [
  {
    title: "Dashboard operacional",
    topic: "operacao",
    icon: MonitorCheck,
    summary: "Visão rápida da frota, alertas e situação dos veículos em operação.",
    items: [
      "Acompanhar frota em rota, parada, quebrada ou em manutenção.",
      "Usar busca por placa, motorista ou caçamba.",
      "Abrir detalhes do veículo para conferir motorista, caçamba, cidade e status.",
    ],
  },
  {
    title: "Gestão de frota",
    topic: "operacao",
    icon: ClipboardList,
    summary: "Tela principal para criar fretes, tiros longos e comandar etapas.",
    items: [
      "Criar frete normal com cavalo, motorista, caçamba, origem, destino e produto.",
      "Criar tiro longo com múltiplos fretes e acompanhar o ciclo completo.",
      "Enviar comandos, solicitar retorno ao pátio e liberar próximas etapas.",
    ],
  },
  {
    title: "App motorista",
    topic: "motorista",
    icon: Smartphone,
    summary: "Fluxo do motorista para executar frete, anexar documentos e confirmar etapas.",
    items: [
      "Entrar com telefone cadastrado e senha temporária ou definitiva.",
      "Receber CT-e, visualizar documentos e avançar conforme a etapa atual.",
      "Confirmar chegada, carregamento, descarga, retorno e anexar comprovantes.",
    ],
  },
  {
    title: "Documentos e CT-e",
    topic: "motorista",
    icon: FileText,
    summary: "Organização dos arquivos que acompanham o frete.",
    items: [
      "Anexar CT-e e comprovantes no frete correto.",
      "Disponibilizar download e visualização para o motorista.",
      "Conferir se o documento pertence ao frete ativo antes de finalizar.",
    ],
  },
  {
    title: "Abastecimentos",
    topic: "financeiro",
    icon: Fuel,
    summary: "Controle de diesel, ARLA, fotos da bomba e comprovantes.",
    items: [
      "Registrar posto, litros, valor, data, veículo e motorista.",
      "Anexar foto da bomba e foto do comprovante pelo app motorista.",
      "Acompanhar consumo por abastecimento e média por frete/tiro longo.",
    ],
  },
  {
    title: "Financeiro",
    topic: "financeiro",
    icon: Landmark,
    summary: "Agenda de pagamentos, contas, DRE, caixa e títulos.",
    items: [
      "Gerar contas a pagar de abastecimentos e despesas operacionais.",
      "Pagar títulos individualmente ou em lote na agenda de pagamentos.",
      "Conferir DRE, fluxo de caixa, contas bancárias e rentabilidade.",
    ],
  },
  {
    title: "Cadastros",
    topic: "cadastros",
    icon: Truck,
    summary: "Base operacional usada pelos fretes e relatórios.",
    items: [
      "Manter veículos, caçambas, motoristas, clientes, remetentes e destinatários.",
      "Conferir vínculo entre cavalo e caçamba para evitar bloqueios indevidos.",
      "Cadastrar produtos e informações fiscais necessárias para o frete.",
    ],
  },
  {
    title: "Históricos e mapa",
    topic: "suporte",
    icon: MapPinned,
    summary: "Consulta de viagens encerradas e posição operacional da frota.",
    items: [
      "Consultar histórico de fretes e tiros longos finalizados.",
      "Revisar entradas, despesas, saldo e diárias do ciclo.",
      "Usar o mapa para localizar veículos e entender a operação em tempo real.",
    ],
  },
];

const flows: FlowStep[] = [
  {
    title: "Conferir cadastros",
    text: "Confirme motorista ativo, cavalo disponível, caçamba correta, cliente, origem, destino e produto.",
  },
  {
    title: "Criar o frete",
    text: "Na Gestão de Frota, escolha o modo correto, preencha dados comerciais e salve o frete ou o tiro longo.",
  },
  {
    title: "Enviar para o motorista",
    text: "O app motorista recebe a etapa ativa. A Central acompanha status, comandos e documentos necessários.",
  },
  {
    title: "Executar etapas",
    text: "O motorista confirma chegada, carregamento, deslocamento, descarga, anexos e retorno quando solicitado.",
  },
  {
    title: "Fechar e auditar",
    text: "Revise documentos, abastecimentos, despesas, caixa do motorista, títulos a pagar e histórico do frete.",
  },
];

const roles = [
  {
    title: "Gestor operacional",
    icon: ShieldCheck,
    items: [
      "Criar e acompanhar fretes.",
      "Comandar retorno ao pátio.",
      "Ver status em tempo real.",
      "Resolver bloqueios de cavalo, motorista ou caçamba.",
    ],
  },
  {
    title: "Motorista",
    icon: Smartphone,
    items: [
      "Abrir o app motorista.",
      "Seguir a etapa exibida.",
      "Anexar fotos e comprovantes.",
      "Confirmar chegada, carga, descarga e retorno.",
    ],
  },
  {
    title: "Financeiro",
    icon: WalletCards,
    items: [
      "Conferir agenda de pagamentos.",
      "Pagar títulos em lote.",
      "Separar despesas de abastecimentos.",
      "Analisar DRE, caixa e fluxo financeiro.",
    ],
  },
  {
    title: "Administrador",
    icon: Users,
    items: [
      "Cadastrar usuários e motoristas.",
      "Manter permissões.",
      "Atualizar cadastros base.",
      "Garantir dados consistentes para relatórios.",
    ],
  },
];

const quickChecks = [
  "Caçamba bloqueada geralmente está vinculada a outro cavalo ou em frete ativo.",
  "Abastecimento não deve entrar como despesa do caixa do motorista; deve gerar título a pagar.",
  "CT-e precisa estar anexado ao frete atual para aparecer corretamente no app motorista.",
  "Fotos de bomba e comprovante devem ser testadas no celular físico.",
  "Retorno ao pátio depende da solicitação feita na Central e da confirmação no app motorista.",
  "Média por frete depende de odômetro inicial, odômetro final e abastecimentos vinculados.",
];

const anchors = [
  { href: "#visao-geral", label: "Visão geral" },
  { href: "#fluxo", label: "Fluxo" },
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#perfis", label: "Perfis" },
  { href: "#suporte", label: "Suporte" },
];

function ManualPage() {
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<Topic>("todos");
  const normalizedQuery = normalize(query);

  const filteredModules = useMemo(() => {
    return modules.filter((module) => {
      const matchesTopic = activeTopic === "todos" || module.topic === activeTopic;
      const searchable = normalize([module.title, module.summary, ...module.items].join(" "));
      return matchesTopic && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [activeTopic, normalizedQuery]);

  const filteredChecks = useMemo(() => {
    if (!normalizedQuery) return quickChecks;
    return quickChecks.filter((item) => normalize(item).includes(normalizedQuery));
  }, [normalizedQuery]);

  const visibleChecks =
    activeTopic === "todos" || activeTopic === "suporte"
      ? filteredChecks
      : filteredChecks.slice(0, 3);

  return (
    <div className="h-screen overflow-y-auto scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/88 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <a href="#visao-geral" className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-32 items-center justify-center rounded-2xl border border-border bg-white px-3 shadow-sm">
              <img
                src="/frotak-login-logo-black.png"
                alt="Frotak"
                className="max-h-10 w-full object-contain"
              />
            </span>
            <span className="hidden text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground sm:block">
              Manual operacional
            </span>
          </a>

          <nav className="flex gap-1 overflow-x-auto pb-1 lg:pb-0">
            {anchors.map((anchor) => (
              <a
                key={anchor.href}
                href={anchor.href}
                className="whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-extrabold text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              >
                {anchor.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <section id="visao-geral" className="px-4 py-8 md:py-12">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="mb-5 inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary">
                Central Frotak + app motorista
              </div>
              <h1 className="max-w-4xl text-4xl font-black tracking-normal text-foreground md:text-6xl">
                Manual completo para operar fretes, tiro longo, documentos e financeiro.
              </h1>
              <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-muted-foreground">
                Use esta página como guia de treinamento e consulta rápida. Pesquise por palavras,
                filtre por tópico e navegue pelas seções principais da operação.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <Metric label="Perfis cobertos" value="4" />
                <Metric label="Módulos" value="8" />
                <Metric label="Fluxo" value="5 etapas" />
              </div>
            </div>

            <div className="rounded-[32px] border border-border bg-card/86 p-4 shadow-card">
              <div className="grid gap-3">
                <HeroPill icon={RouteIcon} label="Frete normal e tiro longo" />
                <HeroPill icon={FileText} label="CT-e, comprovantes e documentos" />
                <HeroPill icon={Fuel} label="Abastecimentos e média KM/L" />
                <HeroPill icon={Banknote} label="Agenda, caixa, DRE e títulos" />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/52 px-4 py-5">
          <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-primary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por CT-e, abastecimento, motorista, caçamba, DRE..."
                className="h-14 w-full rounded-2xl border border-border bg-background/90 pl-12 pr-12 text-sm font-bold text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-4 focus:ring-primary/12"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 lg:justify-end lg:pb-0">
              {topics.map((topic) => (
                <button
                  key={topic.key}
                  type="button"
                  onClick={() => setActiveTopic(topic.key)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-[12px] font-extrabold transition ${
                    activeTopic === topic.key
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background/72 text-muted-foreground hover:border-primary/35 hover:text-primary"
                  }`}
                >
                  {topic.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-[24px] border border-border bg-card/82 p-4 shadow-card">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                Tópicos
              </p>
              <div className="mt-3 grid gap-1">
                {anchors.map((anchor) => (
                  <a
                    key={anchor.href}
                    href={anchor.href}
                    className="flex items-center justify-between rounded-2xl px-3 py-2 text-[12.5px] font-bold text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                  >
                    {anchor.label}
                    <ChevronRight className="size-4" />
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <div className="grid gap-6">
            <Section id="fluxo" title="Fluxo padrão da operação" eyebrow="Do pedido ao fechamento">
              <div className="grid gap-3 md:grid-cols-5">
                {flows.map((step, index) => (
                  <article
                    key={step.title}
                    className="rounded-[22px] border border-border bg-card/82 p-4 shadow-sm"
                  >
                    <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">
                      {index + 1}
                    </span>
                    <h3 className="mt-4 text-sm font-black text-foreground">{step.title}</h3>
                    <p className="mt-2 text-[12px] font-semibold leading-6 text-muted-foreground">
                      {step.text}
                    </p>
                  </article>
                ))}
              </div>
            </Section>

            <Section
              id="funcionalidades"
              title="Funcionalidades do sistema"
              eyebrow={`${filteredModules.length} módulo(s) encontrado(s)`}
            >
              {filteredModules.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredModules.map((module) => (
                    <ModuleCard key={module.title} module={module} />
                  ))}
                </div>
              ) : (
                <EmptyState />
              )}
            </Section>

            <Section id="perfis" title="Responsabilidades por perfil" eyebrow="Quem faz o quê">
              <div className="grid gap-3 md:grid-cols-2">
                {roles.map((role) => (
                  <RoleCard key={role.title} role={role} />
                ))}
              </div>
            </Section>

            <Section id="suporte" title="Checklist de suporte" eyebrow="Quando algo não bater">
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleChecks.map((item) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-[22px] border border-border bg-card/82 p-4 shadow-sm"
                  >
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                    <p className="text-[12.5px] font-bold leading-6 text-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </Section>

            <section className="grid gap-4 lg:grid-cols-3">
              <FocusCard
                icon={Camera}
                title="Prova operacional"
                text="Fotos de bomba, comprovante, CT-e e anexos devem ficar no frete correto para reduzir retrabalho."
              />
              <FocusCard
                icon={Fuel}
                title="Custo correto"
                text="Abastecimento gera obrigação financeira; despesas do motorista ficam separadas do diesel e ARLA."
              />
              <FocusCard
                icon={Smartphone}
                title="App motorista"
                text="A tela do motorista deve sempre refletir a próxima ação permitida pela Central."
              />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-[30px] border border-border bg-surface/62 p-4 md:p-5"
    >
      <div className="mb-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/86 px-4 py-3 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-foreground">{value}</p>
    </div>
  );
}

function HeroPill({ icon: Icon, label }: { icon: IconType; label: string }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface/72 px-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="text-sm font-extrabold text-foreground">{label}</span>
    </div>
  );
}

function ModuleCard({ module }: { module: ManualModule }) {
  const Icon = module.icon;
  const topicLabel = topics.find((topic) => topic.key === module.topic)?.label ?? module.topic;

  return (
    <article className="rounded-[24px] border border-border bg-card/82 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            {topicLabel}
          </span>
          <h3 className="mt-2 text-base font-black text-foreground">{module.title}</h3>
          <p className="mt-1 text-[12.5px] font-semibold leading-6 text-muted-foreground">
            {module.summary}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {module.items.map((item) => (
          <li key={item} className="flex gap-2 text-[12.5px] font-semibold leading-5">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RoleCard({ role }: { role: { title: string; icon: IconType; items: string[] } }) {
  const Icon = role.icon;

  return (
    <article className="rounded-[24px] border border-border bg-card/82 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Icon className="size-5" />
        </span>
        <h3 className="text-base font-black text-foreground">{role.title}</h3>
      </div>
      <ul className="mt-4 space-y-2">
        {role.items.map((item) => (
          <li key={item} className="flex gap-2 text-[12.5px] font-semibold leading-5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function FocusCard({ icon: Icon, title, text }: { icon: IconType; title: string; text: string }) {
  return (
    <article className="rounded-[24px] border border-border bg-card/82 p-5 shadow-card">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Icon className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-black text-foreground">{title}</h2>
      <p className="mt-2 text-[12.5px] font-semibold leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[24px] border border-dashed border-border bg-card/62 p-8 text-center">
      <BookOpenCheck className="mx-auto size-10 text-primary" />
      <h3 className="mt-3 text-base font-black text-foreground">Nenhum tópico encontrado</h3>
      <p className="mt-2 text-sm font-semibold text-muted-foreground">
        Tente outra palavra ou selecione o filtro Todos.
      </p>
    </div>
  );
}
