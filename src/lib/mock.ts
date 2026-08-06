export const kpis = [
  {
    label: "Receita Mensal (MRR)",
    value: "R$ 1.284.900",
    delta: "+12,4%",
    trend: "up" as const,
    hint: "vs. mês anterior",
  },
  {
    label: "Receita Anual (ARR)",
    value: "R$ 15.418.800",
    delta: "+9,1%",
    trend: "up" as const,
    hint: "projeção 12m",
  },
  { label: "Clientes", value: "128", delta: "+6", trend: "up" as const, hint: "transportadoras" },
  {
    label: "Clientes Ativos",
    value: "119",
    delta: "92,9%",
    trend: "up" as const,
    hint: "taxa de atividade",
  },
  {
    label: "Empresas Online",
    value: "94",
    delta: "tempo real",
    trend: "flat" as const,
    hint: "últimos 5 min",
  },
  {
    label: "Usuários Online",
    value: "1.842",
    delta: "+214",
    trend: "up" as const,
    hint: "sessões ativas",
  },
  {
    label: "Motoristas Online",
    value: "6.317",
    delta: "+1,8%",
    trend: "up" as const,
    hint: "app mobile",
  },
  {
    label: "Fretes Ativos",
    value: "3.204",
    delta: "-42",
    trend: "down" as const,
    hint: "em rota agora",
  },
  {
    label: "Fretes Hoje",
    value: "8.951",
    delta: "+4,2%",
    trend: "up" as const,
    hint: "criados hoje",
  },
  {
    label: "Receita Hoje",
    value: "R$ 48.220",
    delta: "+3,6%",
    trend: "up" as const,
    hint: "gateway consolidado",
  },
  {
    label: "Receita Semana",
    value: "R$ 312.480",
    delta: "+7,9%",
    trend: "up" as const,
    hint: "últimos 7 dias",
  },
  { label: "Churn", value: "1,4%", delta: "-0,3pp", trend: "up" as const, hint: "logo churn 30d" },
];

export const revenueSeries = [
  { m: "Jan", mrr: 842, expansion: 96, churn: -32 },
  { m: "Fev", mrr: 889, expansion: 104, churn: -28 },
  { m: "Mar", mrr: 931, expansion: 121, churn: -41 },
  { m: "Abr", mrr: 978, expansion: 118, churn: -36 },
  { m: "Mai", mrr: 1024, expansion: 132, churn: -30 },
  { m: "Jun", mrr: 1078, expansion: 141, churn: -44 },
  { m: "Jul", mrr: 1122, expansion: 156, churn: -38 },
  { m: "Ago", mrr: 1168, expansion: 149, churn: -27 },
  { m: "Set", mrr: 1201, expansion: 162, churn: -35 },
  { m: "Out", mrr: 1238, expansion: 171, churn: -31 },
  { m: "Nov", mrr: 1262, expansion: 158, churn: -26 },
  { m: "Dez", mrr: 1285, expansion: 184, churn: -22 },
];

export const freightSeries = Array.from({ length: 24 }, (_, i) => ({
  h: `${String(i).padStart(2, "0")}h`,
  fretes: Math.round(
    120 + Math.sin(i / 3) * 70 + (i > 6 && i < 20 ? 180 : 40) + Math.random() * 30,
  ),
  ocorrencias: Math.round(4 + Math.random() * 12),
}));

export const planMix = [
  { name: "Enterprise", value: 38 },
  { name: "Business", value: 46 },
  { name: "Starter", value: 31 },
  { name: "Trial", value: 13 },
];

export const radarData = [
  { axis: "API", atual: 92, meta: 85 },
  { axis: "Realtime", atual: 88, meta: 90 },
  { axis: "Storage", atual: 74, meta: 80 },
  { axis: "Banco", atual: 81, meta: 85 },
  { axis: "Filas", atual: 69, meta: 75 },
  { axis: "Webhooks", atual: 95, meta: 88 },
];

