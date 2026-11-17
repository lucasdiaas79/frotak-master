// Viagem ficticia para a demonstracao do link do motorista.

import { DRIVER_DOC_LABELS, docStateFor, type DriverDocKind } from "@/lib/shipper/types";
import type { DriverLinkView } from "./types";

const DAY = 86_400_000;

export function demoDriverLinkView(now = Date.now()): DriverLinkView {
  const iso = (offset: number) => new Date(now - offset).toISOString();
  const docDays: Partial<Record<DriverDocKind, number>> = { cnh: 900, rntrc: 400, seguro: 25 };
  return {
    demo: true,
    driverName: "João",
    carrierName: "Transportes Rio Real",
    plate: "TNX6J30",
    active: true,
    step: "em_rota",
    statusLabel: "Em rota de entrega",
    product: "Brita 1 · 32 t",
    origin: { name: "Pedreira Serra Azul", place: "Aracaju/SE" },
    destination: { name: "Construtora Litoral", place: "Salvador/BA" },
    hasTracker: false,
    lastPositionAt: iso(3 * 60_000),
    expiresAt: new Date(now + 18 * DAY).toISOString(),
    fleetKmPerLiter: 2.38,
    fuel: [
      {
        id: "f1",
        station: "Posto Graal · Aracaju/SE",
        liters: 380,
        amount: 2298.8,
        odometer: 284_102,
        at: iso(2 * DAY),
      },
      {
        id: "f2",
        station: "Posto Graal · Estância/SE",
        liters: 412.6,
        amount: 2495.23,
        odometer: 284_917,
        at: iso(5 * 3600_000),
        kmPerLiter: 1.98,
      },
    ],
    settlement: {
      pay: 3200,
      advances: 1500,
      reimbursable: 469.4,
      balance: 2169.4,
      expenses: [
        {
          id: "e1",
          category: "arla",
          description: "Arla 32 · Posto Graal Estância/SE",
          amount: 165,
          at: iso(5 * 3600_000),
        },
        {
          id: "e2",
          category: "pedagio",
          description: "Pedágio BR-101",
          amount: 184.4,
          at: iso(4 * 3600_000),
        },
        {
          id: "e3",
          category: "alimentacao",
          description: "Almoço",
          amount: 120,
          at: iso(3 * 3600_000),
        },
      ],
      previous: [
        { freightId: "p1", date: iso(6 * DAY), balance: 0, pay: 3100 },
        { freightId: "p2", date: iso(13 * DAY), balance: 0, pay: 2900 },
        { freightId: "p3", date: iso(21 * DAY), balance: 0, pay: 3300 },
      ],
    },
    documents: (["cnh", "rntrc", "seguro", "crlv", "gr"] as DriverDocKind[]).map((kind) => {
      const days = docDays[kind];
      const expiresAt =
        days === undefined ? undefined : new Date(now + days * DAY).toISOString().slice(0, 10);
      return {
        kind,
        label: DRIVER_DOC_LABELS[kind],
        expiresAt,
        numberHint: days === undefined ? undefined : "4821",
        state: expiresAt ? docStateFor(expiresAt, now) : "faltando",
        informedBy: "motorista" as const,
      };
    }),
    network: { optIn: false, vehicleKind: "Carreta Scania R450", city: "Aracaju", state: "SE" },
  };
}
