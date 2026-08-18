// El cliente de Supabase resuelve una relación embebida (`institutions(name)`)
// como objeto, como arreglo de un objeto, o —cuando no puede inferir bien la
// relación— con un tipo especial de error de su generador de tipos. Esos tres
// casos no son compatibles entre sí para TypeScript, así que castear directo
// a `{ name: string } | null` falla la verificación de "overlap" del
// compilador (`next build` sí corre `tsc`, aunque este entorno de trabajo no
// pudiera — ver PROGRESS.md). Esta función normaliza los tres casos en un
// solo lugar, con checks en tiempo de ejecución en vez de un cast inseguro.
export function nombreInstitucion(institutions: unknown): string | undefined {
  const value = Array.isArray(institutions) ? institutions[0] : institutions;
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}
