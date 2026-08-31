import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { pendingActionKindOfVehicle, vehicleMapColor } from "@/lib/freight-workflow";
import type { Vehicle } from "@/lib/types";

interface Props {
  vehicles: Vehicle[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  getTooltipHtml?: (vehicle: Vehicle) => string;
  fitToVehicles?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  className?: string;
}

export function FleetMap({
  vehicles,
  selectedId,
  onSelect,
  getTooltipHtml,
  fitToVehicles = true,
  initialCenter = [-15.78, -47.93],
  initialZoom = 5,
  className,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const [zoomLevel, setZoomLevel] = useState(initialZoom);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    const syncZoom = () => {
      if (map) setZoomLevel(map.getZoom());
    };
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current || mapInstance.current) return;
      map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView(initialCenter, initialZoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      map.on("zoomend", syncZoom);
      setZoomLevel(map.getZoom());
      mapInstance.current = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      map?.off("zoomend", syncZoom);
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapReady || !mapInstance.current) return;
      const map = mapInstance.current;
      Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
      markersRef.current = {};
      vehicles.forEach((v) => {
        const isSel = v.id === selectedId;
        const { width, height } = getTruckMarkerSize(zoomLevel, isSel);
        const iconId = v.id.replace(/[^a-zA-Z0-9_-]/g, "") || "truck";
        const icon = L.divIcon({
          className: "",
          html: buildTruckMarkerSvg(
            vehicleMapColor(v),
            iconId,
            isSel,
            pendingActionKindOfVehicle(v) !== null,
            width,
            height,
          ),
          iconSize: [width, height],
          iconAnchor: [width / 2, height - 4],
        });
        const marker = L.marker([v.lat, v.lng], { icon }).addTo(map);
        if (onSelect) marker.on("click", () => onSelect(v.id));
        const tooltipHtml = getTooltipHtml?.(v);
        if (tooltipHtml) {
          marker.bindTooltip(tooltipHtml, {
            direction: "top",
            offset: [0, -height + 6],
            opacity: 0.96,
            className: "fleet-map-tooltip",
            sticky: true,
          });
        }
        markersRef.current[v.id] = marker;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicles, selectedId, onSelect, getTooltipHtml, zoomLevel, mapReady]);

  useEffect(() => {
    if (!fitToVehicles || selectedId || !mapReady || !mapInstance.current || vehicles.length === 0)
      return;
    const validVehicles = vehicles.filter(
      (vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng),
    );
    if (validVehicles.length === 0) return;

    const map = mapInstance.current;
    if (validVehicles.length === 1) {
      map.setView([validVehicles[0].lat, validVehicles[0].lng], Math.max(map.getZoom(), 11), {
        animate: false,
      });
      return;
    }

    const bounds = validVehicles.map((vehicle) => [vehicle.lat, vehicle.lng] as [number, number]);
    map.fitBounds(bounds, { animate: false, maxZoom: 11, padding: [48, 48] });
  }, [fitToVehicles, selectedId, vehicles, mapReady]);

  useEffect(() => {
    if (!selectedId || !mapInstance.current) return;
    const v = vehicles.find((x) => x.id === selectedId);
    if (v) {
      const map = mapInstance.current;
      map.setView([v.lat, v.lng], Math.max(map.getZoom(), 8), { animate: true });
    }
  }, [selectedId, vehicles]);

  return <div ref={mapRef} className={className} />;
}

function buildTruckMarkerSvg(
  cargoColor: string,
  iconId: string,
  selected: boolean,
  blinking: boolean,
  width: number,
  height: number,
) {
  const accent = selected ? "#111827" : "#ffffff";
  const cargoGradient = `cargoGrad-${iconId}`;
  const cabinGradient = `cabinGrad-${iconId}`;
  const windowGradient = `windowGrad-${iconId}`;
  const tireGradient = `tireGrad-${iconId}`;
  const hubGradient = `hubGrad-${iconId}`;
  const lightGradient = `lightGrad-${iconId}`;
  const animation = blinking ? "animation:fleetTruckBlink .85s ease-in-out infinite;" : "";

  return `
    ${
      blinking
        ? `<style>@keyframes fleetTruckBlink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.42;transform:scale(1.08)}}</style>`
        : ""
    }
    <div style="width:${width}px;height:${height}px;transform-origin:center bottom;${animation}">
      <svg width="${width}" height="${height}" viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="${cargoGradient}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${cargoColor}" />
            <stop offset="100%" stop-color="${darkenHex(cargoColor)}" />
          </linearGradient>
          <linearGradient id="${cabinGradient}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#f8f9fa" />
            <stop offset="100%" stop-color="#d2cbe3" />
          </linearGradient>
          <linearGradient id="${windowGradient}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#60a5fa" />
            <stop offset="100%" stop-color="#2563eb" />
          </linearGradient>
          <linearGradient id="${tireGradient}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#4b5563" />
            <stop offset="100%" stop-color="#1f2937" />
          </linearGradient>
          <radialGradient id="${hubGradient}" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="100%" stop-color="#e9d5ff" />
          </radialGradient>
          <linearGradient id="${lightGradient}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fde047" />
            <stop offset="100%" stop-color="#f59e0b" />
          </linearGradient>
        </defs>

        <path d="M 50 77 L 43 66 L 57 66 Z" fill="${accent}" stroke="#111827" stroke-width="2" />
        <circle cx="35" cy="65" r="10" fill="#111827" />
        <circle cx="80" cy="65" r="10" fill="#111827" />
        <path d="M 45 15 L 60 15 C 63 15 65 17 65 20 L 65 60 L 45 60 Z" fill="${darkenHex(cargoColor, 0.38)}" />
        <rect x="5" y="15" width="55" height="45" rx="6" fill="url(#${cargoGradient})" />
        <path d="M 50 25 L 75 25 C 80 25 84 30 87 38 L 94 48 C 96 50 96 52 96 55 L 96 60 C 96 63 94 65 91 65 L 50 65 Z" fill="url(#${cabinGradient})" />
        <rect x="91" y="52" width="6" height="3" fill="#ffffff" rx="1.5"/>
        <rect x="92" y="57" width="5" height="3" fill="#ffffff" rx="1.5"/>
        <path d="M 55 28 L 73 28 C 76 28 80 31 82 36 L 86 46 L 55 46 Z" fill="url(#${windowGradient})" />
        <rect x="78" y="42" width="4.5" height="8" rx="2.25" fill="#111827" />
        <path d="M 86 53 C 86 50 90 50 91 53 L 91 59 C 90 62 86 62 86 59 Z" fill="url(#${lightGradient})" />
        <circle cx="95" cy="56" r="3" fill="#fde047" />
        <circle cx="20" cy="62" r="11" fill="url(#${tireGradient})" />
        <circle cx="20" cy="62" r="5" fill="url(#${hubGradient})" />
        <circle cx="68" cy="62" r="11" fill="url(#${tireGradient})" />
        <circle cx="68" cy="62" r="5" fill="url(#${hubGradient})" />
      </svg>
    </div>
  `;
}

function getTruckMarkerSize(zoom: number, selected: boolean) {
  const clampedZoom = Math.min(12, Math.max(4, zoom));
  const scale = 0.58 + (clampedZoom - 4) * 0.045;
  const width = Math.round((selected ? 50 : 40) * scale);
  const height = Math.round(width * 0.8);

  return { width, height };
}

function darkenHex(hex: string, amount = 0.26) {
  const normalized = hex.replace("#", "");
  const channels = normalized.match(/.{1,2}/g);
  if (!channels || channels.length !== 3) return hex;

  const darkened = channels.map((channel) => {
    const value = Math.max(0, Math.round(parseInt(channel, 16) * (1 - amount)));
    return value.toString(16).padStart(2, "0");
  });

  return `#${darkened.join("")}`;
}
