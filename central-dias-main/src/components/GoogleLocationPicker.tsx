import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";

type LatLngLiteral = { lat: number; lng: number };

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

const DEFAULT_CENTER: [number, number] = [-10.92, -37.07];

export function GoogleLocationPicker({ lat, lng, postalCode, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      const initial: [number, number] = hasCoords ? [lat!, lng!] : DEFAULT_CENTER;

      const map = L.map(mapRef.current, {
        attributionControl: false,
        zoomControl: true,
      }).setView(initial, hasCoords ? 16 : 6);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      map.on("click", (event) => {
        const coords = { lat: event.latlng.lat, lng: event.latlng.lng };
        setMarker(L, map, coords);
        notifyManual(coords);
      });

      mapInstanceRef.current = map;
      setLoading(false);
      window.setTimeout(() => map.invalidateSize(), 120);

      if (hasCoords) {
        setMarker(L, map, { lat: lat!, lng: lng! });
      }
    })();

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      setLoading(false);
    };
    // O mapa deve ser inicializado uma vez; atualizacoes de lat/lng entram no efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    (async () => {
      const L = await import("leaflet");
      const map = mapInstanceRef.current;
      if (!map) return;
      const coords = { lat: lat!, lng: lng! };
      setMarker(L, map, coords);
      map.setView([coords.lat, coords.lng], Math.max(map.getZoom(), 16), { animate: true });
      window.setTimeout(() => map.invalidateSize(), 80);
    })();
    // Atualiza apenas quando o ponto selecionado muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const notifyManual = (coords: LatLngLiteral) => {
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
  };

  const setMarker = (L: typeof import("leaflet"), map: LeafletMap, coords: LatLngLiteral) => {
    if (!markerRef.current) {
      markerRef.current = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const position = markerRef.current?.getLatLng();
        if (!position) return;
        notifyManual({ lat: position.lat, lng: position.lng });
      });
      return;
    }
    markerRef.current.setLatLng([coords.lat, coords.lng]);
  };

  return (
    <div className="space-y-3">
      <div className="relative h-[300px] overflow-hidden rounded-2xl border border-border bg-surface-2 md:h-[420px]">
        <div ref={mapRef} className="h-full w-full" />
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/75">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2 text-[12px] font-bold text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando mapa
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
