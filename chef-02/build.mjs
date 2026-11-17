// Genera index.html y compositions/*.html del video 01 a partir de la voz.
// node build.mjs            (usa audio_meta.json si existe; si no, tiempos estimados)
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const W = 1080, H = 1920, FPS = 30;
const INK = "#2a1a12", YEL = "#ffd23f", RED = "#e63b2e";
const GAP = 0.28, TAIL = 2.2;

const LINES = [
  { id: "l1", text: "¡Mae, el aceite en el agua de la pasta NO evita que se pegue!" },
  { id: "l2", text: "Diay, soy el Chef Chino Artavia, y hoy le rompo otro mito." },
  { id: "l3", text: "El aceite es más liviano que el agua, entonces se queda flotando arriba." },
  { id: "l4", text: "Y la pasta está abajo, hirviendo. ¡El aceite ni la toca!" },
  { id: "l5", text: "Entonces, ¿por qué se pega? ¡Por el almidón! Al inicio la pasta suelta almidón, y eso pega como goma." },
  { id: "l6", text: "Echarle aceite a la olla pa' eso es como ponerse bloqueador, ¡encima de la sombrilla!" },
  { id: "l7", text: "¿El verdadero truco? Bastante agua, y muévala los primeros minutos." },
  { id: "l8", text: "Sígame pa' más secretos de cocina. ¡Pura vida!" },
];
// Palabras resaltadas en amarillo en los subtítulos
const HOT = new Set(["no", "pegue", "chino", "artavia", "mito", "aceite", "liviano", "flotando", "arriba", "abajo", "toca", "almidon", "goma", "bloqueador", "sombrilla", "truco", "agua", "muevala", "secretos", "vida"]);

// ---------- tiempos ----------
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ']/g, "");
let meta = null;
if (fs.existsSync("audio_meta.json")) meta = JSON.parse(fs.readFileSync("audio_meta.json", "utf8"));

// Alineación sin modelo: pausas del audio = límites de frase; dentro, reparto por sílabas
function align(wav, tokens) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", wav, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
  const smp = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1);
  const HOP = 160; // 10 ms
  const rms = [];
  for (let i = 0; i * HOP < smp.length; i++) {
    let a = 0; const e = Math.min(smp.length, (i + 1) * HOP);
    for (let j = i * HOP; j < e; j++) a += smp[j] * smp[j];
    rms.push(Math.sqrt(a / HOP) / 32768);
  }
  const p95 = rms.slice().sort((a, b) => a - b)[Math.floor(rms.length * 0.95)];
  const sp = rms.map((x) => x > p95 * 0.08);
  const first = sp.indexOf(true), last = sp.lastIndexOf(true);
  const gaps = [];
  for (let i = first; i <= last; i++) {
    if (!sp[i]) { let j = i; while (j <= last && !sp[j]) j++; if (j - i >= 6) gaps.push([i, j]); i = j; }
  }
  // frases según la puntuación
  const phrases = []; let cur = [];
  tokens.forEach((tk, i) => { cur.push(tk); if (/[.,:!?]$/.test(tk) || i === tokens.length - 1) { phrases.push(cur); cur = []; } });
  const jf = wav.replace(/\.wav$/, ".json");
  if (fs.existsSync(jf)) {
    const sp2 = JSON.parse(fs.readFileSync(jf, "utf8"));
    if (sp2.length === phrases.length) {
      const syl2 = (w) => Math.max(1, (norm(w).replace(/200/, "doscientos").match(/[aeiouáéíóúü]+/g) || []).length) + 0.6;
      const words = [];
      phrases.forEach((ph, k) => {
        const a = sp2[k].start, b = sp2[k].end, tot = ph.reduce((s, w) => s + syl2(w), 0); let x = a;
        ph.forEach((w) => { const d = ((b - a) * syl2(w)) / tot; words.push({ text: w, start: +x.toFixed(3), end: +(x + d).toFixed(3) }); x += d; });
      });
      return { dur: +(smp.length / 16000).toFixed(3), words };
    }
  }
  const nb = Math.min(phrases.length - 1, gaps.length);
  const cuts = gaps.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, nb).sort((a, b) => a[0] - b[0]);
  // si hay menos pausas que frases, se unen las últimas frases
  while (phrases.length - 1 > cuts.length) { const x = phrases.pop(); phrases[phrases.length - 1].push(...x); }
  const spans = []; let st = first;
  cuts.forEach(([a, b]) => { spans.push([st, a]); st = b; });
  spans.push([st, last + 1]);
  const syl = (w) => Math.max(1, (norm(w).match(/[aeiouáéíóúü]+/g) || []).length) + 0.6;
  const words = [];
  phrases.forEach((ph, k) => {
    const [a, b] = spans[k]; const tot = ph.reduce((s, w) => s + syl(w), 0); let x = a;
    ph.forEach((w) => { const d = ((b - a) * syl(w)) / tot; words.push({ text: w, start: +(x / 100).toFixed(3), end: +((x + d) / 100).toFixed(3) }); x += d; });
  });
  return { dur: +(smp.length / 16000).toFixed(3), words };
}

let t = 0;
for (const L of LINES) {
  const tokens = L.text.split(/\s+/);
  const v = meta && (meta.voices || []).find((x) => x.id === L.id);
  const wav = `assets/voice/${L.id}.wav`;
  if ((!v || !v.words) && fs.existsSync(wav)) {
    L.src = wav;
    const al = align(wav, tokens);
    L.dur = al.dur;
    L.words = al.words;
  } else if (v && v.words && v.words.length) {
    L.dur = v.duration_s;
    L.src = v.path.replace(/^\.?\/?/, "");
    // emparejar por posición con nuestro texto (para conservar la ortografía)
    L.words = tokens.map((tk, i) => {
      const w = v.words[Math.min(i, v.words.length - 1)];
      return { text: tk, start: w.start, end: w.end };
    });
  } else {
    let x = 0.05;
    L.words = tokens.map((tk) => {
      const d = 0.09 + norm(tk).length * 0.062;
      const w = { text: tk, start: x, end: x + d };
      x += d + (/[.,:!?]$/.test(tk) ? 0.2 : 0.03);
      return w;
    });
    L.dur = x + 0.1;
  }
  L.start = +t.toFixed(3);
  L.end = +(t + L.dur).toFixed(3);
  t = L.end + GAP;
}
const TOTAL = +(LINES.at(-1).end + TAIL).toFixed(2);
const Lb = Object.fromEntries(LINES.map((l) => [l.id, l]));
// tiempo absoluto de la palabra n-ésima que coincide con txt en la línea
function at(id, txt, n = 0, edge = "start") {
  const L = Lb[id];
  const hits = L.words.filter((w) => norm(w.text) === norm(txt));
  if (!hits.length) throw new Error(`no word ${txt} in ${id}`);
  return +(L.start + hits[Math.min(n, hits.length - 1)][edge]).toFixed(3);
}
const r3 = (x) => +x.toFixed(3);

