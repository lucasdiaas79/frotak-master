// Composicao da Frotak IA no navegador: a tela usa a sessao de voz por aqui, sem conhecer
// o adaptador. Trocar o provedor de voz e trocar esta exportacao.
export {
  FrotakLiveSession,
  requestFrotakLiveMicrophone,
  type FrotakLiveStatus,
} from "@/modules/frotak-ai/infrastructure/frotakLive";
