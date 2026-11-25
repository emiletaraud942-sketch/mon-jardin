// PermaJardin, présentation 45 s : fonction pure du temps. Plan : docs/shotlist.md. Écrans = vraies captures de l'appli.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, springU, SPRING, wobble, font, layout, glyph, text, fill, cover, rrect, clamp } = M;

const C = { ink: '#14231a', paper: '#f3f6ee', accentDark: '#9fd38a', accentLight: '#1d4a32', mute: '#b9c9bb', muteLight: '#4b5d51' };
const DISPLAY = 'Display', UI = 'UI';

// Scènes (en temps) : a..b. dark = fond vert profond, sinon crème.
const SCENES = [
  { a: 8, b: 20, dark: false, phones: ['accueil'], lines: ['Trois gestes.', 'Un seul écran.'], sub: 'Consommer · Entretenir · Cultiver', focus: [[8, [0.5, 0.4, 1]], [14, [0.5, 0.55, 1.3]]] },
  { a: 20, b: 32, dark: true, phones: ['cultiver', 'ouplanter'], lines: ['Le bon endroit,', 'selon le soleil.'], sub: 'Soleil, pente, humidité : l’appli calcule.', focus: [[20, [0.5, 0.3, 1]], [26, [0.5, 0.5, 1.5]]] },
  { a: 32, b: 44, dark: false, phones: ['carte'], lines: ['Chaque plante,', 'au mètre près.'], sub: 'Placez, déplacez, mesurez les distances.', focus: [[32, [0.5, 0.45, 1]], [38, [0.5, 0.5, 1.6]]] },
  { a: 44, b: 56, dark: true, phones: ['afaire'], lines: ['Quand tailler,', 'arroser, récolter.'], sub: 'Les tâches de la semaine, selon la météo.', focus: [[44, [0.5, 0.2, 1]], [50, [0.5, 0.45, 1.3]]] },
  { a: 56, b: 68, dark: false, phones: ['jardinons', 'collectif'], lines: ['Pensé pour les', 'jardins de la Métropole.'], sub: 'Rendez-vous Jardinons !, jardin collectif, bilan des gestes.', focus: [[56, [0.5, 0.2, 1]], [62, [0.5, 0.4, 1.3]]] },
  { a: 68, b: 78, dark: true, phones: ['sachet'], lines: ['Un sachet. Une photo.', 'C’est rempli.'], sub: 'Lecture sur le téléphone, rien ne part.', focus: [[68, [0.5, 0.4, 1]], [73, [0.5, 0.5, 1.4]]] },
];
const HITS = [
  [0, 'mot 1', 'impact'], [1, 'mot 2', 'pop', { pitch: 'A5' }], [2.5, 'mot 3', 'pop', { pitch: 'D6' }], [4, 'mot 4', 'pop', { pitch: 'F#5' }],
  ...SCENES.flatMap((s) => [[s.a - 0.5, 'whoosh', 'whoosh', { len: 0.45 }], [s.a, 'téléphone', 'thud'], [s.a + 1, 'titre', 'pop', { pitch: 'A5' }], [s.a + 2, 'phrase', 'tick']]),
  [78, 'carte finale', 'impact'], [79, 'logo', 'bell', { pitch: 'D6' }], [82, 'ligne', 'pop', { pitch: 'A5' }],
];

const bgOf = (dark) => (dark ? C.ink : C.paper);
const fg = (dark) => (dark ? '#f3f6ee' : C.ink);
const acc = (dark) => (dark ? C.accentDark : C.accentLight);
const mu = (dark) => (dark ? C.mute : C.muteLight);

// Un téléphone (cadre + vraie capture), centré en (cx, cy), de hauteur h.
function phone(ctx, img, cx, cy, h, { fx = 0.5, fy = 0.5, zoom = 1, alpha = 1, rot = 0 } = {}) {
  if (!img) return;
  const w = h * 0.4615, bez = h * 0.018;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = h * 0.06; ctx.shadowOffsetY = h * 0.025;
  rrect(ctx, -w / 2 - bez, -h / 2 - bez, w + bez * 2, h + bez * 2, h * 0.075); ctx.fillStyle = '#0c1410'; ctx.fill();
  ctx.shadowColor = 'transparent';
  cover(ctx, img, -w / 2, -h / 2, w, h, { fx, fy, zoom, radius: h * 0.062 });
  ctx.restore();
}