// ---------- planificación de planos ----------
const cutHookChef = r3(at("l1", "NO") - 0.12);
const carIn = r3(at("l6", "como") - 0.05);
const carOut = r3(Lb.l6.end + GAP * 0.6);
const boardIn = r3(at("l7", "Bastante") - 0.08);
const boardOut = r3(Lb.l7.end + GAP * 0.6);
const SHOTS = [
  { id: "pot", start: 0, end: cutHookChef },
  { id: "side", start: r3(Lb.l3.start - 0.14), end: r3(Lb.l5.start + 0.45) },
  { id: "starch", start: r3(Lb.l5.start + 0.45), end: r3(Lb.l6.start + 0.55) },
  { id: "beach", start: carIn, end: carOut },
  { id: "stir", start: boardIn, end: boardOut },
];

// ---------- envolvente de la voz para la boca ----------
function envelope() {
  const n = Math.ceil(TOTAL * FPS) + 2;
  const v = new Array(n).fill(0);
  for (const L of LINES) {
    if (L.src && fs.existsSync(L.src)) {
      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", L.src, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
      const s = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1);
      const hop = 16000 / FPS;
      const frames = [];
      for (let i = 0; i * hop < s.length; i++) {
        let acc = 0, c = 0;
        for (let j = Math.floor(i * hop); j < Math.min(s.length, (i + 1) * hop); j++) { acc += s[j] * s[j]; c++; }
        frames.push(Math.sqrt(acc / Math.max(1, c)) / 32768);
      }
      const peak = frames.slice().sort((a, b) => a - b)[Math.floor(frames.length * 0.95)] || 1;
      frames.forEach((f, i) => {
        const k = Math.round(L.start * FPS) + i;
        if (k < n) v[k] = Math.min(1, Math.max(0, (f / peak - 0.08) * 1.1));
      });
    } else {
      // sin audio: sílabas aproximadas
      for (const w of L.words) {
        const syl = Math.max(1, (norm(w.text).match(/[aeiouáéíóú]+/g) || []).length);
        const a = (L.start + w.start) * FPS, b = (L.start + w.end) * FPS;
        for (let k = Math.floor(a); k < b && k < n; k++) v[k] = Math.abs(Math.sin(((k - a) / (b - a)) * Math.PI * syl)) * 0.85;
      }
    }
  }
  return v.map((x) => +x.toFixed(2));
}
fs.mkdirSync("assets", { recursive: true });
fs.writeFileSync("assets/env.js", `window.VOICE_ENV={fps:${FPS},v:${JSON.stringify(envelope())}};\n`);

// ---------- utilidades HTML ----------
const scene = (id, css, body, js) => `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; font-family: "Montserrat", sans-serif; }
${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
${body}
  </div>
  <script>
    (function () {
      const tl = gsap.timeline({ paused: true });
${js}
      window.__timelines["${id}"] = tl;
    })();
  </script>
</template>
`;
fs.mkdirSync("compositions", { recursive: true });
const write = (f, s) => fs.writeFileSync(f, s);
const rel = (abs, s) => r3(abs - s); // tiempo local a una escena

const TITLE_CSS = `
    .t { position: absolute; left: 0; right: 0; text-align: center; font-family: "Archivo Black", "Montserrat", sans-serif;
         color: #fff; -webkit-text-stroke: 10px ${INK}; paint-order: stroke fill; letter-spacing: -0.01em; line-height: 0.98;
         text-shadow: 0 10px 0 rgba(42,26,18,0.35); }
    .t span { display: inline-block; }
    .y { color: ${YEL}; } .r { color: ${RED}; }`;

// ========== CHEF + COCINA (toda la película) ==========
{
  // tramos en que se ve al chef y su cámara (escala, x, y)
  const chefBeats = [
    { t: cutHookChef, cam: [1.16, 0, -30] }, // primer plano en el gancho
    { t: Lb.l2.start, cam: [1.0, 0, 0] },
    { t: Lb.l6.start - 0.05, cam: [1.1, -30, 70] },
    { t: Lb.l7.start - 0.05, cam: [1.04, 30, 30] },
    { t: Lb.l8.start - 0.05, cam: [1.0, 0, 0] },
  ];
  const pose = [
    [0, "rest"], [cutHookChef, "fingerUp"], [at("l2", "Diay"), "hat"], [at("l2", "hoy"), "explain"],
    [Lb.l3.start, "rest"], [Lb.l6.start, "explain"], [at("l6", "olla"), "door"],
    [Lb.l7.start, "shrug"], [Lb.l8.start, "point"], [at("l8", "Pura"), "thumbs"],
  ].map(([a, b]) => [r3(a), b]);
  const face = [
    [0, "serious"], [cutHookChef, "serious"], [at("l2", "Diay"), "happy"], [at("l2", "mito"), "sly"],
    [Lb.l6.start, "sly"], [at("l6", "eso"), "nope"], [Lb.l7.start, "wow"], [at("l7", "Bastante") - 0.3, "serious"],
    [Lb.l8.start, "happy"],
  ].map(([a, b]) => [r3(a), b]);
  const talk = LINES.map((l) => [r3(l.start), r3(l.end)]);

  const camJs = chefBeats.map((b, i) => {
    const [s, x, y] = b.cam;
    // cada tramo entra con un pequeño empuje que se asienta en 0.5 s
    return `      tl.fromTo("#chef-cam", { scale: ${(s * 1.06).toFixed(3)}, x: ${x}, y: ${y} }, { scale: ${s}, x: ${x}, y: ${y}, duration: 0.55, ease: "expo.out" }, ${r3(b.t)});`;
  }).join("\n");
  const camBase = `      tl.set("#chef-cam", { scale: 1, x: 0, y: 0 }, 0);`;
  const pushEnd = `      tl.fromTo("#chef-cam", { scale: 1.0 }, { scale: 1.13, y: 120, duration: 1.4, ease: "power2.inOut" }, ${r3(at("l8", "Pura") - 0.6)});`;

  write("compositions/chef.html", scene("chef", `
    #chef-cam { position: absolute; inset: 0; transform-origin: 540px 820px; }
    #chef-kitchen { position: absolute; inset: 0; }
    #chef-fig { position: absolute; left: 40px; top: 300px; width: 1000px; height: 1500px; }
    #chef-fig svg { overflow: visible; }`,
`    <div id="chef-cam">
      <svg id="chef-kitchen" viewBox="0 0 1080 1920" width="1080" height="1920">
        <defs>
          <pattern id="tile" width="120" height="60" patternUnits="userSpaceOnUse">
            <rect width="120" height="60" fill="#f3eee5"/>
            <rect x="2" y="2" width="116" height="56" rx="6" fill="#faf7f1"/>
            <path d="M0 59 H120 M119 0 V60" stroke="#ddd3c3" stroke-width="3"/>
          </pattern>
          <pattern id="tile2" width="120" height="60" patternUnits="userSpaceOnUse" patternTransform="translate(60 0)">
            <rect width="120" height="60" fill="url(#tile)"/>
          </pattern>
          <linearGradient id="warm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffd9a0" stop-opacity="0.35"/>
            <stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <rect width="1080" height="1920" fill="url(#tile)"/>
        <rect width="1080" height="1920" fill="url(#warm)"/>
        <!-- repisa con frascos -->
        <rect x="-10" y="560" width="1100" height="26" rx="6" fill="#8a5a33" stroke="${INK}" stroke-width="7"/>
        <g stroke="${INK}" stroke-width="7" stroke-linejoin="round">
          <rect x="40" y="440" width="80" height="120" rx="14" fill="#e8b04a"/><rect x="48" y="420" width="64" height="26" rx="6" fill="#c0392b"/>
          <rect x="140" y="470" width="70" height="90" rx="12" fill="#7fae5a"/><rect x="146" y="452" width="58" height="22" rx="6" fill="#3d3d40"/>
          <rect x="880" y="450" width="74" height="110" rx="12" fill="#d96b3a"/><rect x="886" y="430" width="62" height="24" rx="6" fill="#3d3d40"/>
          <rect x="970" y="480" width="70" height="80" rx="12" fill="#f0e6cf"/><rect x="976" y="462" width="58" height="22" rx="6" fill="#c0392b"/>
        </g>
        <!-- barra con ollas de cobre colgando -->
        <rect x="-10" y="180" width="1100" height="16" rx="8" fill="#6b6f74" stroke="${INK}" stroke-width="6"/>
        <g stroke="${INK}" stroke-width="7" stroke-linejoin="round" fill="#c8733f">
          <path d="M70 196 V230"/><circle cx="70" cy="310" r="80"/><circle cx="70" cy="310" r="56" fill="#d98a52"/>
          <path d="M1010 196 V226"/><circle cx="1010" cy="300" r="72"/><circle cx="1010" cy="300" r="50" fill="#d98a52"/>
          <path d="M175 196 V240" /><rect x="152" y="240" width="46" height="150" rx="20" fill="#9aa2a8"/>
          <path d="M900 196 V236" /><path d="M870 236 h60 l-10 120 h-40 z" fill="#9aa2a8"/>
        </g>
        <!-- mesón de acero detrás del chef -->
        <rect x="-10" y="1440" width="1100" height="500" fill="#b9c0c6" stroke="${INK}" stroke-width="8"/>
        <rect x="-10" y="1440" width="1100" height="40" fill="#d5dade" stroke="${INK}" stroke-width="8"/>
        <g stroke="${INK}" stroke-width="7" stroke-linejoin="round">
          <ellipse cx="120" cy="1430" rx="70" ry="34" fill="#e2412f"/><ellipse cx="200" cy="1440" rx="56" ry="30" fill="#e85a3c"/>
          <path d="M930 1460 q40 -120 90 -110 q-10 70 -60 110 z" fill="#6aa84f"/><path d="M890 1460 q10 -100 70 -120 q10 60 -40 120 z" fill="#5d9443"/>
        </g>
      </svg>
      <div id="chef-fig"></div>
    </div>`,
`      const rig = window.ChefRig.mount(document.getElementById("chef-fig"));
      const keys = { pose: ${JSON.stringify(pose)}, face: ${JSON.stringify(face)}, talk: ${JSON.stringify(talk)} };
      const P = { t: 0 };
      rig.render(0, keys, window.VOICE_ENV, 0);
      tl.to(P, { t: ${TOTAL}, duration: ${TOTAL}, ease: "none", onUpdate: () => rig.render(P.t, keys, window.VOICE_ENV, P.t) }, 0);
${camBase}
${camJs}
${pushEnd}`));
}

