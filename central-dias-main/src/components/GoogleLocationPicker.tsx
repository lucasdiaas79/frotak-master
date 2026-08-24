import { useEffect, useRef, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { Loader2, MapPin } from "lucide-react";

type GoogleLatLngLiteral = { lat: number; lng: number };

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GooglePlaceResult = {
  name?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
  address_components?: GoogleAddressComponent[];
};

type GoogleGeocoderResult = {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
};

type GoogleMapsApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => {
      setCenter: (coords: GoogleLatLngLiteral) => void;
      setZoom: (zoom: number) => void;
      addListener: (
        eventName: string,
        callback: (event: { latLng?: GoogleMapLatLng }) => void,
      ) => void;
    };
    Marker: new (options: Record<string, unknown>) => {
      setPosition: (coords: GoogleLatLngLiteral) => void;
      addListener: (eventName: string, callback: () => void) => void;
      getPosition: () => GoogleMapLatLng | null | undefined;
    };
    Geocoder: new () => {
      geocode: (
        request: Record<string, unknown>,
        callback: (results: GoogleGeocoderResult[] | null, status: string) => void,
      ) => void;
    };
    MapTypeId: { HYBRID: string };
    event: {
      clearInstanceListeners: (instance: unknown) => void;
    };
  };
};

type GoogleMapLatLng = {
  lat: () => number;
  lng: () => number;
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __frotakGoogleMapsPromise?: Promise<GoogleMapsApi>;
  }
}

export type GoogleLocationSelection = {
  lat: number;
  lng: number;
  label: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  source: "geocoded" | "manual";
};

type Props = {
  lat?: number;
  lng?: number;
  postalCode?: string;
  onChange: (selection: GoogleLocationSelection) => void;
};

const DEFAULT_CENTER: GoogleLatLngLiteral = { lat: -10.92, lng: -37.07 };

const getGoogleMapsClientKey = createServerFn({ method: "GET" }).handler(async () => ({
  key: process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "",
}));

async function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("Mapa indisponivel."));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__frotakGoogleMapsPromise) return window.__frotakGoogleMapsPromise;

  let apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey?.trim()) {
    const response = await getGoogleMapsClientKey();
    apiKey = response.key;
  }

  if (!apiKey?.trim()) {
    return Promise.reject(
      new Error(
        "Configure GOOGLE_MAPS_API_KEY ou VITE_GOOGLE_MAPS_API_KEY para ativar o Google Maps.",
      ),
    );
  }

  window.__frotakGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      language: "pt-BR",
      region: "BR",
      loading: "async",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps nao carregou corretamente."));
    };
    script.onerror = () => reject(new Error("Nao foi possivel carregar Google Maps."));
    document.head.appendChild(script);
  });

  return window.__frotakGoogleMapsPromise;
}

function findComponent(components: GoogleAddressComponent[] | undefined, type: string) {
  return components?.find((component) => component.types.includes(type));
}

function parseAddress(
  place: Pick<GooglePlaceResult, "name" | "formatted_address" | "address_components">,
  coords: GoogleLatLngLiteral,
  source: "geocoded" | "manual",
): GoogleLocationSelection {
  const components = place.address_components ?? [];
  const route = findComponent(components, "route")?.long_name;
  const number = findComponent(components, "street_number")?.long_name;
  const neighborhood =
    findComponent(components, "sublocality_level_1")?.long_name ||
    findComponent(components, "sublocality")?.long_name;
  const city =
    findComponent(components, "administrative_area_level_2")?.long_name ||
    findComponent(components, "locality")?.long_name ||
    "";
  const state = findComponent(components, "administrative_area_level_1")?.short_name || "";
  const postalCode = findComponent(components, "postal_code")?.long_name || "";
  const street = [route, number].filter(Boolean).join(", ");
  const address = street || place.formatted_address || "";
  const label = [place.name, place.formatted_address].filter(Boolean).join(" - ");

  return {
    lat: coords.lat,
    lng: coords.lng,
    label: label || place.formatted_address || address || `${coords.lat}, ${coords.lng}`,
    address: [address, neighborhood].filter(Boolean).join(" - "),
    city,
    state,
    postalCode,
    source,
  };
}

