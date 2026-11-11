import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import type { ShipperFreight } from "@/lib/shipper/types";

// Mapa das cargas em viagem. So mostra caminhoes com posicao recente.

function color(freight: ShipperFreight) {
  if (freight.occurrence) return "#DC2626";
  if (freight.statusLabel.startsWith("No local")) return "#D97706";
  return "#237B3B";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function ShipperMap({
  freights,
  onSelect,
  className,
}: {
  freights: ShipperFreight[];
  onSelect?: (freightId: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const located = freights.filter((freight) => freight.position);
  const signature = located
    .map(
      (f) => `${f.id}:${f.position?.lat}:${f.position?.lng}:${f.statusLabel}:${f.occurrence ?? ""}`,
    )
    .join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([-11.5, -37.8], 7);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      draw(L);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(L: typeof import("leaflet")) {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: Array<[number, number]> = [];
    for (const freight of located) {
      const pos = freight.position!;
      points.push([pos.lat, pos.lng]);
      const icon = L.divIcon({
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html: `<div style="width:34px;height:34px;border-radius:999px;background:${color(freight)};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font:800 9px 'Plus Jakarta Sans',sans-serif">${escapeHtml(freight.plate.slice(0, 3))}</div>`,
      });
      L.marker([pos.lat, pos.lng], { icon })
        .addTo(layer)
        .bindTooltip(
          `<strong>${escapeHtml(freight.carrierName)}</strong><br>${escapeHtml(freight.plate)} · ${escapeHtml(
            freight.occurrence ? "Ocorrência" : freight.statusLabel,
          )}<br>${escapeHtml(freight.destinationName ?? freight.destination ?? "")}`,
        )
        .on("click", () => selectRef.current?.(freight.id));
    }
    if (points.length === 1) map.setView(points[0], 9);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 10 });
  }

  useEffect(() => {
    void import("leaflet").then((L) => draw(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
