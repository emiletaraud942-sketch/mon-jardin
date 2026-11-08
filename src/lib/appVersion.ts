// Version et commit du build (posés par `define` dans vite.config.ts ; absents = « inconnu »).
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue'
export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'inconnu'

/** « Version 0.1.0 (commit abc1234) ». */
export function versionLabel(version = APP_VERSION, commit = APP_COMMIT): string {
  return `Version ${version} (commit ${commit})`
}
