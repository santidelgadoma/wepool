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
