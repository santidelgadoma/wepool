import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carpool ITAM",
  description: "Comparte tu viaje al ITAM con la comunidad universitaria",
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
      </body>
    </html>
  );
}
