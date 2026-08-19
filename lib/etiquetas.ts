// Etiquetas compartidas para mostrar los enums de la base de datos en
// español, en las distintas pantallas (reserva, cancelar, historial, mañana).

export const ETIQUETA_DIRECCION: Record<"ida" | "regreso", string> = {
  ida: "Ida",
  regreso: "Regreso",
};

export const ETIQUETA_ROL: Record<"conductor" | "pasajero", string> = {
  conductor: "Conductor",
  pasajero: "Pasajero",
};

export const ETIQUETA_STATUS_CONFIRMADO: Record<
  "programado" | "completado" | "cancelado",
  string
> = {
  programado: "Programado",
  completado: "Completado",
  cancelado: "Cancelado",
};

// Set fijo de ubicaciones guardadas para el feed del home (ver
// supabase/migrations/0006_saved_locations.sql) -- decisión de producto del
// 2026-08-18, no son configurables por el usuario más allá de la dirección.
export const ETIQUETA_UBICACION: Record<"casa" | "oficina" | "otro", string> = {
  casa: "Casa",
  oficina: "Oficina",
  otro: "Otro",
};
