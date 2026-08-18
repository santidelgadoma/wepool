export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- logo estático
          fijo, next/image no aporta nada en una pantalla de un solo uso */}
      <img src="/logo-lockup.png" alt="WEPOOL" className="h-16 w-auto" />
      {children}
    </div>
  );
}