export const stateHeat = [
  { uf: "SE", v: 92 },
  { uf: "BA", v: 78 },
  { uf: "SP", v: 96 },
  { uf: "MG", v: 61 },
  { uf: "PE", v: 54 },
  { uf: "RJ", v: 72 },
  { uf: "PR", v: 43 },
  { uf: "GO", v: 38 },
  { uf: "RS", v: 51 },
  { uf: "CE", v: 34 },
  { uf: "SC", v: 29 },
  { uf: "MT", v: 65 },
  { uf: "PA", v: 22 },
  { uf: "AL", v: 47 },
  { uf: "ES", v: 31 },
  { uf: "DF", v: 44 },
];

export type Client = {
  id: string;
  name: string;
  cnpj: string;
  plan: "Enterprise" | "Business" | "Starter" | "Trial";
  status: "Ativo" | "Suspenso" | "Inadimplente" | "Trial" | "Cancelado";
  uf: string;
  city: string;
  mrr: string;
  users: number;
  drivers: number;
  vehicles: number;
  freights: number;
  storage: number;
  api: number;
  since: string;
  owner: string;
  domain: string;
};

const names = [
  ["Transportadora Vale Verde", "SE", "Aracaju"],
  ["Log Nordeste Cargas", "BA", "Feira de Santana"],
  ["Rodoserra Transportes", "MG", "Belo Horizonte"],
  ["Atlas Bulk Mining", "PA", "Marabá"],
  ["Sertão Logística", "PE", "Caruaru"],
  ["Cimentos Laranjeiras", "SE", "Laranjeiras"],
  ["TransPampa Sul", "RS", "Porto Alegre"],
  ["Anhanguera Fretes", "SP", "Campinas"],
  ["Norte Forte Cargas", "MT", "Cuiabá"],
  ["Litoral Express", "RJ", "Niterói"],
  ["Agro Center Transportes", "GO", "Rio Verde"],
  ["Costa Azul Logística", "AL", "Maceió"],
  ["Ferrovale Rodoviário", "ES", "Vitória"],
  ["Planalto Distribuição", "DF", "Brasília"],
  ["Paraná Heavy Haul", "PR", "Londrina"],
  ["Meridional Cargas", "SC", "Joinville"],
];
const plans: Client["plan"][] = ["Enterprise", "Business", "Starter", "Trial"];
const statuses: Client["status"][] = [
  "Ativo",
  "Ativo",
  "Ativo",
  "Inadimplente",
  "Suspenso",
  "Trial",
];

export const clients: Client[] = names.map(([name, uf, city], i) => ({
  id: `cli-${String(i + 1).padStart(3, "0")}`,
  name: name as string,
  cnpj: `${12 + i}.${300 + i * 7}.${100 + i}/0001-${10 + i}`,
  plan: plans[i % plans.length],
  status: statuses[i % statuses.length],
  uf: uf as string,
  city: city as string,
  mrr: `R$ ${(8 + i * 1.7).toFixed(1).replace(".", ",")}k`,
  users: 12 + i * 9,
  drivers: 40 + i * 23,
  vehicles: 18 + i * 11,
  freights: 320 + i * 187,
  storage: 20 + ((i * 13) % 75),
  api: 30 + ((i * 17) % 65),
  since: `${2019 + (i % 6)}`,
  owner: ["Marina Alves", "Rafael Duarte", "Camila Prado", "João Bastos"][i % 4],
  domain: `${(name as string).split(" ")[0].toLowerCase()}.frotak.app`,
}));

