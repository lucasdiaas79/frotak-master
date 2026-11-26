import {
  Activity,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Cloud,
  Code2,
  Database,
  Download,
  FileCode2,
  Flag,
  GraduationCap,
  Handshake,
  KeyRound,
  Layers3,
  Library,
  LineChart,
  ListChecks,
  Megaphone,
  Network,
  PackageCheck,
  Palette,
  Play,
  Plug,
  Radio,
  Receipt,
  Rocket,
  Route,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trophy,
  Users,
  Wallet,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type { NavGroup, NavItem } from "@/lib/nav";

export type WorkspaceKey =
  "master" | "sandbox" | "partners" | "developers" | "academy" | "bi" | "status";

export type WorkspaceModule = NavItem & {
  slug: string;
  description: string;
  eyebrow: string;
};

export type WorkspaceConfig = {
  key: WorkspaceKey;
  name: string;
  shortName: string;
  description: string;
  basePath: string;
  badge: string;
  tone: "success" | "warning" | "info" | "neutral" | "danger";
  color: string;
  icon: LucideIcon;
  status: string;
  lastAccess: string;
  pinned?: boolean;
  favorite?: boolean;
  modules: WorkspaceModule[];
  metrics: {
    label: string;
    value: string;
    delta: string;
    trend: "up" | "down" | "flat";
    hint?: string;
    icon?: LucideIcon;
  }[];
  table: {
    title: string;
    columns: string[];
    rows: string[][];
  };
};

const module = (
  slug: string,
  label: string,
  icon: LucideIcon,
  description: string,
  badge?: string,
): WorkspaceModule => ({
  slug,
  label,
  icon,
  description,
  badge,
  eyebrow: label.toUpperCase(),
  to: "",
});

const GaugeIcon = Activity;

export const workspaceConfigs: WorkspaceConfig[] = [
  {
    key: "master",
    name: "FrotaK Master",
    shortName: "Master",
    description: "Console principal de clientes, receita, operacao e governanca.",
    basePath: "/",
    badge: "PRODUCAO",
    tone: "success",
    color: "var(--primary)",
    icon: Building2,
    status: "Online",
    lastAccess: "Agora",
    pinned: true,
    favorite: true,
    modules: [],
    metrics: [],
    table: { title: "", columns: [], rows: [] },
  },
  {
    key: "sandbox",
    name: "FrotaK Sandbox",
    shortName: "Sandbox",
    description: "Ambiente visual de homologacao para testar fluxos sem impacto em producao.",
    basePath: "/sandbox",
    badge: "SANDBOX",
    tone: "warning",
    color: "var(--warning)",
    icon: Boxes,
    status: "Ambiente de testes",
    lastAccess: "Hoje, 16:18",
    pinned: true,
    modules: [
      module(
        "dashboard",
        "Dashboard Sandbox",
        BarChart3,
        "Resumo de testes, simulacoes e deploys.",
      ),
      module(
        "clientes",
        "Clientes Sandbox",
        Building2,
        "Clientes ficticios para validacao de fluxos.",
        "24",
      ),
      module(
        "integracoes",
        "Integracoes Sandbox",
        Plug,
        "Conectores simulados e credenciais de teste.",
      ),
      module(
        "logs",
        "Logs Sandbox",
        ScrollText,
        "Eventos tecnicos e rastreio de execucoes.",
        "1.2k",
      ),
      module("api-playground", "API Playground", TerminalSquare, "Requests e responses mockados."),
      module("feature-flags", "Feature Flags", Flag, "Experimentos e liberacoes visuais."),
      module("testes", "Testes", ListChecks, "Suites, cenarios e resultados ficticios."),
      module("deploy-preview", "Deploy Preview", Rocket, "Builds, previews e validacoes."),
      module("banco", "Banco Sandbox", Database, "Uso do banco e seeds de teste."),
      module("webhooks", "Webhooks Sandbox", Webhook, "Entregas simuladas e tentativas."),
      module("storage", "Storage Sandbox", Cloud, "Buckets e arquivos temporarios."),
      module("filas", "Filas", Layers3, "Jobs, workers e filas de homologacao."),
      module("ambiente", "Ambiente", Server, "Variaveis, regioes e limites do sandbox."),
    ],
    metrics: [
      {
        label: "APIs simuladas",
        value: "38",
        delta: "+12",
        trend: "up",
        hint: "ultimas 24h",
        icon: TerminalSquare,
      },
      {
        label: "Testes executados",
        value: "1.284",
        delta: "98,7%",
        trend: "up",
        hint: "passaram",
        icon: ListChecks,
      },
      {
        label: "Build",
        value: "verde",
        delta: "2m 18s",
        trend: "flat",
        hint: "preview ativo",
        icon: Rocket,
      },
      {
        label: "Latencia",
        value: "82 ms",
        delta: "-14 ms",
        trend: "up",
        hint: "p95 mock",
        icon: Activity,
      },
    ],
    table: {
      title: "Eventos de homologacao",
      columns: ["Evento", "Servico", "Ambiente", "Resultado"],
      rows: [
        ["seed.client.created", "Banco", "sandbox-br", "Sucesso"],
        ["cte.preview.generated", "API", "sandbox-br", "Sucesso"],
        ["webhook.retry.mocked", "Webhooks", "sandbox-us", "Aguardando"],
        ["feature.toggle.enabled", "Flags", "sandbox-br", "Sucesso"],
      ],
    },
  },
  {
    key: "partners",
    name: "FrotaK Partner Hub",
    shortName: "Partner Hub",
    description: "Portal completo para parceiros, leads, comissoes e enablement comercial.",
    basePath: "/partners",
    badge: "PARTNER",
    tone: "info",
    color: "var(--chart-2)",
    icon: Handshake,
    status: "Programa ativo",
    lastAccess: "Ontem, 18:42",
    favorite: true,
    modules: [
      module("dashboard", "Dashboard", BarChart3, "Visao executiva do canal de parceiros."),
      module("parceiros", "Parceiros", Handshake, "Carteira, nivel e desempenho dos parceiros."),
      module("leads", "Leads", Users, "Leads enviados, qualificados e convertidos.", "312"),
      module(
        "clientes-indicados",
        "Clientes Indicados",
        Building2,
        "Contas originadas pelo canal.",
      ),
      module("comissoes", "Comissoes", Receipt, "Receitas, regras e previsoes."),
      module("financeiro", "Financeiro", Wallet, "Faturamento e conciliacao."),
      module("saques", "Saques", Download, "Solicitacoes e historico financeiro."),
      module("marketplace", "Marketplace", PackageCheck, "Ofertas e beneficios do ecossistema."),
      module("integracoes", "Integracoes", Plug, "Apps para parceiros."),
      module("api", "API", Code2, "Recursos tecnicos para integradores."),
      module("sdk", "SDK", FileCode2, "Kits de desenvolvimento e exemplos."),
      module("documentacao", "Documentacao", BookOpen, "Guias, playbooks e politicas."),
      module("downloads", "Downloads", Download, "Materiais comerciais."),
      module("brand-kit", "Brand Kit", Palette, "Logos, cores e templates."),
      module("marketing", "Marketing", Megaphone, "Campanhas e co-marketing."),
      module("certificacoes", "Certificacoes", BadgeCheck, "Selos e niveis de parceiros."),
      module("cursos", "Cursos", GraduationCap, "Trilhas de capacitacao."),
      module("tickets", "Tickets", ScrollText, "Atendimento e SLA."),
      module("perfil", "Perfil", Users, "Dados do parceiro e preferencias."),
    ],
    metrics: [
      {
        label: "Receita canal",
        value: "R$ 842k",
        delta: "+18,4%",
        trend: "up",
        hint: "MRR parceiro",
        icon: Wallet,
      },
      {
        label: "Comissoes",
        value: "R$ 96k",
        delta: "+11,2%",
        trend: "up",
        hint: "a pagar",
        icon: Receipt,
      },
      { label: "Leads", value: "312", delta: "+46", trend: "up", hint: "mes atual", icon: Users },
      {
        label: "Conversao",
        value: "18,9%",
        delta: "+2,1pp",
        trend: "up",
        hint: "lead > cliente",
        icon: LineChart,
      },
    ],
    table: {
      title: "Ultimas vendas",
      columns: ["Parceiro", "Cliente", "Plano", "Comissao"],
      rows: [
        ["Atlas Partners", "Vale Verde", "Enterprise", "R$ 8.420"],
        ["Nordeste Tech", "Sertao Express", "Business", "R$ 2.180"],
        ["Hub Log", "Pampa Sul", "Enterprise", "R$ 6.970"],
        ["Canal Prime", "Rota Viva", "Starter", "R$ 840"],
      ],
    },
  },
  {
    key: "developers",
    name: "FrotaK Developer Portal",
    shortName: "Developer",
    description: "Portal tecnico para APIs, SDKs, webhooks, tokens e exemplos.",
    basePath: "/developers",
    badge: "DEV",
    tone: "neutral",
    color: "var(--chart-4)",
    icon: Code2,
    status: "APIs estaveis",
    lastAccess: "Hoje, 09:07",
    modules: [
      module("dashboard", "Dashboard", BarChart3, "Resumo de uso tecnico e saude das APIs."),
      module("documentacao", "Documentacao", BookOpen, "Guias de inicio rapido e referencia."),
      module("apis", "APIs", Network, "Endpoints, contratos e limites."),
      module("sdks", "SDKs", FileCode2, "Bibliotecas oficiais e exemplos."),
      module("webhooks", "Webhooks", Webhook, "Assinaturas, eventos e tentativas."),
      module("tokens", "Tokens", KeyRound, "Chaves, escopos e rotacao."),
      module("oauth", "OAuth", ShieldCheck, "Apps, grants e callbacks."),
      module("logs", "Logs", ScrollText, "Requests, responses e traces."),
      module("playground", "Playground", TerminalSquare, "Console visual de requests."),
      module("collections", "Collections", Library, "Colecoes de endpoints."),
      module("exemplos", "Exemplos", Code2, "Snippets e casos de uso."),
      module("bibliotecas", "Bibliotecas", PackageCheck, "Pacotes e versoes."),
      module("changelog", "Changelog", Sparkles, "Novidades da API."),
      module("status-api", "Status API", Radio, "Disponibilidade e latencia."),
    ],
    metrics: [
      {
        label: "Requests",
        value: "8.4M",
        delta: "+23%",
        trend: "up",
        hint: "30 dias",
        icon: Network,
      },
      {
        label: "Erros 4xx/5xx",
        value: "0,18%",
        delta: "-0,04pp",
        trend: "up",
        hint: "global",
        icon: Activity,
      },
      {
        label: "Webhooks",
        value: "98,9%",
        delta: "+1,2pp",
        trend: "up",
        hint: "entregues",
        icon: Webhook,
      },
      {
        label: "Tokens ativos",
        value: "428",
        delta: "+31",
        trend: "up",
        hint: "escopos validos",
        icon: KeyRound,
      },
    ],
    table: {
      title: "Requests recentes",
      columns: ["Metodo", "Endpoint", "Status", "Tempo"],
      rows: [
        ["GET", "/v1/freights", "200", "84 ms"],
        ["POST", "/v1/webhooks", "201", "126 ms"],
        ["PATCH", "/v1/drivers/{id}", "200", "98 ms"],
        ["GET", "/v1/quotes", "429", "42 ms"],
      ],
    },
  },
  {
    key: "academy",
    name: "FrotaK Academy",
    shortName: "Academy",
    description: "Portal de treinamento, cursos, certificacoes e progresso.",
    basePath: "/academy",
    badge: "ACADEMY",
    tone: "success",
    color: "var(--chart-1)",
    icon: GraduationCap,
    status: "Turmas abertas",
    lastAccess: "Hoje, 11:25",
    modules: [
      module("dashboard", "Dashboard", BarChart3, "Resumo de aprendizado e engajamento."),
      module("cursos", "Cursos", GraduationCap, "Trilhas operacionais e comerciais."),
      module("categorias", "Categorias", Boxes, "Temas e niveis de conteudo."),
      module("certificacoes", "Certificacoes", BadgeCheck, "Provas, selos e validade."),
      module("progresso", "Progresso", LineChart, "Evolucao dos alunos."),
      module("biblioteca", "Biblioteca", Library, "Materiais de apoio."),
      module("videos", "Videos", Play, "Aulas e demonstracoes."),
      module("artigos", "Artigos", BookOpen, "Conteudos escritos."),
      module("downloads", "Downloads", Download, "Arquivos e templates."),
      module("quiz", "Quiz", ListChecks, "Perguntas e simulados."),
      module("ranking", "Ranking", Trophy, "Pontuacao e gamificacao."),
      module("badges", "Badges", BadgeCheck, "Conquistas visuais."),
      module("perfil", "Perfil", Users, "Aluno e preferencias."),
      module("certificados", "Certificados", ScrollText, "Certificados emitidos."),
    ],
    metrics: [
      {
        label: "Horas estudadas",
        value: "1.842",
        delta: "+18%",
        trend: "up",
        hint: "mes atual",
        icon: BookOpen,
      },
      {
        label: "Cursos concluidos",
        value: "428",
        delta: "+64",
        trend: "up",
        hint: "turmas",
        icon: CheckCircle2,
      },
      {
        label: "Progresso medio",
        value: "74%",
        delta: "+9pp",
        trend: "up",
        hint: "ativos",
        icon: LineChart,
      },
      {
        label: "Pontuacao",
        value: "92k",
        delta: "+12k",
        trend: "up",
        hint: "ranking",
        icon: Trophy,
      },
    ],
    table: {
      title: "Cursos em destaque",
      columns: ["Curso", "Categoria", "Nivel", "Conclusao"],
      rows: [
        ["Operacao em tempo real", "Operacoes", "Intermediario", "82%"],
        ["Gestao de clientes", "CS", "Basico", "64%"],
        ["Financeiro para frotas", "Receita", "Avancado", "41%"],
        ["Integracoes e webhooks", "Tecnico", "Avancado", "78%"],
      ],
    },
  },
  {
    key: "bi",
    name: "FrotaK BI",
    shortName: "BI",
    description: "Business Intelligence para analises executivas, indicadores e exportacoes.",
    basePath: "/bi",
    badge: "BI",
    tone: "info",
    color: "var(--chart-2)",
    icon: LineChart,
    status: "Dashboards atualizados",
    lastAccess: "Seg, 08:30",
    modules: [
      module(
        "dashboard-executivo",
        "Dashboard Executivo",
        BarChart3,
        "Visao C-level do ecossistema.",
      ),
      module("kpis", "KPIs", Activity, "Indicadores estrategicos."),
      module("graficos", "Graficos", LineChart, "Series e composicoes."),
      module("filtros", "Filtros", ListChecks, "Segmentos e periodos."),
      module("comparativos", "Comparativos", Layers3, "Analises lado a lado."),
      module("exportacoes", "Exportacoes", Download, "Relatorios e agendamentos."),
      module("receita", "Receita", Wallet, "MRR, ARR e inadimplencia."),
      module("fretes", "Fretes", Route, "Volume, rota e eficiencia."),
      module("motoristas", "Motoristas", Users, "Atividade e produtividade."),
      module("clientes", "Clientes", Building2, "Cohorts e saude da carteira."),
      module("financeiro", "Financeiro", Receipt, "Recebiveis e margem."),
      module("operacao", "Operacao", Activity, "SLA e ocorrencias."),
      module("heatmaps", "Heatmaps", BarChart3, "Distribuicao geografica."),
      module("indicadores", "Indicadores", GaugeIcon, "Scorecards."),
      module("timeline", "Timeline", ScrollText, "Eventos de negocio."),
      module("mapa", "Mapa", Route, "Camadas e regioes."),
    ],
    metrics: [
      {
        label: "Receita analisada",
        value: "R$ 15,4M",
        delta: "+9,1%",
        trend: "up",
        hint: "ARR",
        icon: Wallet,
      },
      { label: "Fretes", value: "1,8M", delta: "+14%", trend: "up", hint: "12m", icon: Route },
      {
        label: "Clientes",
        value: "128",
        delta: "+6",
        trend: "up",
        hint: "ativos",
        icon: Building2,
      },
      {
        label: "Exportacoes",
        value: "842",
        delta: "+21%",
        trend: "up",
        hint: "agendadas",
        icon: Download,
      },
    ],
    table: {
      title: "Insights recentes",
      columns: ["Indicador", "Segmento", "Variacao", "Impacto"],
      rows: [
        ["Churn previsto", "Enterprise", "-0,3pp", "Alto"],
        ["Margem operacional", "Sudeste", "+4,8%", "Medio"],
        ["Fretes em atraso", "Agro", "-12%", "Alto"],
        ["Receita expandida", "Business", "+R$ 82k", "Alto"],
      ],
    },
  },
  {
    key: "status",
    name: "FrotaK Status",
    shortName: "Status",
    description: "Pagina publica visual de status, incidentes, uptime e latencia.",
    basePath: "/status",
    badge: "STATUS",
    tone: "success",
    color: "var(--success)",
    icon: Radio,
    status: "Operacional",
    lastAccess: "Agora",
    modules: [
      module("status-geral", "Status Geral", Radio, "Saude consolidada da plataforma."),
      module("api", "API", Network, "Disponibilidade da API."),
      module("realtime", "Realtime", Activity, "Canais em tempo real."),
      module("storage", "Storage", Cloud, "Arquivos e buckets."),
      module("banco", "Banco", Database, "Bancos transacionais."),
      module("autenticacao", "Autenticacao", ShieldCheck, "Login, OAuth e sessoes."),
      module("notificacoes", "Notificacoes", Megaphone, "Email, WhatsApp e push."),
      module("webhooks", "Webhooks", Webhook, "Entregas e filas."),
      module("incidentes", "Incidentes", ScrollText, "Ocorrencias abertas."),
      module("historico", "Historico", LineChart, "Registro de eventos."),
      module("uptime", "Uptime", CheckCircle2, "SLA por servico."),
      module("latencia", "Latencia", Activity, "P50, P95 e P99."),
      module("graficos", "Graficos", BarChart3, "Series historicas."),
      module("timeline", "Timeline", ScrollText, "Linha do tempo."),
      module("calendario", "Calendario", ListChecks, "Manutencoes programadas."),
    ],
    metrics: [
      {
        label: "Status geral",
        value: "OK",
        delta: "99,98%",
        trend: "up",
        hint: "30 dias",
        icon: CheckCircle2,
      },
      { label: "API", value: "41 ms", delta: "-8 ms", trend: "up", hint: "p50", icon: Network },
      {
        label: "Realtime",
        value: "99,9%",
        delta: "+0,1pp",
        trend: "up",
        hint: "uptime",
        icon: Activity,
      },
      {
        label: "Incidentes",
        value: "0",
        delta: "sem impacto",
        trend: "flat",
        hint: "abertos",
        icon: Radio,
      },
    ],
    table: {
      title: "Componentes monitorados",
      columns: ["Componente", "Status", "Uptime", "Latencia"],
      rows: [
        ["API REST", "Operacional", "99,99%", "41 ms"],
        ["Realtime", "Operacional", "99,95%", "68 ms"],
        ["Storage", "Operacional", "99,98%", "92 ms"],
        ["Webhooks", "Operacional", "99,91%", "124 ms"],
      ],
    },
  },
];

export const nonMasterWorkspaces = workspaceConfigs.filter(
  (workspace) => workspace.key !== "master",
);

export function getWorkspaceByPath(pathname: string) {
  return (
    nonMasterWorkspaces.find(
      (workspace) =>
        pathname === workspace.basePath || pathname.startsWith(`${workspace.basePath}/`),
    ) ?? workspaceConfigs[0]
  );
}

export function getWorkspaceByKey(key: WorkspaceKey) {
  return workspaceConfigs.find((workspace) => workspace.key === key) ?? workspaceConfigs[0];
}

export function getModuleBySlug(workspace: WorkspaceConfig, slug?: string) {
  const normalized = slug ?? workspace.modules[0]?.slug ?? "dashboard";
  return workspace.modules.find((item) => item.slug === normalized) ?? workspace.modules[0];
}

export function getWorkspaceNavGroups(pathname: string, masterGroups: NavGroup[]): NavGroup[] {
  const workspace = getWorkspaceByPath(pathname);
  if (workspace.key === "master") return masterGroups;

  const dashboard = workspace.modules[0];
  const items = workspace.modules.map((item, index) => ({
    ...item,
    to: index === 0 ? workspace.basePath : `${workspace.basePath}/${item.slug}`,
  }));

  return [
    {
      label: workspace.shortName,
      items: dashboard ? [items[0]] : [],
    },
    {
      label: "Modulos",
      items: items.slice(1, 8),
    },
    {
      label: "Avancado",
      items: items.slice(8),
    },
  ].filter((group) => group.items.length > 0);
}
