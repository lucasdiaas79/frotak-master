import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

interface Props {
  lat?: number;
  lng?: number;
  onChange: (coords: { lat: number; lng: number }) => void;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [-10.92, -37.07];

export function LocationPickerMap({ lat, lng, onChange, className }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || mapInstance.current) return;

      const initial: [number, number] =
        Number.isFinite(lat) && Number.isFinite(lng) ? [lat!, lng!] : DEFAULT_CENTER;

      const map = L.map(mapRef.current, {
        attributionControl: false,
        zoomControl: true,
      }).setView(initial, Number.isFinite(lat) && Number.isFinite(lng) ? 14 : 6);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      map.on("click", (event) => {
        const coords = { lat: event.latlng.lat, lng: event.latlng.lng };
        setMarker(L, map, coords.lat, coords.lng);
        onChangeRef.current(coords);
      });

      mapInstance.current = map;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 120);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setMarker(L, map, lat!, lng!);
      }
    })();

    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
      markerRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !mapInstance.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    (async () => {
      const L = await import("leaflet");
      const map = mapInstance.current;
      if (!map) return;
      setMarker(L, map, lat!, lng!);
      map.setView([lat!, lng!], Math.max(map.getZoom(), 14), { animate: true });
      window.setTimeout(() => map.invalidateSize(), 80);
    })();
  }, [lat, lng, ready]);

  const setMarker = (
    L: typeof import("leaflet"),
    map: LeafletMap,
    nextLat: number,
    nextLng: number,
  ) => {
    if (!markerRef.current) {
      markerRef.current = L.marker([nextLat, nextLng]).addTo(map);
      return;
    }
    markerRef.current.setLatLng([nextLat, nextLng]);
  };

  return <div ref={mapRef} className={className} />;
}
