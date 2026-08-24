import { createServerFn } from "@tanstack/react-start";

export interface PlaceSuggestion {
  id: string;
  label: string;
  lat: number;
  lng: number;
  provider: "google" | "openstreetmap";
  name?: string;
  address?: string;
}

interface PlaceSearchInput {
  name?: string;
  postalCode?: string;
  address?: string;
  district?: string;
  city?: string;
  state?: string;
}

function compact(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean) as string[];
}

function normalizeSearchText(value?: string) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\bS\/A\b/gi, "SA")
    .replace(/\bLTDA\b/gi, "Ltda")
    .trim();
}

function uniqueQueries(input: PlaceSearchInput) {
  const name = normalizeSearchText(input.name);
  const postalCode = normalizeSearchText(input.postalCode);
  const address = normalizeSearchText(input.address);
  const district = normalizeSearchText(input.district);
  const city = normalizeSearchText(input.city);
  const state = normalizeSearchText(input.state);
  const queries = [
    compact([name, address, district, city, state, "Brasil"]).join(", "),
    compact([name, district, city, state, "Brasil"]).join(", "),
    compact([name, city, state, "Brasil"]).join(", "),
    compact([address, district, city, state, "Brasil"]).join(", "),
    compact([postalCode, city, state, "Brasil"]).join(", "),
    compact([postalCode, "Brasil"]).join(", "),
    compact([city, state, "Brasil"]).join(", "),
  ];
  return Array.from(new Set(queries.filter((query) => query && query !== "Brasil")));
}

export async function searchPlaceSuggestions(input: PlaceSearchInput): Promise<PlaceSuggestion[]> {
  const queries = uniqueQueries(input);
  if (queries.length === 0) return [];

  const googleResults = await searchGooglePlaces({ data: { queries } });
  if (googleResults.length > 0) return dedupeSuggestions(googleResults);

  const allResults: PlaceSuggestion[] = [];
  for (const query of queries.slice(0, 4)) {
    try {
      allResults.push(...(await searchOpenStreetMapPlaces(query)));
    } catch (error) {
      if (query === queries[0]) throw error;
    }
  }

  return dedupeSuggestions(allResults).slice(0, 8);
}

function dedupeSuggestions(results: PlaceSuggestion[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.provider}:${result.label.toLowerCase()}:${result.lat.toFixed(5)}:${result.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const searchGooglePlaces = createServerFn({ method: "POST" })
  .inputValidator((input: { queries: string[] }) => input)
  .handler(async ({ data }): Promise<PlaceSuggestion[]> => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return [];

    for (const query of data.queries.slice(0, 4)) {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus",
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: "pt-BR",
          regionCode: "BR",
          maxResultCount: 6,
        }),
      });

      if (!response.ok) {
        console.error("[geocoding] Google Places search failed", {
          status: response.status,
          statusText: response.statusText,
        });
        continue;
      }

      const payload = (await response.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          businessStatus?: string;
        }>;
      };

      const places = (payload.places ?? [])
        .map((place, index) => {
          const lat = Number(place.location?.latitude);
          const lng = Number(place.location?.longitude);
          const name = place.displayName?.text?.trim();
          const address = place.formattedAddress?.trim();
          return {
            id: `google:${place.id ?? index}`,
            label: [name, address].filter(Boolean).join(" - "),
            name,
            address,
            lat,
            lng,
            provider: "google" as const,
          };
        })
        .filter((row) => row.label && Number.isFinite(row.lat) && Number.isFinite(row.lng));

      if (places.length > 0) return places;
    }

    return [];
  });

async function searchOpenStreetMapPlaces(query: string): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "8",
    countrycodes: "br",
    addressdetails: "1",
    namedetails: "1",
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
    name?: string;
  }>;

  return rows
    .map((row, index) => ({
      id: `osm:${row.place_id ?? index}`,
      label: row.display_name ?? "",
      name: row.name,
      address: row.display_name,
      lat: Number(row.lat),
      lng: Number(row.lon),
      provider: "openstreetmap" as const,
    }))
    .filter((row) => row.label && Number.isFinite(row.lat) && Number.isFinite(row.lng));
}