// ========== PANELES (B-roll) ==========
// semilla determinista
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const WATER = "#7fc4e8", OIL = "#f6d55c", PASTA = "#f2c14e", STEEL = "#b9c0c6";
// espaguetis vistos desde arriba: curvas con borde
function noodles(seed, cx, cy, rad, n, w = 14) {
  const R = rng(seed); let out = "";
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r1 = R() * rad, r2 = R() * rad;
    const x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1 * 0.9;
    const b = a + 1.2 + R() * 2;
    const x2 = cx + Math.cos(b) * r2, y2 = cy + Math.sin(b) * r2 * 0.9;
    const qx = cx + (R() - 0.5) * rad * 1.6, qy = cy + (R() - 0.5) * rad * 1.4;
    const d = `M${x1.toFixed(0)} ${y1.toFixed(0)} Q${qx.toFixed(0)} ${qy.toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}`;
    out += `<path d="${d}" stroke="${INK}" stroke-width="${w + 8}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${PASTA}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}

// ----- pot: el gancho (olla vista desde arriba, aceite cayendo) -----
{
  const S = SHOTS.find((s) => s.id === "pot");
  const D = r3(S.end - S.start);
  const R = rng(4);
  const blobs = Array.from({ length: 9 }, (_, i) => ({ x: 430 + R() * 260, y: 900 + R() * 220, r: 26 + R() * 34, t: 0.15 + i * 0.09 }));
  const bub = Array.from({ length: 16 }, () => ({ x: 260 + R() * 560, y: 760 + R() * 460, r: 8 + R() * 12, t: R() * 1.2 }));
  write("compositions/pot.html", scene("pot", `
    #pot-cam { position: absolute; inset: 0; transform-origin: 540px 1000px; }`,
`    <div id="pot-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#8e969c"/>
        <g stroke="#6f777d" stroke-width="10" opacity="0.6"><path d="M0 520 H1080 M0 1480 H1080 M140 0 V1920 M940 0 V1920"/></g>
        <rect x="-80" y="960" width="200" height="70" rx="30" fill="${STEEL}" stroke="${INK}" stroke-width="10"/>
        <rect x="960" y="960" width="200" height="70" rx="30" fill="${STEEL}" stroke="${INK}" stroke-width="10"/>
        <circle cx="540" cy="1000" r="440" fill="${STEEL}" stroke="${INK}" stroke-width="12"/>
        <circle cx="540" cy="1000" r="392" fill="${WATER}" stroke="${INK}" stroke-width="8"/>
        <ellipse cx="440" cy="860" rx="200" ry="80" fill="#a9dbf2" opacity="0.7"/>
        <g id="pot-pasta">${noodles(7, 540, 1010, 300, 14)}</g>
        <g>${bub.map((b, i) => `<circle id="pot-u${i}" cx="${b.x.toFixed(0)}" cy="${b.y.toFixed(0)}" r="${b.r.toFixed(1)}" fill="none" stroke="#fff" stroke-width="5" opacity="0"/>`).join("")}</g>
        <g>${blobs.map((b, i) => `<g id="pot-o${i}" opacity="0"><ellipse cx="${b.x.toFixed(0)}" cy="${b.y.toFixed(0)}" rx="${b.r.toFixed(0)}" ry="${(b.r * 0.8).toFixed(0)}" fill="${OIL}" stroke="${INK}" stroke-width="5"/><ellipse cx="${(b.x - b.r * 0.3).toFixed(0)}" cy="${(b.y - b.r * 0.3).toFixed(0)}" rx="${(b.r * 0.3).toFixed(0)}" ry="${(b.r * 0.18).toFixed(0)}" fill="#fff6c8"/></g>`).join("")}</g>
        <!-- chorro de aceite y botella -->
        <path id="pot-stream" d="M760 520 Q700 700 580 960" stroke="${OIL}" stroke-width="22" fill="none" stroke-linecap="round"/>
        <g id="pot-bottle" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <path d="M800 300 L1000 140 Q1040 120 1060 150 L1100 200 Q1110 230 1080 250 L880 410 Z" fill="#f2d24a"/>
          <rect x="740" y="470" width="70" height="60" rx="10" transform="rotate(-40 775 500)" fill="#2e7d32"/>
          <path d="M790 420 L880 410 L800 300 L740 360 Z" fill="#f2d24a"/>
          <rect x="890" y="200" width="120" height="90" rx="10" transform="rotate(-40 950 245)" fill="#fff" stroke-width="6"/>
        </g>
      </svg>
    </div>`,
`      tl.fromTo("#pot-bottle", { rotation: -6, svgOrigin: "900 300" }, { rotation: 4, duration: ${D}, ease: "sine.inOut" }, 0);
      tl.fromTo("#pot-stream", { opacity: 1 }, { opacity: 1, duration: 0.01 }, 0);
      tl.fromTo("#pot-cam", { scale: 1.0 }, { scale: 1.1, duration: ${D}, ease: "power2.out" }, 0);
      ${JSON.stringify(blobs)}.forEach((b, i) => tl.fromTo("#pot-o" + i, { opacity: 0, scale: 0.2, svgOrigin: b.x + " " + b.y }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.4)" }, b.t));
      ${JSON.stringify(bub)}.forEach((b, i) => { tl.fromTo("#pot-u" + i, { opacity: 0, scale: 0.3, svgOrigin: b.x + " " + b.y }, { opacity: 1, scale: 1, duration: 0.25 }, b.t); tl.to("#pot-u" + i, { opacity: 0, scale: 1.4, duration: 0.12 }, b.t + 0.4); });`));
}