export const activityFeed = [
  {
    who: "Marina Alves",
    action: "aprovou o contrato",
    target: "Atlas Bulk Mining",
    when: "há 2 min",
    kind: "success",
  },
  {
    who: "Sistema",
    action: "detectou latência elevada",
    target: "fila de webhooks",
    when: "há 8 min",
    kind: "warning",
  },
  {
    who: "Rafael Duarte",
    action: "criou cliente",
    target: "Meridional Cargas",
    when: "há 21 min",
    kind: "info",
  },
  {
    who: "Gateway Asaas",
    action: "confirmou pagamento",
    target: "R$ 18.400",
    when: "há 34 min",
    kind: "success",
  },
  {
    who: "Camila Prado",
    action: "suspendeu acesso",
    target: "Sertão Logística",
    when: "há 1 h",
    kind: "danger",
  },
  {
    who: "Sistema",
    action: "backup concluído",
    target: "cluster-sa-east-1",
    when: "há 2 h",
    kind: "info",
  },
  {
    who: "João Bastos",
    action: "atualizou permissões",
    target: "Função Financeiro",
    when: "há 3 h",
    kind: "info",
  },
];

export const systemHealth = [
  { name: "API Gateway", value: 99.98, status: "Operacional", detail: "142 ms p95" },
  { name: "Realtime", value: 99.91, status: "Operacional", detail: "8.3k conexões" },
  { name: "Banco de dados", value: 99.99, status: "Operacional", detail: "CPU 38%" },
  { name: "Storage", value: 99.87, status: "Degradado", detail: "74% utilizado" },
  { name: "Filas", value: 98.72, status: "Atenção", detail: "1.284 pendentes" },
  { name: "Cache", value: 99.95, status: "Operacional", detail: "hit 96,4%" },
];

export const logs = [
  {
    level: "ERROR",
    msg: "webhook delivery failed → asaas.payment.confirmed",
    at: "14:28:07",
    ctx: "svc-webhooks",
  },
  { level: "WARN", msg: "storage bucket 74% capacity", at: "14:26:41", ctx: "svc-storage" },
  { level: "INFO", msg: "tenant vale-verde provisioned", at: "14:25:02", ctx: "svc-tenancy" },
  { level: "INFO", msg: "cron:mrr-recalc finished in 1.8s", at: "14:22:18", ctx: "svc-billing" },
  { level: "WARN", msg: "rate limit hit for api-key ***a91f", at: "14:19:55", ctx: "svc-api" },
  { level: "INFO", msg: "24 devices reconnected", at: "14:18:03", ctx: "svc-realtime" },
];

export const alerts = [
  {
    id: "ALT-2041",
    title: "Motorista fora da rota planejada",
    severity: "Crítico",
    module: "Operações",
    client: "Atlas Bulk Mining",
    when: "há 3 min",
    status: "Aberto",
  },
  {
    id: "ALT-2040",
    title: "Fila de webhooks acima do limite",
    severity: "Alto",
    module: "Plataforma",
    client: "Global",
    when: "há 12 min",
    status: "Em análise",
  },
  {
    id: "ALT-2039",
    title: "Pagamento recusado 3x",
    severity: "Alto",
    module: "Financeiro",
    client: "Sertão Logística",
    when: "há 25 min",
    status: "Aberto",
  },
  {
    id: "ALT-2038",
    title: "Excesso de velocidade recorrente",
    severity: "Médio",
    module: "Operações",
    client: "Rodoserra Transportes",
    when: "há 48 min",
    status: "Em análise",
  },
  {
    id: "ALT-2037",
    title: "Storage do tenant acima de 90%",
    severity: "Médio",
    module: "Plataforma",
    client: "Log Nordeste Cargas",
    when: "há 1 h",
    status: "Aberto",
  },
  {
    id: "ALT-2036",
    title: "Token de integração expirado",
    severity: "Baixo",
    module: "Integrações",
    client: "Litoral Express",
    when: "há 2 h",
    status: "Resolvido",
  },
  {
    id: "ALT-2035",
    title: "Tentativas de login suspeitas",
    severity: "Crítico",
    module: "Segurança",
    client: "TransPampa Sul",
    when: "há 3 h",
    status: "Resolvido",
  },
];