function sceneText(ctx, s, u) {
  const sz = FORMAT.safe;
  const size = FORMAT.pick({ '16x9': 150, '9x16': 150, '1x1': 100 });
  const f = font(size, 600, DISPLAY), track = -0.01 * size;
  const x0 = FORMAT.portrait ? sz.x : sz.x + 20;
  const y0 = FORMAT.portrait ? sz.y + 40 : H * 0.36;
  s.lines.forEach((ln, i) => {
    const L = layout(ctx, ln, f, track);
    const fit = Math.min(1, (FORMAT.portrait ? sz.w : sz.w * (s.phones.length > 1 ? 0.5 : 0.52)) / L.width);
    const ff = fit < 1 ? font(size * fit, 600, DISPLAY) : f;
    const LL = fit < 1 ? layout(ctx, ln, ff, track * fit) : L;
    LL.glyphs.forEach((g, j) => {
      const k = springU(u, s.a + 0.05 + i * 0.4 + j * 0.02, SPRING.bouncy);
      if (k <= 0) return;
      glyph(ctx, g.ch, x0 + g.cx, y0 + i * size * fit * 1.02 + (1 - k) * 90, ff, i === s.lines.length - 1 ? acc(s.dark) : fg(s.dark), k, k);
    });
  });
  const p = E.outQuint(prog(u, s.a + 1.5, s.a + 2.2));
  if (p > 0) {
    ctx.save(); ctx.globalAlpha = p;
    const sf = FORMAT.pick({ '16x9': 50, '9x16': 48, '1x1': 38 });
    wrap(ctx, s.sub, x0, y0 + s.lines.length * size * 1.02 + 40 + (1 - p) * 30, FORMAT.portrait ? sz.w : sz.w * 0.46, sf * 1.35, font(sf, 450, UI), mu(s.dark));
    ctx.restore();
  }
}
function wrap(ctx, str, x, y, maxW, lh, f, color) {
  ctx.font = f; ctx.fillStyle = color; ctx.textAlign = 'left';
  let line = '', yy = y;
  for (const w of str.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t;
  }
  ctx.fillText(line, x, yy);
}

function sceneBody(ctx, s, u, IMG) {
  fill(ctx, bgOf(s.dark));
  // grandes feuilles discrètes
  sceneText(ctx, s, u);
  const sz = FORMAT.safe;
  const n = s.phones.length;
  const ph = FORMAT.portrait ? H * (n > 1 ? 0.47 : 0.64) : Math.min(sz.h * 1.0, H * 0.86) * (n > 1 ? 0.92 : 1.12);
  const slots = FORMAT.portrait
    ? s.phones.map((_, i) => [sz.x + sz.w * (n > 1 ? (i === 0 ? 0.27 : 0.75) : 0.5), sz.y + 560 + ph / 2])
    : s.phones.map((_, i) => [sz.x + sz.w * (n > 1 ? (i === 0 ? 0.70 : 0.91) : 0.80), H * (n > 1 && i === 1 ? 0.56 : 0.52)]);
  const exit = E.inCubic(prog(u, s.b - 0.5, s.b));
  s.phones.forEach((name, i) => {
    const k = springU(u, s.a - 0.3 + i * 0.3, SPRING.gentle);
    const [bx, by] = slots[i];
    const hh = ph * (n > 1 ? 0.92 : 1);
    const x = bx + (1 - k) * W * 0.3 - exit * W * 0.9;
    const y = by + (1 - Math.min(k, 1)) * 140;
    const [fx, fy, z] = (() => { const ks = s.focus; let cur = ks[0][1]; for (let j = 0; j < ks.length; j++) { const p = springU(u, ks[j][0], SPRING.gentle); if (j > 0) cur = cur.map((v, q) => lerp(v, ks[j][1][q], clamp(p))); } return cur; })();
    const q = 0.015 * wobble(u - s.a, 2.4, 6);
    ctx.save(); ctx.translate(x, y + hh / 2); ctx.scale(1 + q, 1 - q); ctx.translate(-x, -y - hh / 2);
    // la capture reste entière dans le téléphone, le zoom se fait sur le contenu (fy)
    phone(ctx, IMG[name], x, y, hh, { fx: 0.5, fy: i === 0 ? fy : 0.35, zoom: i === 0 ? z : 1 });
    ctx.restore();
  });
}

