import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Test de bout en bout (smoke) : `npm run build` puis `npm run e2e`. Le site est servi par `vite preview` sur un port fixe non standard.
// Aucun accès à Internet : tous les appels réseau sont simulés dans e2e/mocks.ts.
// PW_CHROMIUM_PATH : chemin d'un Chromium déjà installé (utile hors CI) ; sinon Playwright utilise le sien (`npx playwright install chromium`).
const PORT = Number(process.env.E2E_PORT ?? 4793)
const executablePath = process.env.PW_CHROMIUM_PATH || undefined
// Second site pour l'entraide : `npm run build:e2e-entraide` le construit dans dist-entraide avec une URL et une clé FAUSSES (jamais de vrai projet), servi sur un autre port.
// Hors CI, l'étape n'existe que si ce dossier existe ; en CI, elle est toujours là (un dossier manquant fait échouer le test au lieu de le sauter en silence).
const PORT_ENTRAIDE = Number(process.env.E2E_ENTRAIDE_PORT ?? 4794)
const withEntraide = existsSync('dist-entraide') || !!process.env.CI
// Troisième site pour la copie en ligne (deux appareils simulés) : `npm run build:e2e-synchro` → dist-synchro, URL et clé FAUSSES, port 4795.
const PORT_SYNCHRO = Number(process.env.E2E_SYNCHRO_PORT ?? 4795)
const withSynchro = existsSync('dist-synchro') || !!process.env.CI
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
    { name: 'mobile-390', testIgnore: /(entraide|synchro|jardin-partage)\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions: { executablePath, args } } },
    { name: 'bureau-1280', testIgnore: /(entraide|synchro|jardin-partage)\.spec/, use: { viewport: { width: 1280, height: 800 } } },
    ...(withEntraide
      ? [
          {
            name: 'entraide-390',
            testMatch: /entraide\.spec/,
            use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, baseURL: `http://127.0.0.1:${PORT_ENTRAIDE}`, launchOptions: { executablePath, args } },
          },
        ]
      : []),
    ...(withSynchro
      ? [
          {
            name: 'synchro-390',
            testMatch: /(synchro|jardin-partage)\.spec/,
            use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, baseURL: `http://127.0.0.1:${PORT_SYNCHRO}`, launchOptions: { executablePath, args } },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    ...(withEntraide
      ? [
          {
            command: `npx vite preview --outDir dist-entraide --host 127.0.0.1 --port ${PORT_ENTRAIDE} --strictPort`,
            url: `http://127.0.0.1:${PORT_ENTRAIDE}`,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
          },
        ]
      : []),
    ...(withSynchro
      ? [
          {
            command: `npx vite preview --outDir dist-synchro --host 127.0.0.1 --port ${PORT_SYNCHRO} --strictPort`,
            url: `http://127.0.0.1:${PORT_SYNCHRO}`,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
          },
        ]
      : []),
  ],
})
