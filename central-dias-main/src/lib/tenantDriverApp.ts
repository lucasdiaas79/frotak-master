import { useEffect, useState } from "react";
import { getActiveTenantId } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type AssetAssignmentMode = "fixed_vehicle" | "manual_per_freight";

function normalizeAssetAssignmentMode(settings: unknown): AssetAssignmentMode {
  const settingsRecord =
    settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const value = (settingsRecord.driverApp ?? settingsRecord.driver_app) as
    | Record<string, unknown>
    | undefined;
  const mode = value?.assetAssignmentMode ?? value?.asset_assignment_mode;
  return mode === "manual_per_freight" ? "manual_per_freight" : "fixed_vehicle";
}

export function useManualFreightAssetMode() {
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMode() {
      const tenantId = getActiveTenantId();
      const { data, error } = await supabase
        .from("tenants")
        .select("settings")
        .eq("id", tenantId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.warn("[tenantDriverApp] tenant settings unavailable", error);
        setManualMode(false);
        return;
      }
      setManualMode(normalizeAssetAssignmentMode(data?.settings) === "manual_per_freight");
    }

    void loadMode();

    return () => {
      cancelled = true;
    };
  }, []);

  return manualMode;
}
