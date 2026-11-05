import {
  Activity,
  Bell,
  Building2,
  Gauge,
  Headphones,
  LayoutDashboard,
  Map,
  Plug,
  Settings,
  TrendingUp,
  UserCircle,
  Wallet,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { isHiddenPrototypeRoute, prototypesHidden } from "@/lib/prototypes";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "Visao geral",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard },
      { label: "Clientes", to: "/clientes", icon: Building2, badge: "128" },
      { label: "Operacoes", to: "/operacoes", icon: Activity },
      { label: "Mapa Global", to: "/mapa", icon: Map },
      { label: "Alertas", to: "/alertas", icon: Bell, badge: "9" },
    ],
  },
  {
    label: "Receita",
    items: [
      { label: "Financeiro", to: "/financeiro", icon: Wallet },
      { label: "Comercial", to: "/comercial", icon: TrendingUp },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { label: "Integracoes", to: "/integracoes", icon: Plug },
      { label: "Webhooks", to: "/webhooks", icon: Webhook },
      { label: "Monitoramento", to: "/monitoramento", icon: Gauge },
    ],
  },
  {
    label: "Suporte & conta",
    items: [
      { label: "Suporte", to: "/suporte", icon: Headphones, badge: "4" },
      { label: "Configuracoes", to: "/configuracoes", icon: Settings },
      { label: "Perfil", to: "/perfil", icon: UserCircle },
    ],
  },
];

/** O menu sem as telas fictícias nem os contadores inventados, quando elas estão escondidas. */
export const visibleNavGroups: NavGroup[] = prototypesHidden
  ? navGroups
      .map((group) => ({
        ...group,
        items: group.items
          .filter((item) => !isHiddenPrototypeRoute(item.to))
          .map(({ badge: _badge, ...item }) => item),
      }))
      .filter((group) => group.items.length > 0)
  : navGroups;

export const flatNav = navGroups.flatMap((group) => group.items);
