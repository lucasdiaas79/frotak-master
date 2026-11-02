import { Bot } from "lucide-react";
import type { TmsModule } from "@/modules/types";

export const frotakAiModule: TmsModule = {
  code: "frotak_ai",
  label: "Frotak IA",
  paths: ["/frotak-ia"],
  nav: {
    operational: [{ to: "/frotak-ia", label: "Frotak IA", icon: Bot, order: 30 }],
  },
};
