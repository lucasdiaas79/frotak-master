import { useEffect, useState } from "react";
import { getActiveTenantId } from "@/lib/auth";
import { getAssetAssignmentMode } from "@/modules/driver-app/container";

/** true quando o app motorista escolhe o veiculo a cada frete (em vez de veiculo fixo). */
export function useManualFreightAssetMode() {
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getAssetAssignmentMode(getActiveTenantId()).then((mode) => {
      if (!cancelled) setManualMode(mode === "manual_per_freight");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return manualMode;
}
