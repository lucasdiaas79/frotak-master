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

type GoogleMap = {
  setCenter: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  getZoom: () => number | undefined;
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
  addListener: (eventName: string, handler: () => void) => { remove: () => void };
};

type GoogleLatLngBounds = {
  extend: (position: { lat: number; lng: number }) => void;
};

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
  addListener: (eventName: string, handler: () => void) => { remove: () => void };
};

type GoogleInfoWindow = {
  open: (options: { anchor: GoogleMarker; map: GoogleMap }) => void;
};

type GoogleMapsApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: {
        center: { lat: number; lng: number };
        zoom: number;
        mapTypeId: string;
        disableDefaultUI?: boolean;
        zoomControl?: boolean;
        fullscreenControl?: boolean;
        streetViewControl?: boolean;
        mapTypeControl?: boolean;
      },
    ) => GoogleMap;
    Marker: new (options: {
      position: { lat: number; lng: number };
      map: GoogleMap;
      title?: string;
      icon?: {
        url: string;
        scaledSize: unknown;
        anchor: unknown;
      };
    }) => GoogleMarker;
    InfoWindow: new (options: { content: string }) => GoogleInfoWindow;
    LatLngBounds: new () => GoogleLatLngBounds;
    Size: new (width: number, height: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    MapTypeId: {
      ROADMAP: string;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    __frotakGoogleMapsPromise?: Promise<GoogleMapsApi>;
  }
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
  const googleMapRef = useRef<GoogleMap | null>(null);
  const googleMarkersRef = useRef<Record<string, GoogleMarker>>({});
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const [zoomLevel, setZoomLevel] = useState(initialZoom);
  const [mapReady, setMapReady] = useState(false);
  const [provider, setProvider] = useState<"google" | "leaflet" | null>(null);

  useEffect(() => {
    let cancelled = false;
    let zoomListener: { remove: () => void } | undefined;
    let map: LeafletMap | null = null;
    const syncZoom = () => {
      if (map) setZoomLevel(map.getZoom());
    };
    (async () => {
      const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
      if (googleMapsKey && mapRef.current && !googleMapRef.current) {
        try {
          const google = await loadGoogleMaps(googleMapsKey);
          if (cancelled || !mapRef.current || googleMapRef.current) return;
          const googleMap = new google.maps.Map(mapRef.current, {
            center: { lat: initialCenter[0], lng: initialCenter[1] },
            zoom: initialZoom,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            disableDefaultUI: false,
            zoomControl: true,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
          });
          zoomListener = googleMap.addListener("zoom_changed", () => {
            setZoomLevel(googleMap.getZoom() ?? initialZoom);
          });
          googleMapRef.current = googleMap;
          setProvider("google");
          setMapReady(true);
          return;
        } catch (error) {
          console.error("[FleetMap] Google Maps failed, falling back to Leaflet", error);
        }
      }

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
      setProvider("leaflet");
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      zoomListener?.remove();
      map?.off("zoomend", syncZoom);
      googleMarkersRef.current &&
        Object.values(googleMarkersRef.current).forEach((marker) => marker.setMap(null));
      googleMarkersRef.current = {};
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (provider === "google" && googleMapRef.current && window.google) {
        const google = window.google;
        const map = googleMapRef.current;
        Object.values(googleMarkersRef.current).forEach((marker) => marker.setMap(null));
        googleMarkersRef.current = {};
        vehicles.forEach((v) => {
          const isSel = v.id === selectedId;
          const { width, height } = getTruckMarkerSize(zoomLevel, isSel);
          const iconId = v.id.replace(/[^a-zA-Z0-9_-]/g, "") || "truck";
          const marker = new google.maps.Marker({
            position: { lat: v.lat, lng: v.lng },
            map,
            title: v.plate,
            icon: {
              url: svgToDataUrl(
                buildTruckMarkerSvg(
                  vehicleMapColor(v),
                  iconId,
                  isSel,
                  pendingActionKindOfVehicle(v) !== null,
                  width,
                  height,
                ),
              ),
              scaledSize: new google.maps.Size(width, height),
              anchor: new google.maps.Point(width / 2, height - 4),
            },
          });
          if (onSelect) marker.addListener("click", () => onSelect(v.id));
          const tooltipHtml = getTooltipHtml?.(v);
          if (tooltipHtml) {
            const info = new google.maps.InfoWindow({ content: tooltipHtml });
            marker.addListener("mouseover", () => info.open({ anchor: marker, map }));
          }
          googleMarkersRef.current[v.id] = marker;
        });
        return;
      }

      const L = await import("leaflet");
      if (cancelled || provider !== "leaflet" || !mapReady || !mapInstance.current) return;
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
  }, [vehicles, selectedId, onSelect, getTooltipHtml, zoomLevel, mapReady, provider]);

  useEffect(() => {
    if (!fitToVehicles || selectedId || !mapReady || vehicles.length === 0) return;
    const validVehicles = vehicles.filter(
      (vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng),
    );
    if (validVehicles.length === 0) return;

    if (provider === "google" && googleMapRef.current && window.google) {
      const google = window.google;
      const map = googleMapRef.current;
      if (validVehicles.length === 1) {
        map.setCenter({ lat: validVehicles[0].lat, lng: validVehicles[0].lng });
        map.setZoom(Math.max(map.getZoom() ?? initialZoom, 11));
        return;
      }
      const bounds = new google.maps.LatLngBounds();
      validVehicles.forEach((vehicle) => bounds.extend({ lat: vehicle.lat, lng: vehicle.lng }));
      map.fitBounds(bounds, 48);
      return;
    }

    if (!mapInstance.current) return;
    const map = mapInstance.current;
    if (validVehicles.length === 1) {
      map.setView([validVehicles[0].lat, validVehicles[0].lng], Math.max(map.getZoom(), 11), {
        animate: false,
      });
      return;
    }

    const bounds = validVehicles.map((vehicle) => [vehicle.lat, vehicle.lng] as [number, number]);
    map.fitBounds(bounds, { animate: false, maxZoom: 11, padding: [48, 48] });
  }, [fitToVehicles, selectedId, vehicles, mapReady, provider, initialZoom]);

  useEffect(() => {
    if (!selectedId) return;
    const v = vehicles.find((x) => x.id === selectedId);
    if (v) {
      if (provider === "google" && googleMapRef.current) {
        const map = googleMapRef.current;
        map.setCenter({ lat: v.lat, lng: v.lng });
        map.setZoom(Math.max(map.getZoom() ?? initialZoom, 8));
        return;
      }
      if (!mapInstance.current) return;
      const map = mapInstance.current;
      map.setView([v.lat, v.lng], Math.max(map.getZoom(), 8), { animate: true });
    }
  }, [selectedId, vehicles, provider, initialZoom]);

  return <div ref={mapRef} className={className} />;
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__frotakGoogleMapsPromise) return window.__frotakGoogleMapsPromise;

  window.__frotakGoogleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const callbackName = `__frotakInitGoogleMaps_${Date.now()}`;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&callback=${callbackName}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Nao foi possivel carregar o Google Maps."));
    window[callbackName as keyof Window] = (() => {
      delete window[callbackName as keyof Window];
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps nao inicializado."));
    }) as never;
    document.head.appendChild(script);
  });

  return window.__frotakGoogleMapsPromise;
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
