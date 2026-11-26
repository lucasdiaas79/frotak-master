import { getSession } from "@/lib/auth";

// Só decide o que aparece na tela. Quem garante é o servidor, em control-panel-service.
export function canOperatePanel() {
  const role = getSession()?.role;
  return role === "super_admin" || role === "operations";
}

export function isPanelAdmin() {
  return getSession()?.role === "super_admin";
}