export const integrations = [
  {
    name: "Google Maps",
    cat: "Mapas",
    desc: "Geocodificação, rotas e matriz de distância.",
    status: "Conectado",
    version: "v3.58",
  },
  {
    name: "BSoft",
    cat: "ERP",
    desc: "Sincronização de notas, CTe e cadastros fiscais.",
    status: "Conectado",
    version: "v2.11",
  },
  {
    name: "OpenAI",
    cat: "IA",
    desc: "Copiloto operacional e resumos automáticos.",
    status: "Conectado",
    version: "v1.0",
  },
  {
    name: "Asaas",
    cat: "Pagamentos",
    desc: "Cobranças recorrentes, PIX e boletos.",
    status: "Conectado",
    version: "v3.2",
  },
  {
    name: "Mercado Pago",
    cat: "Pagamentos",
    desc: "Checkout transparente e split.",
    status: "Disponível",
    version: "v2.0",
  },
  {
    name: "Stripe",
    cat: "Pagamentos",
    desc: "Billing internacional e faturas.",
    status: "Disponível",
    version: "v2024-06",
  },
  {
    name: "Supabase",
    cat: "Infra",
    desc: "Postgres gerenciado, realtime e storage.",
    status: "Conectado",
    version: "v2.45",
  },
  {
    name: "Firebase",
    cat: "Infra",
    desc: "Push notifications para o app do motorista.",
    status: "Conectado",
    version: "v10.9",
  },
  {
    name: "SMTP",
    cat: "Comunicação",
    desc: "Envio transacional de e-mails.",
    status: "Conectado",
    version: "TLS 1.3",
  },
  {
    name: "WhatsApp",
    cat: "Comunicação",
    desc: "Cloud API para avisos operacionais.",
    status: "Atenção",
    version: "v19.0",
  },
  {
    name: "Webhook",
    cat: "Plataforma",
    desc: "Entrega de eventos para sistemas externos.",
    status: "Conectado",
    version: "v1.4",
  },
  {
    name: "Storage S3",
    cat: "Infra",
    desc: "Documentos, fotos de coleta e canhotos.",
    status: "Disponível",
    version: "v4",
  },
];

export const webhookEndpoints = [
  {
    url: "https://api.valeverde.com/frotak/events",
    events: 12,
    status: "Ativo",
    success: 99.4,
    last: "14:28:04",
  },
  {
    url: "https://erp.lognordeste.com.br/hooks",
    events: 8,
    status: "Ativo",
    success: 97.1,
    last: "14:27:51",
  },
  {
    url: "https://hooks.atlasbulk.io/v2/frotak",
    events: 21,
    status: "Falhando",
    success: 71.8,
    last: "14:26:12",
  },
  {
    url: "https://sertao.app/integracao/frotak",
    events: 5,
    status: "Pausado",
    success: 88.0,
    last: "ontem",
  },
];

export const users = [
  {
    name: "Marina Alves",
    email: "marina@frotak.com",
    role: "CEO",
    team: "Diretoria",
    status: "Ativo",
    last: "há 2 min",
    sessions: 3,
  },
  {
    name: "Rafael Duarte",
    email: "rafael@frotak.com",
    role: "Comercial",
    team: "Growth",
    status: "Ativo",
    last: "há 14 min",
    sessions: 2,
  },
  {
    name: "Camila Prado",
    email: "camila@frotak.com",
    role: "Financeiro",
    team: "Receita",
    status: "Ativo",
    last: "há 1 h",
    sessions: 1,
  },
  {
    name: "João Bastos",
    email: "joao@frotak.com",
    role: "Desenvolvedor",
    team: "Plataforma",
    status: "Ativo",
    last: "há 5 min",
    sessions: 4,
  },
  {
    name: "Luana Reis",
    email: "luana@frotak.com",
    role: "Suporte",
    team: "CX",
    status: "Ausente",
    last: "há 3 h",
    sessions: 1,
  },
  {
    name: "Diego Matos",
    email: "diego@frotak.com",
    role: "Operação",
    team: "Torre de controle",
    status: "Ativo",
    last: "agora",
    sessions: 2,
  },
  {
    name: "Paula Nunes",
    email: "paula@frotak.com",
    role: "Marketing",
    team: "Growth",
    status: "Suspenso",
    last: "há 6 d",
    sessions: 0,
  },
  {
    name: "Henrique Sá",
    email: "henrique@frotak.com",
    role: "Administrador",
    team: "Plataforma",
    status: "Ativo",
    last: "há 22 min",
    sessions: 5,
  },
];

