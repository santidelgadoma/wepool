import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { AppNav } from "@/components/app-nav";

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

  // Nombre de la institución del usuario, para el branding del header — el
  // producto es institucional (ver PROGRESS.md, "Modelo de negocio / pitch"),
  // así que el header debe reflejar de qué comunidad es cada quien, no solo
  // mostrar el nombre de una sola institución fijo.
  const { data: profile } = await supabase
    .from("profiles")
    .select("institutions(name)")
    .eq("id", user.id)
    .single();

  const institucion = Array.isArray(profile?.institutions)
    ? profile?.institutions[0]?.name
    : (profile?.institutions as { name: string } | null)?.name;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex max-w-4xl flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/home" className="flex items-center gap-2 font-semibold">
              {/* eslint-disable-next-line @next/next/no-img-element -- ícono
                  fijo de 28px, next/image no aporta nada aquí */}
              <img src="/logo-mascot.png" alt="" className="h-7 w-7 shrink-0" />
              <span className="whitespace-nowrap">
                WEPOOL
                {institucion && (
                  <span className="font-normal text-muted-foreground"> · {institucion}</span>
                )}
              </span>
            </Link>
            <div className="sm:hidden">
              <LogoutButton />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <AppNav />
            <div className="hidden shrink-0 sm:block">
              <LogoutButton />
            </div>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}
