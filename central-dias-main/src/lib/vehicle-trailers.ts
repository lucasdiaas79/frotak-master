import type { Trailer, Vehicle } from "@/lib/types";

export function vehicleTrailerIds(vehicle: Pick<Vehicle, "trailerId" | "trailerIds">): string[] {
  return vehicle.trailerIds?.length ? vehicle.trailerIds : vehicle.trailerId ? [vehicle.trailerId] : [];
}

export function vehicleTrailerLabel(
  vehicle: Pick<Vehicle, "trailerId" | "trailerIds">,
  trailers: Trailer[],
  fallback = "-",
): string {
  const byId = new Map(trailers.map((trailer) => [trailer.id, trailer.identifier]));
  const labels = vehicleTrailerIds(vehicle)
    .map((id) => byId.get(id))
    .filter(Boolean);
  return labels.length ? labels.join(" + ") : fallback;
}
