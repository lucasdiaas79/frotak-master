import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import {
  shipperAskAi,
  shipperDocumentLink,
  shipperInviteCarrier,
  shipperLoadPortal,
  shipperRemoveCarrier,
  shipperRenewInvite,
  shipperAddDriverNote,
  shipperLoadThirdParties,
  shipperRateTrip,
  shipperSaveNetworkSettings,
  shipperSearchNetwork,
  shipperSetDriverDecision,
} from "./api";
import { demoNetwork, demoThirdParties } from "./demoNetwork";
import { answerLocally } from "./analytics";
import { demoPortalData } from "./demo";
import type {
  DriverDecision,
  NetworkDriver,
  ShipperCarrier,
  ShipperNetworkSettings,
  ShipperPortalData,
  ShipperThirdPartyData,
} from "./types";

export type NetworkFilters = {
  state?: string;
  city?: string;
  vehicle?: string;
  docsOk?: boolean;
  minScore?: number;
};

// Sessao e dados do portal do embarcador no navegador.

const DEMO_KEY = "frotak-embarcador-demo";
const REFRESH_MS = 60_000;

export function isDemoMode() {
  try {
    return window.sessionStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoMode(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(DEMO_KEY, "1");
    else window.sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // modo demonstracao so dura a aba; sem storage, nao ha o que guardar
  }
}

export async function shipperAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export async function shipperSignIn(email: string, password: string) {
  setDemoMode(false);
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    throw new Error(
      /invalid/i.test(error.message)
        ? "E-mail ou senha incorretos."
        : "Não foi possível entrar agora.",
    );
  }
  const token = await shipperAccessToken();
  const result = await shipperLoadPortal({ data: { accessToken: token } });
  if (!result.ok) {
    if (result.code === "not_shipper") await supabase.auth.signOut();
    throw new Error(result.error);
  }
}

export async function shipperSignOut() {
  setDemoMode(false);
  await supabase.auth.signOut();
}

// ------------------------------------------------------------ Contexto

type InviteInput = {
  name: string;
  cnpj?: string;
  contactName?: string;
  email?: string;
  phone?: string;
};
type ChatTurn = { role: "user" | "assistant"; text: string };

interface PortalContextValue {
  data: ShipperPortalData | null;
  error: string | null;
  loading: boolean;
  demo: boolean;
  reload: () => Promise<void>;
  inviteCarrier: (input: InviteInput) => Promise<ShipperCarrier>;
  renewInvite: (carrierId: string) => Promise<ShipperCarrier>;
  removeCarrier: (carrierId: string) => Promise<void>;
  documentUrl: (documentId: string) => Promise<string | null>;
  askAi: (question: string, history: ChatTurn[]) => Promise<string>;
  thirdParties: ShipperThirdPartyData | null;
  setDecision: (
    profileId: string,
    status: DriverDecision | "limpar",
    reason?: string,
  ) => Promise<void>;
  addNote: (profileId: string, body: string) => Promise<void>;
  rateTrip: (input: {
    freightId: string;
    score: number;
    onTime?: boolean;
    comment?: string;
  }) => Promise<void>;
  saveSettings: (settings: ShipperNetworkSettings) => Promise<void>;
  searchNetwork: (
    filters: NetworkFilters,
  ) => Promise<{ drivers: NetworkDriver[]; total: number; locked: boolean }>;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function useShipperPortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("useShipperPortal fora do ShipperPortalProvider");
  return value;
}

function fakeInviteUrl() {
  return `${window.location.origin}/embarcador/convite/demonstracao`;
}