export const roles = [
  { name: "Administrador", members: 4, scope: "Acesso total à plataforma", perms: 96 },
  { name: "CEO", members: 1, scope: "Leitura executiva + financeiro", perms: 62 },
  { name: "Financeiro", members: 6, scope: "Receita, cobranças e relatórios", perms: 41 },
  { name: "Comercial", members: 9, scope: "Pipeline, propostas e contratos", perms: 38 },
  { name: "Marketing", members: 5, scope: "Campanhas e afiliados", perms: 24 },
  { name: "Suporte", members: 12, scope: "Tickets e base de conhecimento", perms: 29 },
  { name: "Operação", members: 18, scope: "Torre de controle e ocorrências", perms: 47 },
  { name: "Desenvolvedor", members: 7, scope: "Integrações, webhooks e logs", perms: 71 },
];

export const permissionModules = [
  { module: "Clientes", actions: ["Visualizar", "Criar", "Editar", "Excluir", "Login como"] },
  { module: "Financeiro", actions: ["Visualizar", "Criar", "Editar", "Excluir", "Exportar"] },
  { module: "Comercial", actions: ["Visualizar", "Criar", "Editar", "Excluir", "Aprovar"] },
  { module: "Operações", actions: ["Visualizar", "Criar", "Editar", "Encerrar", "Exportar"] },
  { module: "Integrações", actions: ["Visualizar", "Conectar", "Editar", "Revogar", "Logs"] },
  { module: "Usuários", actions: ["Visualizar", "Criar", "Editar", "Suspender", "Resetar senha"] },
  { module: "Auditoria", actions: ["Visualizar", "Exportar", "Filtrar", "Detalhar", "Arquivar"] },
];

export const auditTrail = [
  {
    who: "Henrique Sá",
    action: "role.updated",
    module: "Funções",
    client: "Global",
    ip: "177.34.12.9",
    device: "MacOS · Chrome",
    when: "30/07 14:22",
  },
  {
    who: "Camila Prado",
    action: "invoice.refunded",
    module: "Financeiro",
    client: "Litoral Express",
    ip: "189.5.201.44",
    device: "Windows · Edge",
    when: "30/07 13:58",
  },
  {
    who: "Marina Alves",
    action: "client.contract.signed",
    module: "Clientes",
    client: "Atlas Bulk Mining",
    ip: "201.17.88.2",
    device: "iPhone · Safari",
    when: "30/07 13:31",
  },
  {
    who: "João Bastos",
    action: "webhook.endpoint.rotated",
    module: "Webhooks",
    client: "Global",
    ip: "177.34.12.10",
    device: "Linux · Firefox",
    when: "30/07 12:47",
  },
  {
    who: "Diego Matos",
    action: "occurrence.closed",
    module: "Operações",
    client: "Rodoserra",
    ip: "179.222.4.71",
    device: "Android · App",
    when: "30/07 12:12",
  },
  {
    who: "Luana Reis",
    action: "ticket.escalated",
    module: "Suporte",
    client: "Sertão Logística",
    ip: "138.94.7.19",
    device: "Windows · Chrome",
    when: "30/07 11:40",
  },
  {
    who: "Rafael Duarte",
    action: "proposal.sent",
    module: "Comercial",
    client: "Norte Forte",
    ip: "191.44.9.83",
    device: "MacOS · Arc",
    when: "30/07 10:58",
  },
];