// ----- side: corte de la olla (aceite arriba, pasta abajo) -----
{
  const S = SHOTS.find((s) => s.id === "side");
  const D = r3(S.end - S.start);
  const tLiv = rel(at("l3", "liviano"), S.start), tFlo = rel(at("l3", "flotando"), S.start);
  const tAba = rel(at("l4", "abajo,"), S.start), tToca = rel(at("l4", "toca!"), S.start), tL4 = rel(Lb.l4.start, S.start);
  const R = rng(17);
  const bub = Array.from({ length: 22 }, () => ({ x: 220 + R() * 640, y: 1040, r: 7 + R() * 10, t: R() * Math.max(1, D - 1.5), rise: 300 + R() * 160 }));
  // espaguetis de perfil en el fondo
  let pasta = "";
  for (let i = 0; i < 9; i++) { const y = 990 + (i % 3) * 22, x = 230 + i * 62; const d = `M${x} ${y} q60 -40 120 0 t120 0`; pasta += `<path d="${d}" stroke="${INK}" stroke-width="22" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${PASTA}" stroke-width="14" fill="none" stroke-linecap="round"/>`; }
  write("compositions/side.html", scene("side", TITLE_CSS + `
    #side-cam { position: absolute; inset: 0; transform-origin: 540px 780px; }
    #side-t1 { top: 215px; font-size: 76px; }
    #side-t2 { top: 215px; font-size: 76px; }
    .tag { position: absolute; font: 900 50px/1 "Archivo Black", sans-serif; color: ${INK}; background: #fff; border: 7px solid ${INK}; border-radius: 16px; padding: 10px 20px 14px; }
    #side-oil { left: 640px; top: 420px; background: ${OIL}; }
    #side-pasta { left: 600px; top: 1080px; background: ${PASTA}; display: none; }
    #side-stamp { position: absolute; left: 0; right: 0; top: 700px; text-align: center; }
    #side-stamp span { display: inline-block; font: 900 104px/1 "Archivo Black", sans-serif; color: #fff; background: ${RED}; border: 10px solid ${INK}; border-radius: 22px; padding: 14px 34px 22px; }`,
`    <div id="side-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0">
        <rect width="1080" height="1920" fill="#e9e1d3"/>
        <rect y="1150" width="1080" height="770" fill="#5f666b"/>
        <g id="side-fire" fill="#3d7fd6" stroke="${INK}" stroke-width="5">${[300, 420, 540, 660, 780].map((x) => `<path d="M${x} 1160 q-22 -40 0 -70 q22 30 0 70 z"/>`).join("")}</g>
        <!-- olla en corte -->
        <path d="M150 470 L150 1100 Q150 1130 180 1130 L900 1130 Q930 1130 930 1100 L930 470" fill="${WATER}" stroke="${INK}" stroke-width="14" stroke-linejoin="round"/>
        <path d="M156 560 L924 560" stroke="#5aa9d3" stroke-width="6"/>
        <rect x="90" y="455" width="900" height="34" rx="14" fill="${STEEL}" stroke="${INK}" stroke-width="10"/>
        <g id="side-pastag">${pasta}</g>
        <g>${bub.map((b, i) => `<circle id="side-u${i}" cx="${b.x.toFixed(0)}" cy="${b.y}" r="${b.r.toFixed(1)}" fill="#fff" fill-opacity="0.5" stroke="#fff" stroke-width="4" opacity="0"/>`).join("")}</g>
        <!-- capa de aceite flotando -->
        <g id="side-oilg" stroke="${INK}" stroke-width="5">
          ${[[250, 548, 70], [400, 552, 90], [560, 546, 60], [700, 552, 85], [840, 548, 55]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="16" fill="${OIL}"/>`).join("")}
        </g>
        <!-- distancia entre aceite y pasta -->
        <g id="side-dist" stroke="${INK}" stroke-width="8" fill="${YEL}" stroke-linejoin="round">
          <path d="M130 600 L100 650 L120 650 L120 930 L100 930 L130 980 L160 930 L140 930 L140 650 L160 650 Z"/>
        </g>
      </svg>
      <div id="side-oil" class="tag">ACEITE</div>
      <div id="side-pasta" class="tag">PASTA</div>
    </div>
    <div id="side-t1" class="t">MÁS LIVIANO<br>QUE EL <span class="y">AGUA</span></div>
    <div id="side-t2" class="t">FLOTA <span class="y">ARRIBA</span>…<br>LA PASTA, <span class="y">ABAJO</span></div>
    <div id="side-stamp"><span>¡NI LA TOCA!</span></div>`,
`      tl.fromTo("#side-cam", { y: 1920 }, { y: 0, duration: 0.45, ease: "expo.out" }, 0);
      tl.fromTo("#side-fire", { scaleY: 0.9, svgOrigin: "540 1160" }, { scaleY: 1.1, duration: 0.2, ease: "sine.inOut", repeat: ${Math.max(0, Math.floor(D / 0.2) - 1)}, yoyo: true }, 0);
      ${JSON.stringify(bub)}.forEach((b, i) => { tl.fromTo("#side-u" + i, { opacity: 0, y: 0 }, { opacity: 1, y: -b.rise, duration: 1.1, ease: "power1.in" }, b.t); tl.set("#side-u" + i, { opacity: 0 }, b.t + 1.1); });
      tl.set("#side-oilg", { y: -260, opacity: 0 }, 0);
      tl.fromTo("#side-oilg", { y: -260, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "bounce.out" }, 0.35);
      tl.fromTo("#side-oilg", { y: 0 }, { y: -6, duration: 0.6, ease: "sine.inOut", repeat: ${Math.max(0, Math.floor(D / 0.6) - 2)}, yoyo: true }, 1.0);
      tl.fromTo("#side-oil", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" }, 0.7);
      tl.fromTo("#side-t1", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, ${r3(Math.max(0.3, tLiv - 0.2))});
      tl.to("#side-t1", { opacity: 0, filter: "blur(6px)", duration: 0.13 }, ${r3(tFlo - 0.15)});
      tl.fromTo("#side-t2", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, ${r3(tFlo - 0.02)});
      tl.set("#side-pasta", { display: "block" }, 0);
      tl.fromTo("#side-pasta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" }, ${r3(tAba - 0.1)});
      tl.fromTo("#side-pastag", { x: 0 }, { x: 14, duration: 0.3, ease: "sine.inOut", repeat: ${Math.max(0, Math.floor(D / 0.3) - 1)}, yoyo: true }, 0);
      tl.fromTo("#side-dist", { opacity: 0, scaleY: 0.2, svgOrigin: "130 790" }, { opacity: 1, scaleY: 1, duration: 0.35, ease: "back.out(2)" }, ${r3(tToca - 0.6)});
      tl.fromTo("#side-stamp", { opacity: 0, scale: 2.2, rotation: -10 }, { opacity: 1, scale: 1, rotation: -6, duration: 0.2, ease: "power4.in" }, ${r3(tToca - 0.55)});
      tl.set("#side-stamp", { opacity: 0 }, 0);
      tl.set("#side-t2", { opacity: 0 }, 0);`));
}

// ----- starch: el almidón pega la pasta -----
{
  const S = SHOTS.find((s) => s.id === "starch");
  const D = r3(S.end - S.start);
  const tPor = Math.max(0.35, rel(at("l5", "¿por"), S.start)), tAlm = rel(at("l5", "almidón!"), S.start), tAlm2 = rel(at("l5", "almidón,"), S.start), tGoma = rel(at("l5", "goma."), S.start);
  const R = rng(29);
  const dots = Array.from({ length: 30 }, (_, i) => ({ side: i % 2, a: R() * Math.PI * 2, d: 60 + R() * 170, r: 6 + R() * 9, t: tAlm2 - 0.3 + R() * 1.4 }));
  write("compositions/starch.html", scene("starch", TITLE_CSS + `
    #st-cam { position: absolute; inset: 0; transform-origin: 540px 900px; }
    #st-q { top: 215px; font-size: 80px; }
    #st-alm { top: 215px; font-size: 128px; }
    #st-goma { top: 360px; font-size: 76px; }`,
`    <div id="st-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#bfe6f5"/>
        ${[[150, 600, 30], [930, 700, 22], [200, 1250, 26], [880, 1300, 34], [520, 520, 18]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#fff" stroke-width="6"/>`).join("")}
        <g id="st-n1" stroke-linecap="round" fill="none">
          <path d="M120 700 Q360 600 520 820 T900 900" stroke="${INK}" stroke-width="86"/>
          <path d="M120 700 Q360 600 520 820 T900 900" stroke="${PASTA}" stroke-width="70"/>
          <path d="M150 690 Q360 610 510 800" stroke="#fbe08a" stroke-width="14"/>
        </g>
        <g id="st-n2" stroke-linecap="round" fill="none">
          <path d="M160 1180 Q420 1260 600 1060 T960 1000" stroke="${INK}" stroke-width="86"/>
          <path d="M160 1180 Q420 1260 600 1060 T960 1000" stroke="${PASTA}" stroke-width="70"/>
          <path d="M200 1180 Q420 1240 590 1050" stroke="#fbe08a" stroke-width="14"/>
        </g>
        <g id="st-glue" stroke="${INK}" stroke-width="7" stroke-linejoin="round" opacity="0">
          <path d="M470 840 Q540 900 520 960 Q500 1010 560 1050 Q620 1000 600 950 Q585 890 640 860 Q560 880 470 840 Z" fill="#fffdf5"/>
        </g>
        <g>${dots.map((p, i) => `<circle id="st-d${i}" cx="${p.side ? 600 : 480}" cy="${p.side ? 1060 : 820}" r="${p.r.toFixed(1)}" fill="#fff" stroke="#d8e6ee" stroke-width="3" opacity="0"/>`).join("")}</g>
        <!-- frasco de goma -->
        <g transform="translate(-40 880)"><g id="st-bottle" stroke="${INK}" stroke-width="8" stroke-linejoin="round" opacity="0">
          <rect x="820" y="400" width="130" height="170" rx="22" fill="#fff"/>
          <path d="M850 400 L860 350 L910 350 L920 400 Z" fill="#ff8c2b"/>
          <path d="M872 350 L885 300 L898 350 Z" fill="#ff8c2b"/>
          <rect x="836" y="450" width="98" height="60" rx="8" fill="${YEL}" stroke-width="5"/>
        </g></g>
      </svg>
    </div>
    <div id="st-q" class="t">¿POR QUÉ SE PEGA?</div>
    <div id="st-alm" class="t">¡<span class="y">ALMIDÓN</span>!</div>
    <div id="st-goma" class="t">PEGA COMO <span class="y">GOMA</span></div>`,
`      tl.fromTo("#st-cam", { x: -1080 }, { x: 0, duration: 0.4, ease: "expo.out" }, 0);
      tl.fromTo("#st-n1", { y: 0, rotation: 0 }, { y: 30, rotation: 2, duration: 1.2, ease: "sine.inOut", repeat: ${Math.max(0, Math.floor(D / 1.2) - 1)}, yoyo: true, svgOrigin: "520 820" }, 0);
      tl.fromTo("#st-n2", { y: 0 }, { y: -26, duration: 1.0, ease: "sine.inOut", repeat: ${Math.max(0, Math.floor(D / 1.0) - 1)}, yoyo: true }, 0);
      tl.fromTo("#st-q", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, ${r3(Math.max(0.3, tPor - 0.15))});
      tl.to("#st-q", { opacity: 0, duration: 0.12 }, ${r3(tAlm - 0.2)});
      tl.fromTo("#st-alm", { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power4.out" }, ${r3(tAlm - 0.12)});
      ${JSON.stringify(dots)}.forEach((p, i) => {
        tl.fromTo("#st-d" + i, { opacity: 0, x: 0, y: 0, scale: 0.3 }, { opacity: 0.95, x: Math.cos(p.a) * p.d, y: Math.sin(p.a) * p.d * 0.7, scale: 1, duration: 0.9, ease: "power2.out" }, p.t);
      });
      tl.fromTo("#st-glue", { opacity: 0, scale: 0.2, svgOrigin: "550 950" }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, ${r3(tGoma - 0.7)});
      tl.fromTo("#st-bottle", { opacity: 0, y: -80, rotation: -20, svgOrigin: "845 1360" }, { opacity: 1, y: 0, rotation: 0, duration: 0.35, ease: "back.out(2)" }, ${r3(tGoma - 0.3)});
      tl.fromTo("#st-goma", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power4.out" }, ${r3(tGoma - 0.55)});
      tl.fromTo("#st-cam", { scale: 1 }, { scale: 1.08, duration: 0.8, ease: "power2.inOut" }, ${r3(tGoma - 0.8)});
      tl.set(["#st-alm", "#st-goma"], { opacity: 0 }, 0);`));
}

// ----- beach: bloqueador encima de la sombrilla -----
{
  const S = SHOTS.find((s) => s.id === "beach");
  const D = r3(S.end - S.start);
  const tBlo = rel(at("l6", "bloqueador,"), S.start), tSom = rel(at("l6", "sombrilla!"), S.start);
  const splat = r3(Math.max(0.5, tBlo + 0.2));
  write("compositions/beach.html", scene("beach", TITLE_CSS + `
    #be-world { position: absolute; inset: 0; }
    #be-t1 { top: 215px; font-size: 92px; }
    #be-t2 { top: 330px; font-size: 92px; }`,
`    <div id="be-world">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#bfe3ea"/>
        <g id="be-sun"><circle cx="880" cy="560" r="80" fill="${YEL}" stroke="${INK}" stroke-width="8"/>
          ${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<path d="M${(880 + Math.cos(a) * 105).toFixed(0)} ${(560 + Math.sin(a) * 105).toFixed(0)} L${(880 + Math.cos(a) * 140).toFixed(0)} ${(560 + Math.sin(a) * 140).toFixed(0)}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`; }).join("")}</g>
        <rect y="980" width="1080" height="120" fill="#4fb3cf" stroke="${INK}" stroke-width="8"/>
        <path d="M0 1010 q60 -20 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0" stroke="#fff" stroke-width="8" fill="none"/>
        <rect y="1100" width="1080" height="820" fill="#f3d9a4" stroke="${INK}" stroke-width="8"/>
        <!-- silla de playa -->
        <g stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <path d="M520 1200 L700 1200 L760 1080 L600 1080 Z" fill="#2fa36b"/>
          <path d="M540 1200 L520 1280 M690 1200 L720 1280" fill="none"/>
        </g>
        <!-- sombrilla -->
        <path d="M440 720 L460 1280" stroke="${INK}" stroke-width="14"/>
        <g id="be-umb" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <path d="M160 800 Q440 520 740 640 Q600 660 560 700 Q470 690 400 730 Q300 730 260 770 Q200 770 160 800 Z" fill="#fff"/>
          <path d="M160 800 Q300 600 440 600 L400 730 Q300 730 260 770 Q200 770 160 800 Z" fill="${RED}"/>
          <path d="M440 600 Q600 590 740 640 Q600 660 560 700 L440 600 Z" fill="${RED}"/>
        </g>
        <!-- crema sobre la sombrilla -->
        <g id="be-splat" stroke="${INK}" stroke-width="6" stroke-linejoin="round">
          <path d="M380 610 Q420 560 470 590 Q520 570 530 620 Q560 650 520 670 Q480 700 440 670 Q390 680 380 640 Q350 625 380 610 Z" fill="#fffdf5"/>
          <circle cx="345" cy="600" r="12" fill="#fffdf5"/><circle cx="560" cy="600" r="10" fill="#fffdf5"/>
        </g>
        <!-- botella de bloqueador -->
        <g transform="translate(90 200)"><g id="be-bottle" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <rect x="700" y="230" width="170" height="250" rx="34" fill="#ff9f43" transform="rotate(150 785 355)"/>
          <rect x="740" y="455" width="90" height="60" rx="10" fill="#fff" transform="rotate(150 785 355)"/>
          <rect x="722" y="300" width="126" height="90" rx="12" fill="#fff" stroke-width="6" transform="rotate(150 785 355)"/>
        </g></g>
        <path id="be-squirt" d="M790 470 Q620 460 480 610" stroke="#fffdf5" stroke-width="26" fill="none" stroke-linecap="round" opacity="0"/>
        <g id="be-q" opacity="0"><text x="560" y="900" font-family="Archivo Black" font-size="150" fill="${YEL}" stroke="${INK}" stroke-width="10" paint-order="stroke">?</text>
          <text x="300" y="930" font-family="Archivo Black" font-size="110" fill="${YEL}" stroke="${INK}" stroke-width="10" paint-order="stroke">?</text></g>
      </svg>
      <div id="be-t1" class="t"><span class="y">BLOQUEADOR</span>…</div>
      <div id="be-t2" class="t">¿EN LA <span class="y">SOMBRILLA</span>?</div>
    </div>`,
`      tl.fromTo("#be-world", { clipPath: "circle(0% at 540px 960px)" }, { clipPath: "circle(120% at 540px 960px)", duration: 0.35, ease: "power2.out" }, 0);
      tl.fromTo("#be-sun", { rotation: 0, svgOrigin: "880 560" }, { rotation: 40, duration: ${D}, ease: "none" }, 0);
      tl.fromTo("#be-bottle", { x: 400, y: -300 }, { x: 0, y: 0, duration: 0.4, ease: "expo.out" }, 0.1);
      tl.fromTo("#be-t1", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, ${r3(Math.max(0.2, tBlo - 0.25))});
      tl.fromTo("#be-bottle", { scaleY: 1, svgOrigin: "875 555" }, { scaleY: 0.85, duration: 0.1, yoyo: true, repeat: 1 }, ${r3(splat - 0.2)});
      tl.fromTo("#be-squirt", { opacity: 0 }, { opacity: 1, duration: 0.08 }, ${r3(splat - 0.15)});
      tl.to("#be-squirt", { opacity: 0, duration: 0.1 }, ${r3(splat + 0.1)});
      tl.fromTo("#be-splat", { opacity: 0, scale: 0.2, svgOrigin: "455 630" }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(3)" }, ${r3(splat)});
      [[0,-10],[0,6],[0,-3],[0,0]].forEach(([x,y],i)=>tl.to("#be-umb",{y,duration:0.05,ease:"none"},${r3(splat)}+i*0.05));
      tl.fromTo("#be-t2", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power4.out" }, ${r3(tSom - 0.15)});
      tl.fromTo("#be-q", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, ${r3(tSom)});
      tl.set("#be-splat", { opacity: 0 }, 0);`));
}

// ----- stir: bastante agua y moverla -----
{
  const S = SHOTS.find((s) => s.id === "stir");
  const D = r3(S.end - S.start);
  const tBas = rel(at("l7", "Bastante"), S.start), tMue = rel(at("l7", "muévala"), S.start);
  write("compositions/stir.html", scene("stir", TITLE_CSS + `
    #sr-cam { position: absolute; inset: 0; transform-origin: 540px 980px; }
    .chk { position: absolute; left: 110px; font: 900 66px/1 "Archivo Black", sans-serif; color: #fff; -webkit-text-stroke: 9px ${INK}; paint-order: stroke fill; display: flex; align-items: center; gap: 26px; }
    .chk i { display: inline-block; width: 86px; height: 86px; border-radius: 18px; background: ${YEL}; border: 8px solid ${INK}; position: relative; }
    .chk i::after { content: ""; position: absolute; left: 22px; top: 6px; width: 24px; height: 46px; border: solid ${INK}; border-width: 0 12px 12px 0; transform: rotate(45deg); }
    #sr-c1 { top: 215px; } #sr-c2 { top: 335px; }`,
`    <div id="sr-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#8e969c"/>
        <g stroke="#6f777d" stroke-width="10" opacity="0.6"><path d="M0 520 H1080 M0 1480 H1080 M140 0 V1920 M940 0 V1920"/></g>
        <rect x="-80" y="960" width="200" height="70" rx="30" fill="${STEEL}" stroke="${INK}" stroke-width="10"/>
        <rect x="960" y="960" width="200" height="70" rx="30" fill="${STEEL}" stroke="${INK}" stroke-width="10"/>
        <circle cx="540" cy="1000" r="440" fill="${STEEL}" stroke="${INK}" stroke-width="12"/>
        <circle id="sr-water" cx="540" cy="1000" r="392" fill="${WATER}" stroke="${INK}" stroke-width="8"/>
        <g id="sr-swirl" fill="none" stroke="#a9dbf2" stroke-width="12" stroke-linecap="round">
          <path d="M540 760 A240 240 0 0 1 780 1000"/><path d="M540 1240 A240 240 0 0 1 300 1000"/><path d="M540 860 A140 140 0 0 1 680 1000"/><path d="M540 1140 A140 140 0 0 1 400 1000"/>
        </g>
        <g id="sr-pasta">${noodles(13, 540, 1000, 230, 12)}</g>
        <g id="sr-spoon" stroke="${INK}" stroke-width="10" stroke-linejoin="round">
          <rect x="520" y="560" width="40" height="420" rx="18" fill="#c8894e"/>
          <ellipse cx="540" cy="1010" rx="70" ry="95" fill="#c8894e"/>
        </g>
      </svg>
    </div>
    <div id="sr-c1" class="chk"><i></i><span>BASTANTE AGUA</span></div>
    <div id="sr-c2" class="chk"><i></i><span style="color:${YEL}">MOVER AL INICIO</span></div>`,
`      tl.fromTo("#sr-cam", { y: 1920 }, { y: 0, duration: 0.4, ease: "expo.out" }, 0);
      tl.fromTo("#sr-water", { attr: { r: 300 } }, { attr: { r: 392 }, duration: 0.6, ease: "power2.out" }, ${r3(Math.max(0.2, tBas - 0.1))});
      tl.fromTo("#sr-c1", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.3, ease: "expo.out" }, ${r3(Math.max(0.2, tBas - 0.2))});
      tl.fromTo("#sr-c2", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.3, ease: "expo.out" }, ${r3(tMue - 0.2)});
      tl.fromTo("#sr-spoon", { rotation: 0, svgOrigin: "540 1000" }, { rotation: 540, duration: ${r3(Math.max(0.8, D - tMue + 0.3))}, ease: "power1.inOut" }, ${r3(tMue - 0.3)});
      tl.fromTo("#sr-pasta", { rotation: 0, svgOrigin: "540 1000" }, { rotation: 300, duration: ${r3(Math.max(0.8, D - tMue + 0.3))}, ease: "power1.inOut" }, ${r3(tMue - 0.2)});
      tl.fromTo("#sr-swirl", { rotation: 0, svgOrigin: "540 1000" }, { rotation: 400, duration: ${D}, ease: "none" }, 0);`));
}

