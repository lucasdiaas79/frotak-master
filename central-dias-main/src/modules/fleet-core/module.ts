import {
  Building2,
  Container,
  FolderKanban,
  Fuel,
  Handshake,
  History,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  Truck,
  Users,
} from "lucide-react";
import type { TmsModule } from "@/modules/types";

export const fleetCoreModule: TmsModule = {
  code: "fleet_core",
  label: "Gestão de Frota",
  core: true,
  paths: [],
  nav: {
    operational: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, order: 10 },
      { to: "/gestao-frota", label: "Gestão de Frota", icon: ListChecks, order: 20 },
      { to: "/historicos", label: "Históricos", icon: History, order: 40 },
      { to: "/abastecimentos", label: "Abastecimentos", icon: Fuel, order: 50 },
      { to: "/mapa", label: "Mapa da Frota", icon: MapIcon, order: 60 },
      { to: "/embarcadores", label: "Embarcadores", icon: Handshake, order: 70 },
    ],
    registrations: [
      {
        title: "Cadastro de Frota",
        icon: FolderKanban,
        items: [
          { to: "/veiculos", label: "Veículos", icon: Truck },
          { to: "/motoristas", label: "Motoristas", icon: Users },
          { to: "/carretas", label: "Caçambas", icon: Container },
        ],
      },
      {
        title: "Cadastro de Clientes",
        icon: Building2,
        to: "/clientes",
        items: [{ to: "/clientes", label: "Clientes", icon: Building2 }],
      },
    ],
    admin: [{ to: "/usuarios", label: "Usuários", icon: Users }],
    mobile: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/gestao-frota", label: "Gestão", icon: ListChecks },
      {
        to: "/historicos",
        label: "Históricos",
        icon: History,
        activePaths: ["/historicos", "/abastecimentos", "/lucros-despesas"],
      },
      { to: "/mapa", label: "Mapa", icon: MapIcon },
      {
        to: "/veiculos",
        label: "Frota",
        icon: FolderKanban,
        activePaths: ["/veiculos", "/motoristas", "/carretas"],
      },
      {
        to: "/clientes",
        label: "Clientes",
        icon: Building2,
        activePaths: ["/clientes", "/remetentes", "/destinatarios", "/produtos"],
      },
    ],
  },
};