export const pipeline = [
  {
    stage: "Lead",
    color: "chart-2",
    deals: [
      { name: "Transrio Cargas", value: "R$ 14,2k", owner: "RD", tag: "Inbound" },
      { name: "Mineradora Serra", value: "R$ 32,0k", owner: "MA", tag: "Outbound" },
      { name: "Agro Norte", value: "R$ 9,8k", owner: "PN", tag: "Indicação" },
    ],
  },
  {
    stage: "Qualificado",
    color: "chart-3",
    deals: [
      { name: "Cimento Bahia", value: "R$ 27,5k", owner: "RD", tag: "Enterprise" },
      { name: "Log Fácil", value: "R$ 11,3k", owner: "PN", tag: "Business" },
    ],
  },
  {
    stage: "Proposta",
    color: "chart-1",
    deals: [
      { name: "Atlas Bulk Mining", value: "R$ 48,9k", owner: "MA", tag: "Enterprise" },
      { name: "Meridional Cargas", value: "R$ 18,4k", owner: "RD", tag: "Business" },
      { name: "Costa Azul", value: "R$ 7,6k", owner: "PN", tag: "Starter" },
    ],
  },
  {
    stage: "Contrato",
    color: "chart-5",
    deals: [{ name: "Planalto Distribuição", value: "R$ 22,1k", owner: "MA", tag: "Renovação" }],
  },
  {
    stage: "Ganho",
    color: "primary",
    deals: [
      { name: "Ferrovale Rodoviário", value: "R$ 31,7k", owner: "RD", tag: "Assinado" },
      { name: "Paraná Heavy Haul", value: "R$ 25,4k", owner: "MA", tag: "Assinado" },
    ],
  },
];

export const tickets = [
  {
    id: "TCK-8841",
    subject: "Divergência no relatório de abastecimento",
    client: "Vale Verde",
    priority: "Alta",
    status: "Aberto",
    agent: "Luana Reis",
    sla: "2h 14m",
    rating: null,
  },
  {
    id: "TCK-8840",
    subject: "App do motorista travando no Android 12",
    client: "Log Nordeste",
    priority: "Crítica",
    status: "Em atendimento",
    agent: "Diego Matos",
    sla: "38m",
    rating: null,
  },
  {
    id: "TCK-8839",
    subject: "Solicitação de novo usuário financeiro",
    client: "Rodoserra",
    priority: "Baixa",
    status: "Aguardando cliente",
    agent: "Luana Reis",
    sla: "1d 4h",
    rating: null,
  },
  {
    id: "TCK-8838",
    subject: "Integração BSoft sem sincronizar CTe",
    client: "Atlas Bulk",
    priority: "Alta",
    status: "Em atendimento",
    agent: "João Bastos",
    sla: "1h 02m",
    rating: null,
  },
  {
    id: "TCK-8837",
    subject: "Dúvida sobre cobrança proporcional",
    client: "Litoral Express",
    priority: "Média",
    status: "Resolvido",
    agent: "Camila Prado",
    sla: "—",
    rating: 5,
  },
  {
    id: "TCK-8836",
    subject: "Exportação de auditoria em CSV",
    client: "TransPampa",
    priority: "Baixa",
    status: "Resolvido",
    agent: "Luana Reis",
    sla: "—",
    rating: 4,
  },
];