// ========== TÍTULOS SOBRE EL CHEF ==========
{
  const tNo = rel(at("l1", "NO"), 0);
  const tChef = at("l2", "Chef"), tTruco = at("l7", "truco?");
  const tSig = at("l8", "Sígame"), tPura = at("l8", "¡Pura");
  write("compositions/titles.html", scene("titles", TITLE_CSS + `
    #ti-hook { top: 215px; font-size: 84px; left: 70px; right: 70px; padding: 18px 10px 26px; background: rgba(30,18,12,0.62); border-radius: 30px; }
    #ti-hook .l2 { font-size: 128px; }
    #ti-hook .nobox { color: #fff; background: #c62a1f; border-radius: 18px; padding: 0 18px 8px; -webkit-text-stroke: 0; text-shadow: none; }
    #ti-plate { position: absolute; left: 90px; right: 90px; top: 210px; text-align: center; }
    #ti-plate .nm { display: inline-block; background: ${RED}; color: #fff; font: 900 74px/1 "Archivo Black", sans-serif; padding: 20px 34px 24px; border: 8px solid ${INK}; border-radius: 16px; }
    #ti-plate .sub { display: inline-block; margin-top: 14px; background: ${YEL}; color: ${INK}; font: 800 44px/1 "Montserrat", sans-serif; padding: 12px 24px; border: 6px solid ${INK}; border-radius: 12px; }
    #ti-truco { top: 220px; font-size: 92px; }
    #ti-cta { top: 200px; font-size: 66px; }
    #ti-btn { position: absolute; left: 0; right: 0; top: 330px; text-align: center; }
    #ti-btn b { display: inline-block; font: 900 64px/1 "Archivo Black", sans-serif; color: #fff; background: ${RED}; padding: 22px 50px 26px; border: 8px solid ${INK}; border-radius: 24px; box-shadow: 0 10px 0 ${INK}; }
    #ti-btn b.on { background: #3d3d40; }
    #ti-pura { top: 470px; font-size: 128px; color: ${YEL}; }`,
`    <div id="ti-hook" class="t"><span class="l1">EL <span class="y">ACEITE</span> EN LA PASTA</span><br><span class="l2"><span class="r nobox">NO</span> EVITA</span><br><span class="l3">QUE SE <span class="y">PEGUE</span></span></div>
    <div id="ti-plate"><div class="nm">CHEF CHINO ARTAVIA</div><br><div class="sub">Mitos de cocina #2</div></div>
    <div id="ti-truco" class="t">¿EL VERDADERO <span class="y">TRUCO</span>?</div>
    <div id="ti-cta" class="t">MÁS SECRETOS DE COCINA</div>
    <div id="ti-btn"><b id="ti-b1">SEGUIR +</b></div>
    <div id="ti-pura" class="t">¡PURA VIDA!</div>`,
`      // gancho: en pantalla desde el cuadro 0
      tl.set("#ti-hook", { opacity: 1 }, 0);
      tl.fromTo("#ti-hook .r", { scale: 1 }, { scale: 1.25, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1 }, ${r3(tNo)});
      tl.to("#ti-hook", { opacity: 0, filter: "blur(8px)", duration: 0.18 }, ${r3(Lb.l1.end + 0.1)});
      tl.fromTo("#ti-plate .nm", { opacity: 0, x: -500 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out" }, ${r3(tChef - 0.1)});
      tl.fromTo("#ti-plate .sub", { opacity: 0, x: 500 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out" }, ${r3(tChef + 0.05)});
      tl.to("#ti-plate", { opacity: 0, duration: 0.15 }, ${r3(Lb.l2.end + 0.05)});
      tl.fromTo("#ti-truco", { opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power4.out" }, ${r3(Lb.l7.start - 0.05)});
      tl.to("#ti-truco", { opacity: 0, duration: 0.12 }, ${r3(boardIn - 0.02)});
      tl.fromTo("#ti-cta", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.2 }, ${r3(tSig)});
      tl.fromTo("#ti-btn", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }, ${r3(tSig + 0.15)});
      tl.to("#ti-btn b", { scale: 0.9, duration: 0.08, ease: "power2.in" }, ${r3(tPura - 0.5)});
      tl.set("#ti-b1", { className: "on", textContent: "SIGUIENDO ✓" }, ${r3(tPura - 0.42)});
      tl.to("#ti-btn b", { scale: 1, duration: 0.3, ease: "back.out(3)" }, ${r3(tPura - 0.42)});
      tl.fromTo("#ti-pura", { opacity: 0, scale: 1.6, rotation: -6 }, { opacity: 1, scale: 1, rotation: -4, duration: 0.22, ease: "power4.out" }, ${r3(tPura)});
      tl.set(["#ti-plate","#ti-truco","#ti-cta","#ti-btn","#ti-pura"], { opacity: 0 }, 0);`));
}