export function GoogleLocationPicker({ lat, lng, postalCode, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<InstanceType<GoogleMapsApi["maps"]["Map"]> | null>(null);
  const markerRef = useRef<InstanceType<GoogleMapsApi["maps"]["Marker"]> | null>(null);
  const geocoderRef = useRef<InstanceType<GoogleMapsApi["maps"]["Geocoder"]> | null>(null);
  const onChangeRef = useRef(onChange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapRef.current) return;

        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
        const center = hasCoords ? { lat: lat!, lng: lng! } : DEFAULT_CENTER;
        const map = new google.maps.Map(mapRef.current, {
          center,
          zoom: hasCoords ? 17 : 6,
          mapTypeId: google.maps.MapTypeId.HYBRID,
          streetViewControl: false,
          fullscreenControl: true,
          mapTypeControl: true,
          zoomControl: true,
        });
        const geocoder = new google.maps.Geocoder();
        const marker = new google.maps.Marker({
          map,
          position: center,
          draggable: true,
          visible: hasCoords,
        });
        const updateMarker = (coords: GoogleLatLngLiteral, visible = true) => {
          marker.setPosition(coords);
          (marker as unknown as { setVisible?: (value: boolean) => void }).setVisible?.(visible);
          map.setCenter(coords);
          map.setZoom(17);
        };

        const reverseGeocode = (coords: GoogleLatLngLiteral) => {
          geocoder.geocode({ location: coords }, (results, status) => {
            if (status !== "OK" || !results?.[0]) {
              onChangeRef.current({
                lat: coords.lat,
                lng: coords.lng,
                label: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
                address: "",
                city: "",
                state: "",
                postalCode: "",
                source: "manual",
              });
              return;
            }

            onChangeRef.current(parseAddress(results[0], coords, "manual"));
          });
        };

        marker.addListener("dragend", () => {
          const position = marker.getPosition();
          if (!position) return;
          const coords = { lat: position.lat(), lng: position.lng() };
          reverseGeocode(coords);
        });

        map.addListener("click", (event) => {
          if (!event.latLng) return;
          const coords = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          updateMarker(coords);
          reverseGeocode(coords);
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = geocoder;
        setLoading(false);
      })
      .catch((loadError) => {
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : "Nao foi possivel abrir o mapa.");
      });

    return () => {
      cancelled = true;
    };
    // O mapa deve ser inicializado uma vez; atualizacoes de lat/lng entram no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const coords = { lat: lat!, lng: lng! };
    markerRef.current.setPosition(coords);
    (markerRef.current as unknown as { setVisible?: (value: boolean) => void }).setVisible?.(true);
    mapInstanceRef.current.setCenter(coords);
    mapInstanceRef.current.setZoom(17);
  }, [lat, lng]);

  return (
    <div className="space-y-3">
      <div className="relative h-[300px] overflow-hidden rounded-2xl border border-border bg-surface-2 md:h-[420px]">
        <div ref={mapRef} className="h-full w-full" />
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/75">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2 text-[12px] font-bold text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando Google Maps
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-4 flex items-center justify-center rounded-2xl border border-border bg-surface/95 px-4 text-center">
            <div className="max-w-sm text-[12px] font-semibold text-muted-foreground">
              Nao foi possivel abrir o mapa agora. A busca continua disponivel e o ponto pode ser
              salvo quando houver coordenadas.
              <span className="mt-1 block font-sans text-[10px] opacity-70">{error}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 rounded-2xl border border-border/70 bg-surface/60 px-3 py-2.5 text-[11.5px] text-muted-foreground sm:grid-cols-[1fr_auto]">
        <span className="inline-flex items-center gap-2">
          <MapPin className="size-3.5 text-primary" />
          Arraste o marcador ou clique no mapa para ajustar o ponto exato.
        </span>
        <span className="font-sans">CEP: {postalCode || "-"}</span>
      </div>
    </div>
  );
}
