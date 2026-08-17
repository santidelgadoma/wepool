import { redirect } from "next/navigation";

// La raíz del sitio no tiene contenido propio: manda a /home, y el
// middleware se encarga de rebotar a /login si no hay sesión activa.
export default function RootPage() {
  redirect("/home");
}