// ========== SUBTÍTULOS ==========
{
  const groups = [];
  for (const L of LINES) {
    let cur = [];
    L.words.forEach((w, i) => {
      cur.push(w);
      const next = L.words[i + 1];
      const brk = !next || /[.,:!?]$/.test(w.text) || cur.length >= 3 || (next && next.start - w.end > 0.15);
      if (brk) { groups.push({ words: cur.map((x) => ({ ...x, a: L.start + x.start, b: L.start + x.end })) }); cur = []; }
    });
  }
  groups.forEach((g, i) => {
    g.start = r3(Math.max(0.12, g.words[0].a - 0.05));
    const nx = groups[i + 1];
    g.end = r3(g.words.at(-1).b + 0.15);
  });
  groups.forEach((g, i) => { const nx = groups[i + 1]; if (nx && g.end > nx.words[0].a - 0.05) g.end = r3(nx.words[0].a - 0.05); });
  const html = groups.map((g, i) => `      <div id="cap-g${i}" class="cg"><span class="bx">${g.words.map((w, j) => `<span id="cap-g${i}w${j}" class="${HOT.has(norm(w.text)) ? "hot" : ""}">${w.text.toUpperCase()}</span>`).join(" ")}</span></div>`).join("\n");
  const js = groups.map((g, i) => {
    const words = `      tl.fromTo("#cap-g${i} .bx", { scale: 0.82 }, { scale: 1, duration: 0.14, ease: "back.out(2.5)" }, ${g.start});`;
    return `      tl.set("#cap-g${i}", { opacity: 1, visibility: "visible" }, ${g.start});
${words}
      tl.to("#cap-g${i}", { opacity: 0, duration: 0.08, ease: "power2.in" }, ${r3(g.end - 0.08)});
      tl.set("#cap-g${i}", { opacity: 0, visibility: "hidden" }, ${g.end});`;
  }).join("\n");
  write("compositions/captions.html", scene("captions", `
    .cg { position: absolute; left: 60px; right: 60px; top: 1150px; text-align: center; opacity: 0; visibility: hidden;
          font: 900 92px/1.05 "Montserrat", sans-serif; color: #fff; -webkit-text-stroke: 12px ${INK}; paint-order: stroke fill; overflow: visible; }
    .cg span { display: inline-block; text-shadow: 0 8px 0 rgba(42,26,18,0.45); }
    .cg .bx { background: rgba(30,18,12,0.62); border-radius: 26px; padding: 8px 26px 14px; text-shadow: none; }
    .cg span.hot { color: ${YEL}; }`, html, js));
  fs.writeFileSync("captions.json", JSON.stringify(groups.map((g) => ({ start: g.start, end: g.end, text: g.words.map((w) => w.text).join(" ") })), null, 1));
}

