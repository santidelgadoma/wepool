"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sunrise, History, MoreHorizontal, PlusCircle, Search, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

// Los 3 destinos más frecuentes viven directo en la barra (patrón nativo de
// app, no de sitio web con 6 links de peso igual -- ver el mockup aprobado
// en Claude Design, "Después — Home"). Reservar/Consultar/Cancelar son casos
// poco frecuentes (Reservar además ya tiene su propia entrada como "Voy a
// manejar" en el home) y se agrupan detrás de "Más".
const LINKS = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/manana", label: "Mañana", icon: Sunrise },
  { href: "/historial", label: "Historial", icon: History },
];

const MAS_LINKS = [
  { href: "/reserva", label: "Publicar un viaje", icon: PlusCircle },
  { href: "/consultar", label: "Confirmar como conductor", icon: Search },
  { href: "/cancelar", label: "Cancelar un viaje", icon: XCircle },
];

// Barra de navegación inferior fija -- vive en su propio client component
// porque AppLayout es un server component (necesita usePathname, que es un
// hook de cliente). A diferencia de la barra superior anterior, esta no
// depende de position:sticky para quedarse visible: AppLayout la renderiza
// como el último elemento de una columna flex de altura fija
// (`h-[100dvh] overflow-hidden`), así que queda genuinamente fija sin
// importar cuánto scroll haga el contenido de arriba.
export function AppNav() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alHacerClickFuera(evento: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alHacerClickFuera);
    return () => document.removeEventListener("mousedown", alHacerClickFuera);
  }, [abierto]);

  const masActivo = MAS_LINKS.some((link) => link.href === pathname);

  return (
    <nav className="relative flex-shrink-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {abierto && (
        <div
          ref={panelRef}
          className="absolute bottom-full left-0 right-0 mx-auto mb-2 w-full max-w-4xl px-4"
        >
          <div className="flex flex-col gap-1 rounded-xl border bg-popover p-2 shadow-lg">
            {MAS_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  id={`nav-${link.href.slice(1)}`}
                  href={link.href}
                  onClick={() => setAbierto(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  {link.label}
                </Link>
              );
            })}
            <div className="my-1 border-t" />
            <div className="px-1">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-4xl">
        {LINKS.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              id={`nav-${link.href.slice(1)}`}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {link.label}
            </Link>
          );
        })}
        <button
          type="button"
          id="nav-mas"
          onClick={() => setAbierto((valor) => !valor)}
          aria-expanded={abierto}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors",
            abierto || masActivo ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          Más
        </button>
      </div>
    </nav>
  );
}
