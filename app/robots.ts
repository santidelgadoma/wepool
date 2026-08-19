import type { MetadataRoute } from "next";

// Complementa metadata.robots en app/layout.tsx (que aplica por página vía
// meta tag) con el archivo /robots.txt tradicional que revisan los
// crawlers antes de rastrear nada. Mientras WEPOOL no esté listo para
// mostrarse públicamente (ver PROGRESS.md, "Candado temporal de acceso"),
// ninguno de los dos reemplaza el candado de contraseña en middleware.ts —
// solo evitan que el sitio aparezca en buscadores mientras tanto. Quitar
// (o cambiar allow a "/") cuando el producto esté listo para ser público.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
