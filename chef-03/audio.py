# Música original (marimba + guitarra + bajo + percusión latina, 100 BPM) y efectos del video 01.
# Ejecutar: /root/lemo-opuscar/.venv/bin/python audio.py   (usa events.json de build.mjs)
import sys, json
sys.path.insert(0, "/root/lemo-opuscar")
import numpy as np, soundfile as sf
from core.audio import sampler as S
from core.audio import sfx as X
from core.audio.sfx import SR, add, limit

EV = json.load(open("events.json"))
TOTAL = EV["total"]
N = int(TOTAL * SR) + SR
S.seed(5)
X._rng = np.random.default_rng(9)

BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
CH = {  # acordes por compás: D  Bm  G  A
    0: ("D", ["D3", "F#3", "A3", "D4"], ["D4", "F#4", "A4", "D5", "A4", "F#4"]),
    1: ("B", ["B2", "F#3", "B3", "D4"], ["B3", "D4", "F#4", "B4", "F#4", "D4"]),
    2: ("G", ["G2", "D3", "G3", "B3"], ["G4", "B4", "D5", "G5", "D5", "B4"]),
    3: ("A", ["A2", "E3", "A3", "C#4"], ["A4", "C#5", "E5", "A5", "E5", "C#5"]),
}
BASS = {0: "D2", 1: "B1", 2: "G1", 3: "A1"}
FIFTH = {0: "A2", 1: "F#2", 2: "D2", 3: "E2"}

lines = EV["lines"]
def t_line(i): return lines[i][1], lines[i][2]
liebig = (EV["liebigIn"], EV["juiceIn"])
slam = EV["slam"]
pura = EV["stampPura"]

# Intensidad por tramo: 0 = silencio, 1 = sólo marimba/shaker, 2 = groove, 3 = completo
def level(t):
    if t >= pura: return 3
    if slam - 0.05 <= t < slam + 0.6: return 0          # la música se corta con el portazo
    if liebig[0] <= t < liebig[1]: return 1              # siglo XIX: sin batería
    if t < EV["cut"] + 1.5: return 3
    return 2

