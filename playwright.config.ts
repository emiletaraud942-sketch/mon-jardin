import { defineConfig, devices } from '@playwright/test'

// Test de bout en bout (smoke) : `npm run build` puis `npm run e2e`. Le site est servi par `vite preview` sur un port fixe non standard.
// Aucun accès à Internet : tous les appels réseau sont simulés dans e2e/mocks.ts.
// PW_CHROMIUM_PATH : chemin d'un Chromium déjà installé (utile hors CI) ; sinon Playwright utilise le sien (`npx playwright install chromium`).
const PORT = Number(process.env.E2E_PORT ?? 4793)
const executablePath = process.env.PW_CHROMIUM_PATH || undefined
// MapLibre exige WebGL 2 : rendu logiciel (SwiftShader) quand il n'y a pas de GPU, comme sur un serveur d'intégration.
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath, args },
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions: { executablePath, args } } },
    { name: 'bureau-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