function sceneHook(ctx, u, IMG) {
  fill(ctx, C.ink);
  const sz = FORMAT.safe;
  // la feuille de chêne entre en glissant
  const k = springU(u, 0.2, SPRING.gentle);
  const img = IMG.chene;
  if (img) {
    const hh = FORMAT.pick({ '16x9': H * 1.0, '9x16': H * 0.5, '1x1': H * 0.8 });
    const ww = hh * (img.width / img.height);
    const x = FORMAT.portrait ? W / 2 : W * 0.78, y = FORMAT.portrait ? H * 0.74 : H * 0.52;
    ctx.save(); ctx.translate(x + (1 - k) * 300, y); ctx.rotate((1 - k) * 0.5 + 0.06 * Math.sin(u * 0.4));
    ctx.drawImage(img, -ww / 2, -hh / 2, ww, hh); ctx.restore();
  }
  const words = ['Un jardin', 'qui se cultive', 'à plusieurs.'];
  const size = FORMAT.pick({ '16x9': 150, '9x16': 150, '1x1': 130 });
  const f = font(size, 600, DISPLAY);
  const x0 = FORMAT.portrait ? sz.x : sz.x + 20;
  const y0 = FORMAT.portrait ? sz.y + 130 : H * 0.34;
  const exit = E.inBack(prog(u, 7.4, 7.9), 1.3);
  words.forEach((w, i) => {
    const fit = Math.min(1, (FORMAT.portrait ? sz.w : sz.w * 0.62) / layout(ctx, w, f, 0).width);
    const ff = font(size * fit, 600, DISPLAY);
    const L = layout(ctx, w, ff, -0.01 * size * fit);
    const t0 = [0, 1, 2.5][i];
    L.glyphs.forEach((g, j) => {
      const kk = springU(u, t0 - (i === 0 ? 0.25 : 0) + j * 0.025, SPRING.bouncy);
      if (kk <= 0) return;
      glyph(ctx, g.ch, x0 + g.cx - exit * W, y0 + i * size * fit * 1.05 + (1 - kk) * 150, ff, i === 2 ? C.accentDark : '#f3f6ee', kk, kk);
    });
  });
  const p = E.outQuint(prog(u, 4, 4.8)) * (1 - exit);
  if (p > 0) { ctx.save(); ctx.globalAlpha = p; text(ctx, 'PermaJardin, l’appli gratuite pour jardiner mieux.', x0, y0 + 3 * size * 1.05 + 20 + (1 - p) * 30, font(FORMAT.pick({ '16x9': 44, '9x16': 46 }), 450, UI), C.mute); ctx.restore(); }
}

function sceneEnd(ctx, u, IMG) {
  fill(ctx, C.ink);
  const sz = FORMAT.safe;
  const size = FORMAT.pick({ '16x9': 200, '9x16': 190, '1x1': 170 });
  const f = font(size, 600, DISPLAY);
  const fit = Math.min(1, sz.w / layout(ctx, 'PermaJardin', f, 0).width);
  const ff = font(size * fit, 600, DISPLAY);
  const L = layout(ctx, 'PermaJardin', ff, -0.02 * size * fit);
  const base = FORMAT.portrait ? sz.y + sz.h * 0.5 : H * 0.5;
  const x0 = FORMAT.portrait ? sz.x : (W - L.width) / 2;
  L.glyphs.forEach((g, j) => {
    const p = E.outBack(prog(u, 77.7 + j * 0.05, 78.4 + j * 0.05), 1.5);
    if (p <= 0) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, base + L.desc + 8); ctx.clip();
    glyph(ctx, g.ch, x0 + g.cx, base + (1 - p) * (L.asc + 60), ff, j >= 5 ? C.accentDark : '#f3f6ee');
    ctx.restore();
  });
  const lines = ['Gratuit.', 'Vos données restent sur votre téléphone.', 'Sans produit, pour un jardin vivant.'];
  lines.forEach((t, i) => {
    const p = E.outQuint(prog(u, 80 + i * 1.2, 80.8 + i * 1.2));
    if (p <= 0) return;
    ctx.save(); ctx.globalAlpha = p;
    const fs = FORMAT.pick({ '16x9': 46, '9x16': 44, '1x1': 40 });
    ctx.font = font(fs, 450, UI);
    const tx = FORMAT.portrait ? sz.x : (W - ctx.measureText(t).width) / 2;
    text(ctx, t, tx, base + 140 + i * fs * 1.5 + (1 - p) * 30, font(fs, 450, UI), i === 0 ? C.accentDark : C.mute);
    ctx.restore();
  });
}

M.film({
  fonts: [font(100, 600, DISPLAY), font(40, 450, UI)],
  images: { chene: 'assets/feuille.webp', accueil: 'assets/shots/01-feuille.png', cultiver: 'assets/shots/02-cultiver.png', ouplanter: 'assets/shots/05-ou-planter.png', carte: 'assets/shots/07-carte.png', afaire: 'assets/shots/06-afaire.png', jardinons: 'assets/shots/08-jardinons.png', collectif: 'assets/shots/10-collectif.png', sachet: 'assets/shots/09-sachet.png' },
  hits: HITS,
  draw(ctx, u, t, IMG) {
    const scene = SCENES.find((s) => u >= s.a && u < s.b);
    if (u < 8) sceneHook(ctx, u, IMG);
    else if (scene) sceneBody(ctx, scene, u, IMG);
    else sceneEnd(ctx, u, IMG);
  },
});
