// Détail de sol pour la Promenade : texture procédurale d'herbe / terre (générée en code, répétée, sans fichier)
// multipliée sur l'orthophoto (ou sur le vert uni si elle n'a pas chargé). Inactif hors Promenade.
import * as THREE from 'three'

const SIZE = 256

/** Bruit de valeur périodique (la texture se raccorde sans couture). */
function makeNoise(cells: number, seed: number) {
  const g = new Float32Array(cells * cells)
  let a = seed >>> 0
  for (let i = 0; i < g.length; i++) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    g[i] = a / 4294967296
  }
  return (u: number, v: number) => {
    const x = u * cells
    const y = v * cells
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const at = (i: number, j: number) => g[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)]
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy
  }
}

let texture: THREE.CanvasTexture | null = null

/** Texture neutre (moyenne ≈ 0,5 → multiplicateur 1 une fois doublée) : brins d'herbe, plaques de terre, grain. */
export function grassDetailTexture(): THREE.CanvasTexture {
  if (texture) return texture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const n1 = makeNoise(6, 11)
    const n2 = makeNoise(16, 23)
    const n3 = makeNoise(40, 37)
    const dirt = makeNoise(5, 91)
    const img = ctx.createImageData(SIZE, SIZE)
    let r = 12345
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const u = x / SIZE
        const v = y / SIZE
        const n = 0.5 * n1(u, v) + 0.3 * n2(u, v) + 0.2 * n3(u, v)
        r = (Math.imul(r, 1103515245) + 12345) >>> 0
        const grain = (r / 4294967296 - 0.5) * 0.1
        const lum = 0.5 + (n - 0.5) * 0.3 + grain
        const t = Math.min(1, Math.max(0, (dirt(u, v) - 0.6) / 0.18)) // plaques de terre nue
        const i = (y * SIZE + x) * 4
        img.data[i] = Math.min(255, (lum * (1 + 0.16 * t)) * 255)
        img.data[i + 1] = Math.min(255, (lum * (1 - 0.04 * t)) * 255)
        img.data[i + 2] = Math.min(255, (lum * (1 - 0.2 * t)) * 255)
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    // Brins d'herbe : petits traits clairs et sombres, dessinés aussi de l'autre côté du bord pour raccorder.
    let s = 777
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 4294967296
    }
    ctx.lineCap = 'round'
    for (let i = 0; i < 1800; i++) {
      const x = rnd() * SIZE
      const y = rnd() * SIZE
      const len = 3 + rnd() * 7
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.1
      const light = rnd() > 0.5
      ctx.strokeStyle = light ? `rgba(165,190,115,${0.18 + rnd() * 0.2})` : `rgba(55,70,40,${0.2 + rnd() * 0.25})`
      ctx.lineWidth = 0.8 + rnd() * 0.9
      for (const ox of [-SIZE, 0, SIZE]) {
        for (const oy of [-SIZE, 0, SIZE]) {
          const x0 = x + ox
          const y0 = y + oy
          if (x0 < -12 || x0 > SIZE + 12 || y0 < -12 || y0 > SIZE + 12) continue
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len)
          ctx.stroke()
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace // valeurs brutes : c'est un multiplicateur, pas une couleur
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  texture = t
  return t
}

/** Libère la texture d'herbe (au démontage de la vue 3D) ; elle est régénérée au prochain besoin. */
export function disposeGrassDetailTexture(): void {
  texture?.dispose()
  texture = null
}

export interface GroundDetail {
  uniforms: { uDetail: { value: THREE.Texture }; uWalk: { value: number }; uNoise: { value: number } }
  onBeforeCompile: (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) => void
  cacheKey: () => string
}

/** Uniformes partagés + injection GLSL pour un MeshStandardMaterial. `uWalk` = 1 active le détail. */
export function createGroundDetail(): GroundDetail {
  const uniforms = { uDetail: { value: grassDetailTexture() as THREE.Texture }, uWalk: { value: 0 }, uNoise: { value: 1 } }
  return {
    uniforms,
    cacheKey: () => 'g3d-ground-detail-v2',
    onBeforeCompile: (shader) => {
      shader.uniforms.uDetail = uniforms.uDetail
      shader.uniforms.uWalk = uniforms.uWalk
      shader.uniforms.uNoise = uniforms.uNoise
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vDetailXZ;\nvarying float vDetailDist;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvDetailXZ = (modelMatrix * vec4(transformed, 1.0)).xz;\nvDetailDist = -mvPosition.z;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform float uWalk;\nuniform float uNoise;\nvarying vec2 vDetailXZ;\nvarying float vDetailDist;\nfloat pjHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat pjNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(pjHash(i), pjHash(i + vec2(1.0, 0.0)), f.x), mix(pjHash(i + vec2(0.0, 1.0)), pjHash(i + vec2(1.0, 1.0)), f.x), f.y); }')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
{
  // Herbe moins uniforme : grandes plaques plus vertes ou plus sèches (bruit procédural, sans texture).
  float pn = pjNoise(vDetailXZ * 0.05) * 0.6 + pjNoise(vDetailXZ * 0.19 + 7.3) * 0.3 + pjNoise(vDetailXZ * 0.7 + 3.1) * 0.1 - 0.5;
  vec3 patch = mix(vec3(0.9, 1.0, 0.88), vec3(1.1, 1.05, 0.8), smoothstep(-0.14, 0.14, pn));
  diffuseColor.rgb *= mix(vec3(1.0), patch, uNoise);
}
if (uWalk > 0.5) {
  float far = 1.0 - smoothstep(20.0, 70.0, vDetailDist);
  float near = 1.0 - smoothstep(4.0, 14.0, vDetailDist);
  vec3 a = texture2D(uDetail, vDetailXZ * 0.62).rgb * 2.0;
  vec3 b = texture2D(uDetail, vDetailXZ * 0.083 + 0.37).rgb * 2.0;
  vec3 c = texture2D(uDetail, vDetailXZ * 2.7 + 0.11).rgb * 2.0;
  vec3 m = a * b * mix(vec3(1.0), c, near);
  diffuseColor.rgb *= mix(vec3(1.0), clamp(m, 0.0, 1.8), far);
}`,
        )
    },
  }
}
