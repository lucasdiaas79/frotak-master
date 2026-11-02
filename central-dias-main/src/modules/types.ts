import type { ComponentType } from "react";
import type { ModuleCode } from "@/lib/entitlements";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  activePaths?: string[];
}

export interface NavGroup {
  title: string;
  icon: ComponentType<{ className?: string }>;
  to?: string;
  items: NavItem[];
}

/**
 * Como um modulo do TMS se encaixa no app: as rotas que sao dele e o que ele poe no menu.
 * O AppLayout monta menu e bloqueio de rota a partir destes manifestos, conforme o que o
 * FrotaK Master liberou para o cliente.
 */
export interface TmsModule {
  code: ModuleCode;
  label: string;
  /** Modulo base do produto: dono de toda rota que nenhum outro modulo reivindica. */
  core?: boolean;
  /** Prefixos de rota do modulo; ficam bloqueados quando ele esta desligado. */
  paths: string[];
  nav?: {
    /** Secao "Operacional"; `order` intercala os itens de modulos diferentes. */
    operational?: Array<NavItem & { order: number }>;
    registrations?: NavGroup[];
    financial?: NavItem[];
    admin?: NavItem[];
    /** Barra inferior do celular. */
    mobile?: NavItem[];
  };
}
