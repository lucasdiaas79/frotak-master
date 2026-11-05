// Boa parte das telas do Master ainda mostra dados fictícios. Em ambiente real, com
// VITE_FROTAK_HIDE_PROTOTYPES=true, só aparecem as telas ligadas ao banco: operador não pode
// tomar decisão olhando número inventado nem achar que criou algo que não foi salvo.
const realRoutes = ["/", "/clientes", "/login"];

export const prototypesHidden = import.meta.env.VITE_FROTAK_HIDE_PROTOTYPES === "true";

export function isHiddenPrototypeRoute(pathname: string) {
  if (!prototypesHidden) return false;
  return !realRoutes.includes(pathname.replace(/\/+$/, "") || "/");
}
