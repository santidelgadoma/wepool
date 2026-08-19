"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Car,
  User,
  Building2,
  Home as HomeIcon,
  CheckCircle2,
  XCircle,
  Wallet,
} from "lucide-react";
import {
  crearOferta,
  previsualizarDireccion,
  type CrearOfertaState,
  type PreviewDireccion,
} from "@/lib/actions/reserva";
import { formatearMXN } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { fechaDeMananaCDMX } from "@/lib/datetime";

type Vehiculo = { id: string; plate: string; description: string };
type Campus = { lat: number; lng: number } | null;

const ESTADO_INICIAL: CrearOfertaState = {};
const SELECT_CLASSNAME =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
// Hora de salida más común entre la comunidad ITAM (ver scripts/seed.ts,
// donde la mayoría de los viajes de ida son 07:30-08:10) — arrancar el campo
// aquí en vez de vacío ahorra un scroll/tecleo en el caso más común, sin
// impedir cambiarla.
const HORA_POR_DEFECTO = "07:30";

export function ReservaForm({
  vehiculos,
  campus,
}: {
  vehiculos: Vehiculo[];
  campus: Campus;
}) {
  const [state, formAction] = useActionState(crearOferta, ESTADO_INICIAL);
  // Antes arrancaba en "pasajero". Ahora que el home tiene su propio flujo
  // dedicado a pasajeros (el feed, ver app/(app)/home/page.tsx), el único
  // camino de entrada normal a /reserva es el botón "Voy a manejar" del
  // home — así que el default correcto es "conductor". El toggle sigue
  // aquí como respaldo manual (p.ej. reservarse como pasajero sin pasar por
  // el feed), no se quitó nada, solo cambió qué opción parte seleccionada.
  const [role, setRole] = useState<"pasajero" | "conductor">("conductor");
  const [direction, setDirection] = useState<"ida" | "regreso">("ida");
  const [vehicleChoice, setVehicleChoice] = useState<string>(vehiculos[0]?.id ?? "nuevo");
  const [tollRoads, setTollRoads] = useState<"true" | "false" | undefined>(undefined);

  const [homeAddress, setHomeAddress] = useState("");
  const [preview, setPreview] = useState<PreviewDireccion | null>(null);
  const [previewedFor, setPreviewedFor] = useState<string | null>(null);
  const [checkingAddress, setCheckingAddress] = useState(false);

  const manana = fechaDeMananaCDMX();
  const errores = state.fieldErrors ?? {};

  const direccionLimpia = homeAddress.trim();
  const addressStatus: "idle" | "checking" | "ok" | "error" = checkingAddress
    ? "checking"
    : preview && previewedFor === direccionLimpia
      ? preview.ok
        ? "ok"
        : "error"
      : "idle";

  async function handleAddressBlur() {
    const direccion = homeAddress.trim();
    if (direccion.length < 5 || direccion === previewedFor) return;
    setCheckingAddress(true);
    try {
      const resultado = await previsualizarDireccion(direccion, campus);
      setPreview(resultado);
      setPreviewedFor(direccion);
    } finally {
      setCheckingAddress(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Detalles del viaje</CardTitle>
        <CardDescription>Todos los viajes se organizan para mañana ({manana}).</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>¿Cómo participas?</Label>
            <div className="flex gap-2">
              {(["pasajero", "conductor"] as const).map((opcion) => (
                <Button
                  key={opcion}
                  type="button"
                  variant={role === opcion ? "default" : "outline"}
                  onClick={() => setRole(opcion)}
                >
                  {opcion === "pasajero" ? (
                    <User className="mr-2 h-4 w-4" />
                  ) : (
                    <Car className="mr-2 h-4 w-4" />
                  )}
                  {opcion === "pasajero" ? "Pasajero" : "Conductor"}
                </Button>
              ))}
            </div>
            <input type="hidden" name="role" value={role} />
          </div>

          <div className="space-y-2">
            <Label>Dirección del viaje</Label>
            <div className="flex gap-2">
              {(["ida", "regreso"] as const).map((opcion) => (
                <Button
                  key={opcion}
                  type="button"
                  variant={direction === opcion ? "default" : "outline"}
                  onClick={() => setDirection(opcion)}
                >
                  {opcion === "ida" ? (
                    <Building2 className="mr-2 h-4 w-4" />
                  ) : (
                    <HomeIcon className="mr-2 h-4 w-4" />
                  )}
                  {opcion === "ida" ? "Ida al ITAM" : "Regreso del ITAM"}
                </Button>
              ))}
            </div>
            <input type="hidden" name="direction" value={direction} />
            <p className="text-xs text-muted-foreground">
              {direction === "ida"
                ? "El ITAM es el destino fijo. La dirección de abajo es de dónde sales."
                : "El ITAM es el origen fijo. La dirección de abajo es a dónde llegas."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="homeAddress">
              {direction === "ida" ? "Dirección de origen" : "Dirección de destino"}
            </Label>
            <Input
              id="homeAddress"
              name="homeAddress"
              placeholder="Calle, colonia, alcaldía o municipio, ciudad"
              required
              value={homeAddress}
              onChange={(e) => setHomeAddress(e.target.value)}
              onBlur={handleAddressBlur}
            />
            {errores.homeAddress && (
              <p className="text-sm text-destructive">{errores.homeAddress}</p>
            )}

            {addressStatus === "checking" && (
              <p className="text-xs text-muted-foreground">Verificando dirección…</p>
            )}

            {addressStatus === "error" && preview && !preview.ok && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {preview.error}
              </p>
            )}

            {addressStatus === "ok" && preview?.ok && (
              <div className="space-y-2">
                <div className="flex items-start gap-1.5 rounded-md border border-emerald-600/20 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{preview.displayName}</span>
                </div>
                {preview.precioPasajeroMXN !== undefined &&
                  preview.gananciaConductorMXN !== undefined && (
                    <div className="space-y-1">
                      <Badge variant="success" className="w-fit">
                        <Wallet className="h-3 w-3" />
                        {role === "conductor"
                          ? `Ganarías ~${formatearMXN(preview.gananciaConductorMXN)}`
                          : `Pagarías ~${formatearMXN(preview.precioPasajeroMXN)}`}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        Estimado según la distancia a tu institución — el precio final depende
                        de con quién te empareje.
                      </p>
                    </div>
                  )}
                <input type="hidden" name="previewLat" value={preview.lat} />
                <input type="hidden" name="previewLng" value={preview.lng} />
                <input type="hidden" name="previewFor" value={previewedFor ?? ""} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduledTime">Hora del viaje</Label>
            <Input
              id="scheduledTime"
              name="scheduledTime"
              type="time"
              defaultValue={HORA_POR_DEFECTO}
              required
            />
            {errores.scheduledTime && (
              <p className="text-sm text-destructive">{errores.scheduledTime}</p>
            )}
          </div>

          {role === "conductor" && (
            <>
              <div className="space-y-2">
                <Label>Vehículo</Label>
                {vehiculos.length > 0 && (
                  <select
                    className={SELECT_CLASSNAME}
                    value={vehicleChoice}
                    onChange={(e) => setVehicleChoice(e.target.value)}
                  >
                    {vehiculos.map((vehiculo) => (
                      <option key={vehiculo.id} value={vehiculo.id}>
                        {vehiculo.description} — {vehiculo.plate}
                      </option>
                    ))}
                    <option value="nuevo">Registrar un vehículo nuevo…</option>
                  </select>
                )}
                {vehicleChoice === "nuevo" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Input name="newVehiclePlate" placeholder="Placas" required />
                    <Input
                      name="newVehicleDescription"
                      placeholder="Marca, modelo, color"
                      required
                    />
                  </div>
                ) : (
                  <input type="hidden" name="vehicleId" value={vehicleChoice} />
                )}
                {errores.vehicleId && (
                  <p className="text-sm text-destructive">{errores.vehicleId}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>¿Usas vías de cuota?</Label>
                <div className="flex gap-2">
                  {(["true", "false"] as const).map((valor) => (
                    <Button
                      key={valor}
                      type="button"
                      size="sm"
                      variant={tollRoads === valor ? "default" : "outline"}
                      onClick={() => setTollRoads(valor)}
                    >
                      {valor === "true" ? "Sí" : "No"}
                    </Button>
                  ))}
                </div>
                {tollRoads && <input type="hidden" name="usesTollRoads" value={tollRoads} />}
                {errores.usesTollRoads && (
                  <p className="text-sm text-destructive">{errores.usesTollRoads}</p>
                )}
              </div>

              {direction === "regreso" && (
                <div className="space-y-2">
                  <Label htmlFor="meetingPoint">Punto de encuentro en el campus</Label>
                  <Input
                    id="meetingPoint"
                    name="meetingPoint"
                    placeholder="Ej. estacionamiento, entrada principal"
                    required
                  />
                  {errores.meetingPoint && (
                    <p className="text-sm text-destructive">{errores.meetingPoint}</p>
                  )}
                </div>
              )}
            </>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          {state.success && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-700">
                ¡Viaje publicado! Puedes verlo en{" "}
                <a className="underline" href="/cancelar">
                  Cancelar
                </a>{" "}
                o revisar candidatos en{" "}
                <a className="underline" href="/consultar">
                  Consultar viajes
                </a>
                .
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <BotonPublicar />
        </CardFooter>
      </form>
    </Card>
  );
}

function BotonPublicar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Publicando..." : "Publicar viaje"}
    </Button>
  );
}