ev = []
nbars = int(np.ceil(TOTAL / BAR))
for b in range(nbars):
    t0 = b * BAR
    k = b % 4
    name, chord, arp = CH[k]
    for s in range(16):  # semicorcheas
        t = t0 + s * BEAT / 4
        if t >= TOTAL - 0.3 and t < pura: continue
        if t > pura + 0.05: continue
        L = level(t)
        if L == 0: continue
        beat_pos = s % 8  # ciclo de 2 tiempos (dembow)
        # batería / percusión
        if L >= 2:
            if s % 4 == 0: ev.append((t, "drum_kit", "kick_drum_left", None, .75 if L == 3 else .6, 0))
            if beat_pos in (3, 6): ev.append((t, "cajon", "slap", None, .7, .15))
            if s % 2 == 0: ev.append((t, "hihat", "closed", None, .35 + .1 * (s % 4 == 2), .3))
            if s in (6, 14) and L == 3: ev.append((t, "claps", "group", None, .55, -.1))
            if s in (2, 10): ev.append((t, "conga", "conga", None, .45, -.35))
            if s in (11,): ev.append((t, "conga", "quinto", None, .4, -.4))
        ev.append((t, "shaker", "down" if s % 2 == 0 else "up", None, .22 if L >= 2 else .18, .4))
        # bajo
        if L >= 2:
            if s == 0: ev.append((t, "electric_bass", BASS[k], BEAT * 0.9, .75, 0))
            if s == 6: ev.append((t, "electric_bass", BASS[k], BEAT * 0.4, .6, 0))
            if s == 8: ev.append((t, "electric_bass", FIFTH[k], BEAT * 0.9, .7, 0))
            if s == 14: ev.append((t, "electric_bass", BASS[k], BEAT * 0.4, .55, 0))
        # guitarra: rasgueo en los contratiempos
        if L >= 2 and s % 4 == 2:
            ev.append(dict(t=t, inst="guitar_nylon", pitch=chord[1], dur=BEAT * .45, vel=.5, pan=-.3))
            ev.append(dict(t=t + .012, inst="guitar_nylon", pitch=chord[2], dur=BEAT * .45, vel=.45, pan=-.3))
            ev.append(dict(t=t + .024, inst="guitar_nylon", pitch=chord[3], dur=BEAT * .45, vel=.42, pan=-.3))
        # marimba: arpegio en corcheas con repetición tipo trémolo en el último tiempo
        if s % 2 == 0:
            i = (s // 2) % len(arp)
            v = .55 if L == 1 else .5
            ev.append((t, "marimba", arp[i], BEAT * .5, v, .25))
            if L == 3 and s == 14:
                for r in range(3): ev.append((t + r * BEAT / 12, "marimba", arp[0], BEAT / 12, .4, .25))

# golpe final en "¡Pura vida!": acorde D completo y crash
ev += [(pura, "drum_kit", "crash_left", None, .7, -.2), (pura, "drum_kit", "kick_drum_left", None, .9, 0),
       (pura, "electric_bass", "D2", 2.6, .8, 0)]
for i, p in enumerate(["D4", "F#4", "A4", "D5", "F#5"]):
    ev.append((pura + i * .03, "marimba", p, 2.6, .6, .2))
    ev.append(dict(t=pura + i * .015, inst="guitar_nylon", pitch=p, dur=2.6, vel=.5, pan=-.3))
# acento en "¡Por sabor!" y en la entrada del chiste
ev += [(EV["stamp"], "drum_kit", "crash_right", None, .45, .3), (slam + 0.6, "drum_kit", "kick_drum_left", None, .8, 0)]

music = S.render(ev, dur=TOTAL + 0.5)
music = S.room(music, size=.3, mix=.12)
music = music[: int(TOTAL * SR)]

# Duck bajo la voz (−5 dB) con rampas de 80 ms
g = np.ones(len(music))
ramp = int(.08 * SR)
for _, a, b in lines:
    s, e = int((a - .05) * SR), int((b + .1) * SR)
    g[s:e] = np.minimum(g[s:e], 10 ** (-5 / 20))
from scipy.ndimage import uniform_filter1d
g = uniform_filter1d(g, ramp)
music *= g[:, None]
# nivel: RMS de la cama ≈ −27 dBFS
rms = np.sqrt(np.mean(music ** 2))
music *= 10 ** (-27 / 20) / max(rms, 1e-9)
# cola: fundido de 1.2 s al final
fade = int(1.2 * SR)
music[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
for c in range(2): music[:, c] = limit(music[:, c], .7)
sf.write("assets/music.wav", music.astype(np.float32), SR)

# ---------- efectos ----------
fx = np.zeros((int(TOTAL * SR), 2))
rng = np.random.default_rng(3)

def sizzle(d, v=1.0):
    n = X.noise(d)
    base = X.bp(n, 2500, 9000) * .35
    crack = X.hp(n, 3000) * (rng.random(len(n)) > .9985) * 6
    crack = X.lp(crack, 9000)
    e = np.minimum(1, X.t_(d) / .05) * np.minimum(1, (d - X.t_(d)) / .25)
    return X.norm(base + crack) * e * v

def chop(v=1.0):
    return X.norm(X.thump(.6, 160) * .6 + np.pad(X.clack(1.3, 1), (0, int(.26 * SR)))[: len(X.thump())]) * v

def slam_fx(v=1.0):
    th = X.thump(1, 55)
    cl = np.pad(X.clack(.6, .8), (0, len(th)))[: len(th)]
    rattle = X.bp(X.noise(.35), 1500, 5000) * X.env_exp(.35, .06) * .4
    return X.norm(th + cl * .7 + rattle[: len(th)]) * v

def stamp_fx(v=1.0):
    return X.norm(X.thump(1, 90) + np.pad(X.clack(.7, .6), (0, len(X.thump())))[: len(X.thump())] * .5) * v

def paper(v=1.0):
    d = .45
    return X.norm(X.bp(X.noise(d), 800, 6000) * np.sin(np.pi * X.t_(d) / d) ** 1.5 * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 18 * X.t_(d))))) * v