// ========== AUDIO ==========
let sfx = [];
if (fs.existsSync("sfx.json")) sfx = JSON.parse(fs.readFileSync("sfx.json", "utf8"));
// sfx.json: [{id, src, at:"evento", vol}] ; eventos con tiempo:
const EV = {
  land: 0.2, nameplate: r3(at("l2", "Chef") - 0.1), click: r3(at("l8", "¡Pura") - 0.5), stampPura: at("l8", "¡Pura"),
};
fs.writeFileSync("events.json", JSON.stringify({ ...EV, total: TOTAL, cut: cutHookChef, carIn, boardIn, boardOut,
  liebigIn: SHOTS[1].start, juiceIn: Lb.l4.start, maiIn: SHOTS[2].start, truco: r3(Lb.l7.start - 0.05),
  oilLand: r3(SHOTS[1].start + 0.35 + 0.35), stamp: r3(at("l4", "toca!") - 0.55 + 0.2), pop: r3(at("l5", "almidón!") - 0.12),
  glue: r3(at("l5", "goma.") - 0.7), bottle: r3(at("l5", "goma.") - 0.3), slam: r3(carIn + Math.max(0.5, at("l6", "bloqueador,") - carIn + 0.2)),
  sombrilla: at("l6", "sombrilla!"), sobre: at("l7", "Bastante"), reposar: at("l7", "muévala"),
  lines: LINES.map((l) => [l.id, l.start, l.end]) }, null, 1));
