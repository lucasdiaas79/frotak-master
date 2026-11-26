import type {
  TrackedVehicle,
  TrackerPosition,
  TrackerSyncResponse,
  TrackerVehicle,
} from "@/modules/frotak-tracking/domain/trackerPositions";
import type { TrackerSyncState } from "@/modules/frotak-tracking/domain/trackerSyncState";

/**
 * Fornecedor de rastreamento. Para integrar um rastreador novo, implemente esta
 * interface num adaptador em infrastructure/ e registre-o na fabrica de provedores.
 */
export interface TrackerProvider {
  /** Codigo gravado nas posicoes e no estado da sincronizacao (ex.: "sascar"). */
  readonly name: string;
  /** Nome exibido em mensagens (ex.: "Sascar"). */
  readonly label: string;
  /** Maximo de posicoes por chamada. */
  readonly batchLimit: number;
  listVehicles(): Promise<TrackerVehicle[]>;
  latestPositions(quantity: number): Promise<TrackerPosition[]>;
  positionsBySequence(start: number, end: number, limit: number): Promise<TrackerPosition[]>;
  vehicleHistory(externalVehicleId: string, start: Date, end: Date): Promise<TrackerPosition[]>;
}

/** Integracao de rastreador configurada para um workspace. */
export interface TrackerIntegration {
  provider: string;
  secretRef: string | null;
  config: Record<string, unknown> | null;
}

export interface TrackerProviderFactory {
  readonly supportedProviders: string[];
  /** null: modo legado sem workspace, com as credenciais globais. */
  create(integration: TrackerIntegration | null): TrackerProvider;
}

export interface TrackerSyncTarget {
  workspaceId: string | null;
  tenantId: string | null;
  integration: TrackerIntegration | null;
}

/** Persistencia da sincronizacao (hoje Supabase). */
export interface TrackingRepository {
  findSyncTarget(workspaceId: string | null, providers: string[]): Promise<TrackerSyncTarget>;
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
  listVehicles(tenantId: string | null): Promise<TrackedVehicle[]>;
  readLastSequence(tenantId: string, provider: string): Promise<number | null>;
  bindVehicle(vehicleId: string, externalId: string): Promise<void>;
  savePosition(vehicle: TrackedVehicle, position: TrackerPosition, provider: string): Promise<void>;
  purgeOldPositions(retention: string): Promise<number>;
  saveSyncState(input: {
    tenantId: string;
    provider: string;
    syncedAt: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

/** Ajustes da sincronizacao (vem de variaveis de ambiente na composicao). */
export interface TrackerSyncSettings {
  includeCurrentHistoryByDefault: boolean;
  currentHistoryConcurrency: number;
  currentHistoryStaleMinutes: number;
  currentHistoryLookbackHours: number;
  maxRecoveryPages: number;
}

/** Lado do navegador: ler, pedir e acompanhar a sincronizacao do tenant ativo. */
export interface TrackerSyncGateway {
  getState(tenantId: string): Promise<TrackerSyncState>;
  requestSync(input: { quantity: number; forceFull: boolean }): Promise<TrackerSyncResponse>;
  watchState(tenantId: string, onChange: (state: TrackerSyncState) => void): () => void;
}
