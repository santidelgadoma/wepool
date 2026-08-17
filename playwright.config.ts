import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Carga .env.local a mano (sin agregar la dependencia "dotenv") para que los
// tests tengan acceso a NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// y sobre todo SUPABASE_SERVICE_ROLE_KEY, que e2e/global-setup.ts necesita
// para crear los usuarios de prueba sin pasar por el flujo de correo.
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const linea of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    const valor = limpia.slice(igual + 1).trim();
    if (clave && !(clave in process.env)) process.env[clave] = valor;
  }
}

loadEnvLocal();

// Por default corre contra un `npm run dev` local. Para correr contra el
// deploy real de Vercel (protegiendo la demo end-to-end), exporta
// PLAYWRIGHT_BASE_URL=https://<tu-dominio>.vercel.app antes de correr los
// tests — en ese caso Playwright NO intenta levantar un servidor local.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Usa el Google Chrome ya instalado en la máquina (channel: "chrome")
      // en vez del Chromium que Playwright descarga por su cuenta. Desde
      // hace un tiempo Playwright solo publica binarios de Chromium para
      // macOS 14+; en macOS más viejo `npx playwright install chromium`
      // falla con "Playwright does not support chromium on macXX". Usando
      // el canal de Chrome no hace falta descargar nada — solo tener Chrome
      // instalado, que cualquier máquina con Claude en Chrome ya tiene.
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
