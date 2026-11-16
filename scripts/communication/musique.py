"""Musique douce de 30 s, synthétisée (numpy -> wav), sans droits d'auteur : nappes d'accords + petites notes pincées.
Normalisée vers -16 LUFS (mesure ffmpeg ebur128), pic réel < -1 dBFS.
Usage : python3 musique.py sortie.wav"""
import sys, re, subprocess, wave
import numpy as np

SR, DUR = 44100, 30.0
n = int(SR * DUR); t = np.arange(n) / SR
rng = np.random.default_rng(3)
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)
# Do maj7 - La m7 - Fa maj7 - Sol 6, deux fois (3,75 s par accord)
ACC = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 64]] * 2
L = np.zeros(n); R = np.zeros(n)

def env(length, a, r):
    e = np.ones(length); na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) ** 2; e[-nr:] = np.minimum(e[-nr:], np.linspace(1, 0, nr) ** 2); return e

step = DUR / len(ACC)
for i, notes in enumerate(ACC):
    s0 = int(i * step * SR); ln = int((step + 0.8) * SR); ln = min(ln, n - s0); tt = np.arange(ln) / SR
    e = env(ln, 1.0, 1.2)
    for j, m in enumerate(notes):
        f = mtof(m); pan = 0.35 + 0.3 * (j / 3)
        for det, amp in ((0.0, 1.0), (0.12, 0.6), (-0.1, 0.6)):  # léger chœur : trois sinus légèrement désaccordés
            w = amp * (np.sin(2 * np.pi * (f + det) * tt) + 0.25 * np.sin(2 * np.pi * 2 * (f + det) * tt)) * e * (0.06 if m < 50 else 0.05)
            L[s0:s0 + ln] += w * (1 - pan); R[s0:s0 + ln] += w * pan
    # petites notes pincées (une toutes les 0,625 s) sur les notes de l'accord, une octave plus haut
    for k in range(6):
        ts = s0 + int(k * 0.625 * SR); m = notes[(k * 2) % 4] + 12 + (12 if k % 3 == 2 else 0)
        pl = int(1.4 * SR); pl = min(pl, n - ts)
        if pl <= 0: continue
        tp = np.arange(pl) / SR; f = mtof(m)
        w = (np.sin(2 * np.pi * f * tp) + 0.3 * np.sin(2 * np.pi * 3 * f * tp)) * np.exp(-tp * 3.2) * np.minimum(1, tp * 400) * 0.07
        pan = 0.3 + 0.4 * ((k % 4) / 3)
        L[ts:ts + pl] += w * (1 - pan); R[ts:ts + pl] += w * pan
# fondus : entrée 1,5 s, sortie 2,5 s ; léger réverbe (échos filtrés)
fade = np.ones(n); fi, fo = int(1.5 * SR), int(2.5 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo)
for ch in (L, R):
    for d, g in ((0.19, 0.28), (0.37, 0.18), (0.61, 0.10)):
        k = int(d * SR); ch[k:] += ch[:-k].copy() * g
L *= fade; R *= fade
st = np.stack([L, R], 1)

def ecrire(x, path):
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())

def lufs(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    i = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', out)[-1]); p = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', out)[-1]); return i, p

out = sys.argv[1]; g = 1.0
for _ in range(4):
    ecrire(st * g, out); i, p = lufs(out); print(f'gain {g:.3f} : {i} LUFS, pic {p} dBFS')
    if abs(i + 16) < 0.3: break
    g *= 10 ** ((-16 - i) / 20)
assert p < -1.0, 'pic trop haut'
