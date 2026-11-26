import type { ReactNode } from "react";
import { Bot, FileCheck2, Handshake, MapPin, Timer } from "lucide-react";
import faviconPng from "@/assets/favicon.png";

// Moldura das telas de entrada do portal do embarcador (login, cadastro, convite).

const POINTS = [
  { icon: MapPin, text: "Todas as cargas, de todas as transportadoras, num mapa só." },
  { icon: FileCheck2, text: "Canhoto, CT-e e NF chegam sozinhos, sem cobrar ninguém no WhatsApp." },
  { icon: Handshake, text: "Ranking das transportadoras por prazo, ocorrências e canhoto." },
  { icon: Timer, text: "Tempo de espera na doca medido, carga por carga." },
  { icon: Bot, text: 'Frotak IA: pergunte "cadê minha carga?" e ela responde.' },
];

export function ShipperAuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[#0b1a10] p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute -right-32 -top-32 size-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #44AD60 0%, transparent 70%)" }}
        />
        <div className="relative flex items-center gap-2">
          <img src={faviconPng} alt="" className="size-9 rounded-xl" />
          <div>
            <p className="text-[17px] font-extrabold leading-none">Frotak</p>
            <p className="mt-0.5 text-[12px] font-semibold text-[#66BB1A]">Embarcador</p>
          </div>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-[34px] font-medium leading-tight">
            Pare de ligar para a transportadora para saber da sua carga.
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map((point) => (
              <li key={point.text} className="flex items-start gap-3 text-[14px] text-white/85">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#66BB1A]">
                  <point.icon className="size-4" />
                </span>
                <span className="pt-1.5">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-white/50">
          Grátis para o embarcador · frotak.log.br
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <img src={faviconPng} alt="" className="size-8 rounded-xl" />
            <div>
              <p className="text-[16px] font-extrabold leading-none">Frotak</p>
              <p className="mt-0.5 text-[11px] font-semibold text-primary">Embarcador</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
