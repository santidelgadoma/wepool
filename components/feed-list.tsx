"use client";

import { useState } from "react";
import { MapPin, Car } from "lucide-react";
import { UnirmeBoton } from "@/components/unirme-boton";
import { formatearFechaHoraCDMX } from "@/lib/datetime";
import { ETIQUETA_DIRECCION } from "@/lib/etiquetas";
import { formatearMXN } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { FeedCandidato } from "@/lib/actions/feed";

type Direccion = "ida" | "regreso";

// Filtro Ida/Regreso + tarjetas de feed rediseñadas (mockup aprobado en
// Claude Design, "Después — Home"): el precio pasa a ser el número más
// grande de la tarjeta y hay un solo botón claro por tarjeta en vez de tres
// badges apretadas. La lista de tarjetas hace scroll en su propio
// contenedor (`flex-1 min-h-0 overflow-y-auto`) mientras el filtro se queda
// fijo arriba -- y el resto del home (ubicación) y la barra de navegación
// inferior (ver components/app-nav.tsx) se quedan fijos fuera de este
// componente -- así siempre se alcanzan a ver varias tarjetas completas sin
// tener que scrollear la pantalla entera para llegar a la navegación (ver
// PROGRESS.md, pedido del 2026-08-26 "scroll fijo con mínimo de tres viajes
// visibles").
export function FeedList({
  candidatos,
  savedLocationId,
}: {
  candidatos: FeedCandidato[];
  savedLocationId: string;
}) {
  const idaList = candidatos.filter((c) => c.direction === "ida");
  const regresoList = candidatos.filter((c) => c.direction === "regreso");
  // Por default se abre en la dirección que sí tiene viajes -- si ambas
  // tienen (o ninguna, caso que en la práctica no llega a renderizar este
  // componente) se abre en "ida".
  const [filtro, setFiltro] = useState<Direccion>(
    idaList.length > 0 || regresoList.length === 0 ? "ida" : "regreso"
  );
  const lista = filtro === "ida" ? idaList : regresoList;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 gap-2 pb-4">
        <FiltroPill
          activo={filtro === "ida"}
          onClick={() => setFiltro("ida")}
          etiqueta={ETIQUETA_DIRECCION.ida}
          cantidad={idaList.length}
        />
        <FiltroPill
          activo={filtro === "regreso"}
          onClick={() => setFiltro("regreso")}
          etiqueta={ETIQUETA_DIRECCION.regreso}
          cantidad={regresoList.length}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay viajes de {ETIQUETA_DIRECCION[filtro].toLowerCase()} disponibles todavía.
          </p>
        ) : (
          <div className="flex flex-col gap-5 pb-6">
            {lista.map((c) => (
              <TarjetaViaje key={c.offerId} candidato={c} savedLocationId={savedLocationId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FiltroPill({
  activo,
  onClick,
  etiqueta,
  cantidad,
}: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
  cantidad: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
        activo
          ? "bg-primary text-primary-foreground"
          : "border text-muted-foreground hover:bg-accent"
      )}
    >
      {etiqueta}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
          activo ? "bg-white/25 text-white" : "bg-accent text-primary"
        )}
      >
        {cantidad}
      </span>
    </button>
  );
}

function TarjetaViaje({
  candidato,
  savedLocationId,
}: {
  candidato: FeedCandidato;
  savedLocationId: string;
}) {
  const inicial = candidato.driverFirstName.charAt(0).toUpperCase();
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-bold text-primary">
            {inicial}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{candidato.driverFirstName}</div>
            <div className="text-xs text-muted-foreground">
              {ETIQUETA_DIRECCION[candidato.direction]} ·{" "}
              {formatearFechaHoraCDMX(candidato.scheduledTime)}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold leading-tight text-emerald-800">
            ~{formatearMXN(candidato.precioPasajeroMXN)}
          </div>
          <div className="text-[11px] text-muted-foreground">por el viaje</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          ~{candidato.distanceKm.toFixed(1)} km
          {candidato.duracionMinutos !== null && ` · ~${candidato.duracionMinutos} min`}
        </span>
        {candidato.vehicleDescription && (
          <span className="inline-flex items-center gap-1">
            <Car className="h-3.5 w-3.5" />
            {candidato.vehicleDescription}
          </span>
        )}
      </div>
      <UnirmeBoton driverOfferId={candidato.offerId} savedLocationId={savedLocationId} />
    </div>
  );
}
