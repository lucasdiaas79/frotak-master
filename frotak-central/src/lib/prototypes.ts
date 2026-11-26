// Boa parte das telas do Master ainda mostra dados fictícios. Em ambiente real, com
// VITE_FROTAK_HIDE_PROTOTYPES=true, só aparecem as telas ligadas ao banco: operador não pode
// tomar decisão olhando número inventado nem achar que criou algo que não foi salvo.
const realRoutes = ["/", "/clientes", "/infraestrutura", "/login"];

export const prototypesHidden = import.meta.env.VITE_FROTAK_HIDE_PROTOTYPES === "true";

// O painel de controle depende das sentinelas, que só existem nas VPS.
export const controlPanelEnabled = import.meta.env.VITE_FROTAK_CONTROL_PANEL === "true";

// Ficha de cada cliente: /clientes/<identificador>.
const realPrefixes = ["/clientes/"];

export function isHiddenPrototypeRoute(pathname: string) {
  if (!prototypesHidden) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return !realRoutes.includes(path) && !realPrefixes.some((prefix) => path.startsWith(prefix));
}
