import type {
  TrackerIntegration,
  TrackerProvider,
  TrackerProviderFactory,
} from "@/modules/frotak-tracking/application/ports";
import { SascarTrackerProvider } from "./sascarTrackerProvider.ts";

// Rastreadores suportados. Um fornecedor novo entra aqui com o seu adaptador.
const providers: Record<string, (integration: TrackerIntegration | null) => TrackerProvider> = {
  sascar: (integration) => SascarTrackerProvider.fromIntegration(integration),
};

/** Sem integracao (modo legado sem workspace) vale a Sascar com credenciais globais. */
const LEGACY_PROVIDER = "sascar";

export const trackerProviders: TrackerProviderFactory = {
  supportedProviders: Object.keys(providers),
  create(integration) {
    const name = integration?.provider ?? LEGACY_PROVIDER;
    const create = providers[name];
    if (!create) throw new Error(`Rastreador nao suportado: ${name}.`);
    return create(integration);
  },
};
