import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: "WEPOOL",
  description: "Carpool institucional: conecta a tu comunidad y gana dinero compartiendo el viaje que ya hacías",
  // El manifest en sí (app/manifest.ts) ya se sirve solo en
  // /manifest.webmanifest y Next.js agrega el <link rel="manifest"> solo —
  // no hace falta repetirlo aquí.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WEPOOL",
  },
  // Mientras el producto no esté listo para mostrarse públicamente (ver
  // PROGRESS.md, "Candado temporal de acceso") — junto con app/robots.ts,
  // esto le pide a los buscadores que no indexen ni seguido enlaces del
  // sitio. No reemplaza el candado de contraseña (alguien con el link
  // directo lo puede seguir abriendo), solo evita que aparezca en
  // resultados de búsqueda mientras tanto. Quitar cuando el producto esté
  // listo para ser público.
  robots: {
    index: false,
    follow: false,
  },
};

// Next.js separó `themeColor` de `metadata` a `viewport` desde la v14 — si
// se deja dentro de `metadata` como antes, emite un warning y no lo aplica.
export const viewport: Viewport = {
  themeColor: "#3358ff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
