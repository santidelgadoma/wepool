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