export function ShipperPortalProvider({
  demo,
  onUnauthorized,
  children,
}: {
  demo: boolean;
  onUnauthorized: () => void;
  children: ReactNode;
}) {
  const [data, setData] = useState<ShipperPortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [thirdParties, setThirdParties] = useState<ShipperThirdPartyData | null>(null);
  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;

  const reload = useCallback(async () => {
    if (demo) {
      setData((current) => {
        const fresh = demoPortalData();
        // Mantem convites criados durante a demonstracao.
        const extra = current?.carriers.filter((carrier) => carrier.id.startsWith("novo-")) ?? [];
        return { ...fresh, carriers: [...fresh.carriers, ...extra] };
      });
      // Mantem o que foi mudado durante a demonstracao (decisoes, notas, compartilhamento).
      setThirdParties((current) => current ?? demoThirdParties(demoPortalData()));
      setLoading(false);
      return;
    }
    const accessToken = await shipperAccessToken();
    if (!accessToken) {
      unauthorizedRef.current();
      return;
    }
    const result = await shipperLoadPortal({ data: { accessToken } });
    if (result.ok) {
      setData(result.data);
      setError(null);
      const third = await shipperLoadThirdParties({ data: { accessToken } });
      if (third.ok) setThirdParties(third.data);
    } else if (result.code === "unauthorized" || result.code === "not_shipper") {
      unauthorizedRef.current();
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  const value = useMemo<PortalContextValue>(
    () => ({
      data,
      error,
      loading,
      demo,
      reload,
      async inviteCarrier(input) {
        if (demo) {
          const carrier: ShipperCarrier = {
            id: `novo-${Date.now()}`,
            name: input.name,
            cnpj: input.cnpj?.replace(/\D/g, "") || undefined,
            contactName: input.contactName,
            contactEmail: input.email,
            contactPhone: input.phone,
            status: "convidada",
            invitedAt: new Date().toISOString(),
            inviteUrl: fakeInviteUrl(),
          };
          setData((current) =>
            current ? { ...current, carriers: [...current.carriers, carrier] } : current,
          );
          return carrier;
        }
        const result = await shipperInviteCarrier({
          data: {
            ...input,
            accessToken: await shipperAccessToken(),
            origin: window.location.origin,
          },
        });
        if (!result.ok) throw new Error(result.error);
        await reload();
        return result.carrier;
      },
      async renewInvite(carrierId) {
        if (demo) {
          const carrier = data?.carriers.find((item) => item.id === carrierId);
          if (!carrier) throw new Error("Convite não encontrado.");
          return { ...carrier, inviteUrl: fakeInviteUrl() };
        }
        const result = await shipperRenewInvite({
          data: {
            accessToken: await shipperAccessToken(),
            carrierId,
            origin: window.location.origin,
          },
        });
        if (!result.ok) throw new Error(result.error);
        await reload();
        return result.carrier;
      },
      async removeCarrier(carrierId) {
        if (demo) {
          setData((current) =>
            current
              ? { ...current, carriers: current.carriers.filter((item) => item.id !== carrierId) }
              : current,
          );
          return;
        }
        const result = await shipperRemoveCarrier({
          data: { accessToken: await shipperAccessToken(), carrierId },
        });
        if (!result.ok) throw new Error(result.error);
        await reload();
      },
      async documentUrl(documentId) {
        if (demo) return null;
        const result = await shipperDocumentLink({
          data: { accessToken: await shipperAccessToken(), documentId },
        });
        if (!result.ok) throw new Error(result.error);
        return result.url;
      },
      async askAi(question, history) {
        try {
          const result = await shipperAskAi({
            data: { accessToken: demo ? "" : await shipperAccessToken(), demo, question, history },
          });
          if (result.ok) return result.text;
          throw new Error(result.error);
        } catch (err) {
          // Sem servidor de IA (ex.: demonstracao offline), responde com as regras locais.
          if (data) return answerLocally(question, data);
          throw err;
        }
      },
      thirdParties,
      async setDecision(profileId, status, reason) {
        if (demo) {
          setThirdParties((current) =>
            current
              ? {
                  ...current,
                  drivers: current.drivers.map((driver) =>
                    driver.profileId === profileId
                      ? {
                          ...driver,
                          decision: status === "limpar" ? undefined : status,
                          decisionReason: status === "limpar" ? undefined : reason,
                        }
                      : driver,
                  ),
                }
              : current,
          );
          return;
        }
        const result = await shipperSetDriverDecision({
          data: { accessToken: await shipperAccessToken(), profileId, status, reason },
        });
        if (!result.ok) throw new Error(result.error);
        await reload();
      },
      async addNote(profileId, body) {
        if (demo) {
          setThirdParties((current) =>
            current
              ? {
                  ...current,
                  drivers: current.drivers.map((driver) =>
                    driver.profileId === profileId
                      ? {
                          ...driver,
                          notes: [
                            {
                              id: `n-${Date.now()}`,
                              body,
                              author: data?.profile.userName,
                              at: new Date().toISOString(),
                            },
                            ...driver.notes,
                          ],
                        }
                      : driver,
                  ),
                }
              : current,
          );
          return;
        }
        const result = await shipperAddDriverNote({
          data: { accessToken: await shipperAccessToken(), profileId, body },
        });
        if (!result.ok) throw new Error(result.error);
        await reload();
      },
      async rateTrip(input) {
        if (demo) {
          setThirdParties((current) =>
            current
              ? {
                  ...current,
                  drivers: current.drivers.map((driver) => ({
                    ...driver,
                    trips: driver.trips.map((trip) =>
                      trip.freightId === input.freightId
                        ? { ...trip, myScore: input.score, onTime: input.onTime ?? trip.onTime }
                        : trip,
                    ),
                  })),
                }
              : current,
          );
          return;
        }
        const result = await shipperRateTrip({
          data: { accessToken: await shipperAccessToken(), ...input },
        });
        if (!result.ok) throw new Error(result.error);
        await reload();
      },
      async saveSettings(settings) {
        if (demo) {
          setThirdParties((current) => (current ? { ...current, settings } : current));
          return;
        }
        const result = await shipperSaveNetworkSettings({
          data: { accessToken: await shipperAccessToken(), settings },
        });
        if (!result.ok) throw new Error(result.error);
        setThirdParties((current) => (current ? { ...current, settings } : current));
      },
      async searchNetwork(filters) {
        if (demo) {
          if (thirdParties && !thirdParties.settings.shareApproved)
            return { drivers: [], total: 0, locked: true };
          const all = demoNetwork();
          const drivers = all.drivers.filter(
            (driver) =>
              (!filters.docsOk || driver.docState === "ok" || driver.docState === "vencendo") &&
              (!filters.minScore || (driver.score ?? 0) >= filters.minScore) &&
              (!filters.state || driver.baseCity?.endsWith(`/${filters.state.toUpperCase()}`)) &&
              (!filters.vehicle ||
                driver.vehicleKind?.toLowerCase().includes(filters.vehicle.toLowerCase())),
          );
          return { ...all, drivers };
        }
        const result = await shipperSearchNetwork({
          data: { accessToken: await shipperAccessToken(), ...filters },
        });
        if (!result.ok) throw new Error(result.error);
        return { drivers: result.drivers, total: result.total, locked: result.locked };
      },
    }),
    [data, error, loading, demo, reload, thirdParties],
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}
