export interface PlaceSuggestion {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface PlaceSearchInput {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
}

function compact(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean) as string[];
}

function uniqueQueries(input: PlaceSearchInput) {
  const queries = [
    compact([input.name, input.address, input.city, input.state, "Brasil"]).join(", "),
    compact([input.address, input.city, input.state, "Brasil"]).join(", "),
    compact([input.name, input.city, input.state, "Brasil"]).join(", "),
    compact([input.city, input.state, "Brasil"]).join(", "),
  ];
  return Array.from(new Set(queries.filter((query) => query && query !== "Brasil")));
}

export async function searchPlaceSuggestions(input: PlaceSearchInput): Promise<PlaceSuggestion[]> {
  const queries = uniqueQueries(input);
  if (queries.length === 0) return [];

  for (const query of queries) {
    const results = await searchPlaces(query);
    if (results.length > 0) return results;
  }

  return [];
}

async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "5",
    countrycodes: "br",
    q: query,
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { "Accept-Language": "pt-BR,pt;q=0.9" },
  });

  if (!response.ok) throw new Error("Nao foi possivel buscar sugestoes agora.");

  const rows = (await response.json()) as Array<{
    place_id?: number | string;
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;

  return rows
    .map((row, index) => ({
      id: String(row.place_id ?? index),
      label: row.display_name ?? "",
      lat: Number(row.lat),
      lng: Number(row.lon),
    }))
    .filter((row) => row.label && Number.isFinite(row.lat) && Number.isFinite(row.lng));
}
