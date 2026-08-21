"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, XCircle, Search, History, Sunrise } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/reserva", label: "Reservar", icon: PlusCircle },
  { href: "/consultar", label: "Consultar", icon: Search },
  { href: "/manana", label: "Mañana", icon: Sunrise },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/cancelar", label: "Cancelar", icon: XCircle },
];

// Nav con estado activo — vive en su propio client component porque
// AppLayout es un server component (necesita usePathname, que es un hook de
// cliente). En pantallas angostas se vuelve una fila con scroll horizontal
// en vez de encimarse o partirse en varias líneas.
export function AppNav() {
  const pathname = usePathname();

  return (
    <div className="flex w-full gap-1 overflow-x-auto sm:w-auto sm:flex-wrap sm:overflow-visible">
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
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
