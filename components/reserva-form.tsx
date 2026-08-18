"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Car, User, Building2, Home as HomeIcon, CheckCircle2 } from "lucide-react";
import { crearOferta, type CrearOfertaState } from "@/lib/actions/reserva";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const ESTADO_INICIAL: CrearOfertaState = {};
const SELECT_CLASSNAME =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function ReservaForm({ vehiculos }: { vehiculos: Vehiculo[] }) {
  const [state, formAction] = useActionState(crearOferta, ESTADO_INICIAL);
  const [role, setRole] = useState<"pasajero" | "conductor">("pasajero");
  const [direction, setDirection] = useState<"ida" | "regreso">("ida");
  const [vehicleChoice, setVehicleChoice] = useState<string>(vehiculos[0]?.id ?? "nuevo");

  const manana = fechaDeMananaCDMX();
  const errores = state.fieldErrors ?? {};

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
            />
            {errores.homeAddress && (
              <p className="text-sm text-destructive">{errores.homeAddress}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduledTime">Hora del viaje (mañana)</Label>
            <Input
              id="scheduledTime"
              name="scheduledTime"
              type="datetime-local"
              min={`${manana}T00:00`}
              max={`${manana}T23:59`}
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
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="usesTollRoads" value="true" required />
                    Sí
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="usesTollRoads" value="false" required />
                    No
                  </label>
                </div>
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
