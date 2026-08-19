import Link from "next/link";
import { Home as HomeIcon, Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const OPCIONES = [
  { kind: "casa" as const, label: "Casa", icon: HomeIcon },
  { kind: "oficina" as const, label: "Oficina", icon: Building2 },
  { kind: "otro" as const, label: "Otro", icon: MapPin },
];

// Switcher de ubicación guardada para el feed del home -- set fijo de 3
// (casa/oficina/otro, decisión de producto 2026-08-18). Es un Server
// Component (solo <Link>s con querystring, sin estado de cliente) para no
// pagar el costo de un client component por algo que no necesita más
// interactividad que navegar a ?loc=<kind>.
export function LocationSwitcher({
  configuradas,
  seleccionada,
}: {
  configuradas: Set<string>;
  seleccionada: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {OPCIONES.map((opcion) => {
        const activa = seleccionada === opcion.kind;
        const Icon = opcion.icon;
        return (
          <Link
            key={opcion.kind}
            href={`/home?loc=${opcion.kind}`}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              activa
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {opcion.label}
            {!configuradas.has(opcion.kind) && (
              <span
                className={cn(
                  "text-xs",
                  activa ? "text-primary-foreground/80" : "text-muted-foreground"
                )}
              >
                (agregar)
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
