/** Como o app motorista vincula veículo: fixo por motorista ou escolhido a cada frete. */
export type AssetAssignmentMode = "fixed_vehicle" | "manual_per_freight";

export function normalizeAssetAssignmentMode(settings: unknown): AssetAssignmentMode {
  const settingsRecord =
    settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const value = (settingsRecord.driverApp ?? settingsRecord.driver_app) as
    Record<string, unknown> | undefined;
  const mode = value?.assetAssignmentMode ?? value?.asset_assignment_mode;
  return mode === "manual_per_freight" ? "manual_per_freight" : "fixed_vehicle";
}