export const fleetOps = [
  {
    plate: "OEP-4660",
    driver: "Wanderson Sousa Silva",
    client: "Cimentos Laranjeiras",
    status: "Em rota",
    detail: "Retornando",
    city: "Laranjeiras/SE",
    speed: 62,
  },
  {
    plate: "OEP-4630",
    driver: "Marcio Ferreira de Oliveira",
    client: "Cimentos Laranjeiras",
    status: "Em rota",
    detail: "Retornando",
    city: "Laranjeiras/SE",
    speed: 71,
  },
  {
    plate: "OEP-5060",
    driver: "Geovan Lucena dos Santos",
    client: "Vale Verde",
    status: "Em rota",
    detail: "Indo descarregar",
    city: "Aracaju/SE",
    speed: 48,
  },
  {
    plate: "OER-5D76",
    driver: "Euclesio Anchieta Silva",
    client: "Log Nordeste",
    status: "Parado",
    detail: "Aguardando motorista",
    city: "N. S. do Socorro/SE",
    speed: 0,
  },
  {
    plate: "OES-5D04",
    driver: "Joselito Felix dos Santos",
    client: "Vale Verde",
    status: "Parado",
    detail: "Aguardando comando",
    city: "Laranjeiras/SE",
    speed: 0,
  },
  {
    plate: "OZB-6F80",
    driver: "Edson Joaquim de Freitas",
    client: "Atlas Bulk Mining",
    status: "Manutenção",
    detail: "Oficina credenciada",
    city: "Marabá/PA",
    speed: 0,
  },
  {
    plate: "OZB-6G30",
    driver: "Jose Claudio Souza",
    client: "Rodoserra",
    status: "Em rota",
    detail: "Carregado",
    city: "Betim/MG",
    speed: 83,
  },
  {
    plate: "QMG-1611",
    driver: "Antonio Pereira Lima",
    client: "Sertão Logística",
    status: "Quebrado",
    detail: "Aguardando resgate",
    city: "Caruaru/PE",
    speed: 0,
  },
];

export const mapPins = [
  { id: 1, x: 62, y: 34, kind: "frete", label: "OEP-4660 · Vale Verde", info: "Em rota · 62 km/h" },
  {
    id: 2,
    x: 71,
    y: 46,
    kind: "empresa",
    label: "Cimentos Laranjeiras",
    info: "18 veículos online",
  },
  { id: 3, x: 48, y: 58, kind: "alerta", label: "QMG-1611 · Sertão", info: "Veículo quebrado" },
  { id: 4, x: 55, y: 24, kind: "motorista", label: "Geovan Lucena", info: "Jornada 4h12m" },
  {
    id: 5,
    x: 34,
    y: 66,
    kind: "frete",
    label: "OZB-6G30 · Rodoserra",
    info: "Carregado · 83 km/h",
  },
  { id: 6, x: 40, y: 40, kind: "empresa", label: "Atlas Bulk Mining", info: "42 veículos online" },
  { id: 7, x: 78, y: 62, kind: "motorista", label: "Edson Freitas", info: "Em manutenção" },
  { id: 8, x: 26, y: 30, kind: "alerta", label: "Excesso de velocidade", info: "TransPampa Sul" },
  { id: 9, x: 66, y: 74, kind: "frete", label: "OES-5D04 · Vale Verde", info: "Parado 22 min" },
];

export const invoices = [
  {
    id: "INV-20418",
    client: "Atlas Bulk Mining",
    amount: "R$ 48.900,00",
    method: "PIX",
    status: "Pago",
    due: "28/07",
    paid: "28/07",
  },
  {
    id: "INV-20417",
    client: "Vale Verde",
    amount: "R$ 18.400,00",
    method: "Cartão",
    status: "Pago",
    due: "28/07",
    paid: "28/07",
  },
  {
    id: "INV-20416",
    client: "Sertão Logística",
    amount: "R$ 9.700,00",
    method: "Boleto",
    status: "Vencido",
    due: "22/07",
    paid: "—",
  },
  {
    id: "INV-20415",
    client: "Rodoserra Transportes",
    amount: "R$ 27.500,00",
    method: "PIX",
    status: "Pago",
    due: "25/07",
    paid: "25/07",
  },
  {
    id: "INV-20414",
    client: "Litoral Express",
    amount: "R$ 7.600,00",
    method: "Cartão",
    status: "Reembolsado",
    due: "20/07",
    paid: "20/07",
  },
  {
    id: "INV-20413",
    client: "Log Nordeste Cargas",
    amount: "R$ 22.100,00",
    method: "Boleto",
    status: "Aguardando",
    due: "02/08",
    paid: "—",
  },
];