def boil(d, v=1.0):
    n = X.noise(d); out = X.lp(X.brown(d), 900) * .25
    tt = X.t_(d)
    for k in range(int(d * 14)):
        at = rng.random() * d; f = 180 + rng.random() * 500; dd = .05
        s = int(at * SR); seg = np.sin(2 * np.pi * np.cumsum(np.full(int(dd * SR), f) * (1 + 2 * X.t_(dd) / dd)) / SR) * X.env_exp(dd, .015)
        e = min(len(out), s + len(seg)); out[s:e] += seg[: e - s] * (.4 + rng.random() * .6)
    e = np.minimum(1, tt / .2) * np.minimum(1, (d - tt) / .3)
    return X.norm(out) * e * v

def drip(v=1.0, f=900):
    d = .12; tt = X.t_(d)
    return X.norm(np.sin(2 * np.pi * np.cumsum(f * (1 + 3 * tt / d)) / SR) * X.env_exp(d, .03)) * v

def squirt(v=1.0):
    d = .35; tt = X.t_(d)
    return X.norm(X.bp(X.noise(d), 300, 2500) * np.sin(np.pi * tt / d) ** .5 * (1 + .5 * np.sin(2 * np.pi * 30 * tt))) * v

# gancho: las frutas caen, check y X
add(fx, X.thump(.8, 110), EV["land"] + .15, .4, -.3)
add(fx, X.thump(.8, 130), EV["land"] + .3, .4, .3)
add(fx, X.ding(1), EV["ok"] + 1 / 30, .1, -.3)
add(fx, X.thump(1, 70), EV["no"] + 1 / 30, .45, .3)
add(fx, X.whoosh(.3, 1), EV["cut"] - .15, .28, .2)
add(fx, X.whoosh(.28, 1), EV["nameplate"] - .1, .2, -.3)
# flor
add(fx, X.whoosh(.35, 1), EV["liebigIn"], .24, .3)
for i in range(5): add(fx, X.pop(.9 + i * .08), EV["liebigIn"] + .3 + i * .06 + 1 / 30, .12)
add(fx, X.pop(1.2), EV["sola"] + 1 / 30, .22)
add(fx, X.whoosh(.6, 1), EV["fruit"] - .3, .18, -.2)
add(fx, X.pop(.7), EV["fruit"] + .1, .3)
# banano
add(fx, X.whoosh(.3, 1), EV["banIn"], .24, .4)
add(fx, X.pop(1.2), EV["flor"] + 1 / 30, .2)
add(fx, X.whoosh(.4, 1), EV["lens"], .18, .3)
add(fx, stamp_fx(1), EV["stamp"] + 1 / 30, .55)
# fresa
add(fx, X.whoosh(.3, 1), EV["maiIn"] - .05, .25, -.4)
add(fx, X.pop(1), EV["fuera"] + 1 / 30, .3)
add(fx, X.pop(.8), EV["zoom"] + 1 / 30, .25)
# ballena
add(fx, X.whoosh(.3, 1), EV["carIn"] - .05, .22)
add(fx, X.lp(X.noise(.9), 2500) * X.env_exp(.9, .2) * .9, EV["carIn"] + .1, .3)
add(fx, X.whoosh(.5, 1), EV["spout"], .2, -.2)
add(fx, stamp_fx(.8), EV["x"] + 1 / 30, .45)
# bonus
add(fx, X.pop(.8), EV["truco"] + 1 / 30, .22)
add(fx, X.whoosh(.3, 1), EV["boardIn"] - .05, .22, .3)
for i, t in enumerate(EV["items"]):
    add(fx, X.pop(.9 + i * .15), t + 1 / 30, .28, -.6 + i * .6)
    add(fx, X.ding(1)[: int(.4 * SR)] * np.linspace(1, 0, int(.4 * SR)), t + .25 + 1 / 30, .07, -.6 + i * .6)
# cierre
add(fx, X.click(1, 1), EV["click"] + 1 / 30, .4)
add(fx, X.ding(1), pura + 1 / 30, .14)
for c in range(2): fx[:, c] = limit(fx[:, c], .8)
sf.write("assets/sfx.wav", fx.astype(np.float32), SR)
print("ok", len(ev), "notes")
