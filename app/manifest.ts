import type { MetadataRoute } from "next";

// Convención de Next.js App Router: este archivo se sirve solo en
// /manifest.webmanifest y Next.js ya agrega el <link rel="manifest"> en el
// <head> automáticamente — no hace falta declararlo a mano en
// `app/layout.tsx` ni instalar ninguna librería (next-pwa y similares no se
// pudieron instalar en el entorno de trabajo por el bloqueo de npm, así que
// se optó por la convención nativa de Next.js en vez de un paquete externo).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WEPOOL — carpool institucional",
    short_name: "WEPOOL",
    description:
      "Conecta con tu comunidad y comparte el viaje que ya hacías: el conductor gana un ingreso extra, el pasajero paga menos que un viaje por app tradicional.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    // Mismo tono que --primary en app/globals.css (hsl(229 100% 60%)) —
    // si la marca cambia, cambiar en los dos lugares.
    theme_color: "#3358ff",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
