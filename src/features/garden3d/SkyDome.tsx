// Ciel en dégradé : un dôme léger (≈ 400 triangles) qui suit la caméra. Zénith bleu, horizon clair et chaud selon l'heure,
// halo doux autour du soleil. Se fond dans la brume (même couleur d'horizon) : pas de ligne d'horizon abrupte.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { SunState } from './sun'

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uGlow;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  float t = pow(smoothstep(0.0, 0.75, h), 0.65);
  vec3 col = mix(uHorizon, uTop, t);
  float s = max(dot(normalize(vDir), uSunDir), 0.0);
  col += uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.35) * uGlow;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function SkyDome({ sun }: { sun: SunState }) {
  const invalidate = useThree((s) => s.invalidate)
  const dome = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 20, 10), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color() },
          uGlow: { value: 1 },
        },
      }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useEffect(() => {
    const u = material.uniforms
    u.uTop.value.set(sun.sky)
    u.uHorizon.value.set(sun.horizon)
    u.uSunDir.value.set(...sun.dir).normalize()
    u.uSunColor.value.set(sun.light)
    u.uGlow.value = sun.daylight * (sun.altitudeDeg > -2 ? 1 : 0)
    invalidate()
  }, [material, sun, invalidate])
  useFrame(({ camera }) => {
    const m = dome.current
    if (!m) return
    m.position.copy(camera.position)
    m.scale.setScalar(Math.max(50, camera.far * 0.8))
  })
  return <mesh ref={dome} geometry={geometry} material={material} renderOrder={-10} frustumCulled={false} raycast={() => null} />
}