const audioTags = [];
for (const L of LINES) if (L.src) audioTags.push(`      <audio id="vo-${L.id}" src="${L.src}" data-start="${L.start}" data-duration="${r3(L.dur)}" data-track-index="10" data-volume="1"></audio>`);
if (fs.existsSync("assets/music.wav")) audioTags.push(`      <audio id="music" src="assets/music.wav" data-start="0" data-duration="${TOTAL}" data-track-index="11" data-volume="1"></audio>`);
if (fs.existsSync("assets/sfx.wav")) audioTags.push(`      <audio id="sfx" src="assets/sfx.wav" data-start="0" data-duration="${TOTAL}" data-track-index="12" data-volume="1"></audio>`);
if (meta && meta.bgm && meta.bgm.path) {
  audioTags.push(`      <audio id="bgm" src="${meta.bgm.path.replace(/^\.?\/?/, "")}" data-start="0" data-duration="${TOTAL}" data-track-index="11" data-volume="0.14"></audio>`);
}
sfx.forEach((s, i) => {
  const st = r3(Math.max(0, (EV[s.at] ?? 0) + (s.offset || 0)));
  audioTags.push(`      <audio id="sfx-${i}" src="${s.src}" data-start="${st}" data-duration="${s.dur || 1.5}" data-track-index="12" data-volume="${s.vol ?? 0.5}"></audio>`);
});

// ========== RAÍZ ==========
const host = (id, s, e, z, track, kind = "graphics") =>
  `      <div id="${id}" class="clip" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${r3(s)}" data-duration="${r3(e - s)}" data-track-index="${track}" data-track-kind="${kind}" data-width="${W}" data-height="${H}" style="position:absolute;inset:0;z-index:${z}"></div>`;
const hosts = [
  host("chef", 0, TOTAL, 1, 0),
  ...SHOTS.map((s) => host(s.id, s.start, s.end, 2, 1)),
  host("titles", 0, TOTAL, 3, 2),
  host("captions", 0, TOTAL, 4, 3, "captions"),
];
write("index.html", `<!doctype html>
<html lang="es" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>Chef Chino Artavia · 02 · Aceite en la pasta</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <script src="assets/chef.js"></script>
    <script src="assets/env.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #f3eee5; }
      #root { position: relative; width: 100%; height: 100%; font-family: "Montserrat", sans-serif; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="${W}" data-height="${H}">
${hosts.join("\n")}
${audioTags.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`);
console.log(JSON.stringify({ total: TOTAL, lines: LINES.map((l) => [l.id, l.start, l.end, !!l.src]), shots: SHOTS }, null, 0));
