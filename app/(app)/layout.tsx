import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

const links = [
  { href: "/home", label: "Inicio" },
  { href: "/reserva", label: "Reservar" },
  { href: "/cancelar", label: "Cancelar" },
  { href: "/consultar", label: "Consultar viajes" },
  { href: "/historial", label: "Historial" },
  { href: "/manana", label: "Mañana" },
];

// El middleware ya rebota a /login si no hay sesión, pero se vuelve a
// verificar aquí (defensa en profundidad) para que este layout nunca
// renderice contenido protegido sin usuario.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 p-4">
          <span className="font-semibold">Carpool ITAM</span>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <LogoutButton />
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}
