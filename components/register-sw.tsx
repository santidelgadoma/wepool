"use client";

import { useEffect } from "react";

// Registra el service worker del app shell (ver public/sw.js) — lo único
// que hace es que WEPOOL se pueda instalar como app y cargue más rápido en
// visitas repetidas. No cachea nada de Supabase (sesión, viajes), así que no
// hay riesgo de que alguien vea un dato desactualizado por culpa de esto.
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("No se pudo registrar el service worker:", err);
    });
  }, []);

  return null;
}
