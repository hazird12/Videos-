// Genera index.html y compositions/*.html del video 01 a partir de la voz.
// node build.mjs            (usa audio_meta.json si existe; si no, tiempos estimados)
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const W = 1080, H = 1920, FPS = 30;
const INK = "#2a1a12", YEL = "#ffd23f", RED = "#e63b2e";
const GAP = 0.28, TAIL = 2.2;

const LINES = [
  { id: "l1", text: "¡Mae, el banano es una baya, y la fresa NO!" },
  { id: "l2", text: "Diay, soy el Chef Chino Artavia, y hoy le traigo un dato que nadie se cree." },
  { id: "l3", text: "Para los botánicos, una baya es una fruta que sale de una sola flor, con las semillas por dentro." },
  { id: "l4", text: "El banano cumple: sale de una flor, y esos puntitos negros del centro son sus semillitas." },
  { id: "l5", text: "¿Y la fresa? ¡Tiene las semillas por fuera! Y esos puntitos son, en realidad, sus frutitos." },
  { id: "l6", text: "Decirle baya a la fresa es como decirle pescado a la ballena, ¡solo porque vive en el agua!" },
  { id: "l7", text: "Y de bonus: el tomate, la uva y el chile dulce también son bayas." },
  { id: "l8", text: "Sígame pa' más secretos de cocina. ¡Pura vida!" },
];
// Palabras resaltadas en amarillo en los subtítulos
const HOT = new Set(["no", "baya", "bayas", "banano", "fresa", "chino", "artavia", "dato", "flor", "semillas", "dentro", "semillitas", "fuera", "frutitos", "pescado", "ballena", "bonus", "tomate", "uva", "chile", "secretos", "vida"]);

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
const cutHookChef = r3(at("l1", "NO!") + 0.55);
const carIn = r3(at("l6", "como") - 0.05);
const carOut = r3(Lb.l6.end + GAP * 0.6);
const boardIn = r3(at("l7", "tomate,") - 0.35);
const boardOut = r3(Lb.l7.end + GAP * 0.6);
const SHOTS = [
  { id: "fruits", start: 0, end: cutHookChef },
  { id: "flower", start: r3(Lb.l3.start - 0.14), end: r3(Lb.l4.start - 0.08) },
  { id: "banana", start: r3(Lb.l4.start - 0.08), end: r3(Lb.l5.start + 0.1) },
  { id: "berry", start: r3(Lb.l5.start + 0.1), end: r3(Lb.l6.start - 0.05) },
  { id: "whale", start: carIn, end: carOut },
  { id: "bonus", start: boardIn, end: boardOut },
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
    [Lb.l3.start, "rest"], [Lb.l6.start, "explain"], [at("l6", "fresa"), "door"],
    [Lb.l7.start, "present"], [Lb.l8.start, "point"], [at("l8", "Pura"), "thumbs"],
  ].map(([a, b]) => [r3(a), b]);
  const face = [
    [0, "serious"], [cutHookChef, "serious"], [at("l2", "Diay"), "happy"], [at("l2", "dato"), "sly"],
    [Lb.l6.start, "sly"], [at("l6", "es"), "nope"], [Lb.l7.start, "wow"], [at("l7", "tomate,") - 0.3, "happy"],
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
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BAN = "#f7d33c", BAN_D = "#d9a92a", STR = "#e8343f", LEAF = "#3fa34d", PINK = "#f58fb5", GRN = "#2fa36b";
// banano entero (centro cx,cy; escala s)
const BANANA = (id, cx, cy, s = 1) => `<g id="${id}"><g transform="translate(${cx} ${cy}) scale(${s})" stroke="${INK}" stroke-width="${(9 / s).toFixed(1)}" stroke-linejoin="round">
  <path d="M-230 -60 Q-120 170 120 140 Q230 120 260 30 Q170 90 60 80 Q-110 70 -190 -90 Z" fill="${BAN}"/>
  <path d="M-200 -70 Q-110 90 70 100" fill="none" stroke="${BAN_D}" stroke-width="${(8 / s).toFixed(1)}"/>
  <path d="M-190 -90 L-230 -60 L-250 -110 L-215 -125 Z" fill="#7a5a2a"/>
  <path d="M250 25 L262 32 L272 22" fill="#5a4020"/>
</g></g>`;
// fresa
const STRAW = (id, cx, cy, s = 1, dots = true) => {
  const R = rng(5); let d = "";
  if (dots) for (let i = 0; i < 26; i++) { const x = -110 + R() * 220, y = -40 + R() * 210; if (Math.abs(x) < 120 - (y + 40) * 0.42) d += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="7" ry="10" fill="#f6d55c" stroke="${INK}" stroke-width="3"/>`; }
  return `<g id="${id}"><g transform="translate(${cx} ${cy}) scale(${s})" stroke="${INK}" stroke-width="${(9 / s).toFixed(1)}" stroke-linejoin="round">
  <path d="M0 200 Q-150 120 -140 -10 Q-130 -80 -40 -80 Q0 -60 40 -80 Q130 -80 140 -10 Q150 120 0 200 Z" fill="${STR}"/>
  <path d="M-60 -50 Q-90 30 -60 110" fill="none" stroke="#f26b73" stroke-width="${(14 / s).toFixed(1)}" stroke-linecap="round"/>
  ${d}
  <path d="M0 -70 L-80 -100 L-30 -110 L-50 -150 L0 -120 L50 -150 L30 -110 L80 -100 Z" fill="${LEAF}"/>
  <path d="M0 -125 L5 -170" stroke-width="${(10 / s).toFixed(1)}" fill="none"/>
</g></g>`;
};
const CHECK = (id, x, y, ok) => `<g id="${id}" transform="translate(${x} ${y})"><circle r="62" fill="${ok ? GRN : RED}" stroke="${INK}" stroke-width="9"/>${ok ? `<path d="M-28 2 L-6 24 L30 -22" stroke="#fff" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="M-24 -24 L24 24 M24 -24 L-24 24" stroke="#fff" stroke-width="16" stroke-linecap="round"/>`}</g>`;

// ----- fruits: el gancho -----
{
  const S = SHOTS.find((s) => s.id === "fruits");
  const D = r3(S.end - S.start);
  write("compositions/fruits.html", scene("fruits", `
    #fr-cam { position: absolute; inset: 0; transform-origin: 540px 1000px; }`,
`    <div id="fr-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#ffe7a3"/>
        ${Array.from({ length: 12 }, (_, i) => `<path d="M540 1000 L${(540 + Math.cos((i / 12) * Math.PI * 2) * 1400).toFixed(0)} ${(1000 + Math.sin((i / 12) * Math.PI * 2) * 1400).toFixed(0)} L${(540 + Math.cos(((i + 0.5) / 12) * Math.PI * 2) * 1400).toFixed(0)} ${(1000 + Math.sin(((i + 0.5) / 12) * Math.PI * 2) * 1400).toFixed(0)} Z" fill="#ffdc85"/>`).join("")}
        <ellipse cx="300" cy="1150" rx="230" ry="36" fill="#e8c26a"/><ellipse cx="800" cy="1150" rx="160" ry="30" fill="#e8c26a"/>
        ${BANANA("fr-ban", 290, 960, 0.95)}
        ${STRAW("fr-str", 800, 930, 1.05)}
        ${CHECK("fr-ok", 290, 760, true)}
        ${CHECK("fr-no", 800, 700, false)}
      </svg>
    </div>`,
`      tl.fromTo("#fr-ban", { y: -700 }, { y: 0, duration: 0.4, ease: "bounce.out" }, 0);
      tl.fromTo("#fr-str", { y: -700 }, { y: 0, duration: 0.45, ease: "bounce.out" }, 0.12);
      tl.fromTo("#fr-ok", { scale: 0, svgOrigin: "290 760" }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, ${r3(Math.max(0.5, rel(at("l1", "baya,"), 0)))});
      tl.fromTo("#fr-no", { scale: 0, svgOrigin: "800 700" }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, ${r3(rel(at("l1", "NO!"), 0))});
      tl.fromTo("#fr-cam", { scale: 1 }, { scale: 1.08, duration: ${D}, ease: "power2.out" }, 0);`));
}

// ----- flower: qué es una baya -----
{
  const S = SHOTS.find((s) => s.id === "flower");
  const D = r3(S.end - S.start);
  const tSola = rel(at("l3", "sola"), S.start), tSem = rel(at("l3", "semillas"), S.start);
  const petals = [0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * 360; return `<ellipse id="fl-p${i}" cx="0" cy="-95" rx="58" ry="92" fill="${PINK}" stroke="${INK}" stroke-width="8" transform="rotate(${a})"/>`; }).join("");
  write("compositions/flower.html", scene("flower", TITLE_CSS + `
    #fl-cam { position: absolute; inset: 0; }
    #fl-t1 { top: 215px; font-size: 84px; }
    #fl-t2 { top: 215px; font-size: 84px; }`,
`    <div id="fl-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#d8f0d0"/>
        <path d="M540 1300 Q520 1000 540 840" stroke="${INK}" stroke-width="40" fill="none" stroke-linecap="round"/>
        <path d="M540 1300 Q520 1000 540 840" stroke="${GRN}" stroke-width="26" fill="none" stroke-linecap="round"/>
        <path d="M535 1080 Q420 1000 380 1060 Q450 1120 535 1090 Z" fill="${GRN}" stroke="${INK}" stroke-width="8"/>
        <g id="fl-flower" transform="translate(540 700)">
          <g id="fl-petals">${petals}</g>
          <circle id="fl-ovary" r="60" fill="#8fd16a" stroke="${INK}" stroke-width="8"/>
          <!-- la fruta que crece: corte con semillas adentro -->
          <g id="fl-fruit" opacity="0">
            <circle r="190" fill="#9b3fb5" stroke="${INK}" stroke-width="10"/>
            <circle r="150" fill="#c97ad9"/>
            ${[[0, -70], [60, -30], [55, 45], [-5, 80], [-60, 40], [-62, -35]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="16" ry="24" fill="#f4e7c3" stroke="${INK}" stroke-width="5" transform="rotate(${Math.atan2(y, x) * 57.3 + 90} ${x} ${y})"/>`).join("")}
          </g>
        </g>
        <g id="fl-one" transform="translate(860 520)" opacity="0"><circle r="70" fill="${YEL}" stroke="${INK}" stroke-width="8"/><text y="28" text-anchor="middle" font-family="Archivo Black" font-size="84" fill="${INK}">1</text></g>
      </svg>
    </div>
    <div id="fl-t1" class="t">UNA BAYA SALE<br>DE <span class="y">UNA SOLA FLOR</span></div>
    <div id="fl-t2" class="t">CON LAS <span class="y">SEMILLAS</span><br>POR DENTRO</div>`,
`      tl.fromTo("#fl-cam", { y: 1920 }, { y: 0, duration: 0.45, ease: "expo.out" }, 0);
      for (let i = 0; i < 5; i++) tl.fromTo("#fl-p" + i, { scale: 0, svgOrigin: "540 700" }, { scale: 1, duration: 0.35, ease: "back.out(2)" }, 0.3 + i * 0.06);
      tl.fromTo("#fl-t1", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, 0.35);
      tl.fromTo("#fl-one", { opacity: 0, scale: 0.3, svgOrigin: "860 520" }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, ${r3(tSola)});
      tl.to("#fl-t1", { opacity: 0, filter: "blur(6px)", duration: 0.13 }, ${r3(tSem - 0.75)});
      tl.to("#fl-one", { opacity: 0, duration: 0.15 }, ${r3(tSem - 0.2)});
      for (let i = 0; i < 5; i++) tl.to("#fl-p" + i, { y: 900, rotation: 80 * (i % 2 ? 1 : -1), opacity: 0, duration: 0.7, ease: "power2.in" }, ${r3(tSem - 0.8)} + i * 0.05);
      tl.fromTo("#fl-fruit", { opacity: 0, scale: 0.3, svgOrigin: "540 700" }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, ${r3(tSem - 0.55)});
      tl.fromTo("#fl-t2", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, ${r3(tSem - 0.45)});
      tl.set(["#fl-t2"], { opacity: 0 }, 0);`));
}

// ----- banana: el banano sí es baya -----
{
  const S = SHOTS.find((s) => s.id === "banana");
  const D = r3(S.end - S.start);
  const tFlor = rel(at("l4", "flor,"), S.start), tPun = rel(at("l4", "puntitos"), S.start), tSem = rel(at("l4", "semillitas."), S.start);
  const R = rng(41);
  let seeds = "";
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const r = 46 + (i % 2) * 14; seeds += `<ellipse cx="${(Math.cos(a) * r).toFixed(0)}" cy="${(Math.sin(a) * r).toFixed(0)}" rx="7" ry="10" fill="#2a1a12"/>`; }
  write("compositions/banana.html", scene("banana", TITLE_CSS + `
    #ba-cam { position: absolute; inset: 0; transform-origin: 540px 860px; }
    #ba-t1 { top: 215px; font-size: 84px; }
    #ba-lbl { position: absolute; left: 330px; top: 1000px; font: 900 54px/1 "Archivo Black", sans-serif; color: ${INK}; background: ${YEL}; border: 7px solid ${INK}; border-radius: 16px; padding: 10px 20px 14px; }
    #ba-stamp { position: absolute; left: 0; right: 0; top: 380px; text-align: center; }
    #ba-stamp span { display: inline-block; font: 900 110px/1 "Archivo Black", sans-serif; color: #fff; background: ${GRN}; border: 10px solid ${INK}; border-radius: 22px; padding: 14px 40px 22px; }`,
`    <div id="ba-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#fff4cc"/>
        <rect x="80" y="1180" width="920" height="80" rx="30" fill="#c08a55" stroke="${INK}" stroke-width="10"/>
        ${BANANA("ba-whole", 330, 1050, 0.75)}
        <!-- rodaja de banano en corte -->
        <g id="ba-slice" transform="translate(600 820)">
          <circle r="250" fill="${BAN}" stroke="${INK}" stroke-width="12"/>
          <circle r="220" fill="#fbf3d0"/>
          <path d="M0 -150 Q30 -40 130 75 Q0 40 -130 75 Q-30 -40 0 -150 Z" fill="#f5e6b0" opacity="0.8"/>
          <g id="ba-seeds">${seeds}</g>
        </g>
        <!-- lupa -->
        <g id="ba-lens" stroke="${INK}" stroke-width="12">
          <circle cx="600" cy="820" r="120" fill="#ffffff" fill-opacity="0.25"/>
          <path d="M690 910 L800 1020" stroke-width="34" stroke-linecap="round"/>
        </g>
        <g id="ba-flower" transform="translate(860 560)" opacity="0">${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="0" cy="-40" rx="26" ry="40" fill="${PINK}" stroke="${INK}" stroke-width="6" transform="rotate(${i * 72})"/>`).join("")}<circle r="26" fill="#8fd16a" stroke="${INK}" stroke-width="6"/></g>
      </svg>
    </div>
    <div id="ba-lbl">SEMILLITAS</div>
    <div id="ba-t1" class="t">EL <span class="y">BANANO</span>…</div>
    <div id="ba-stamp"><span>¡ES BAYA!</span></div>`,
`      tl.fromTo("#ba-cam", { x: 1080 }, { x: 0, duration: 0.4, ease: "expo.out" }, 0);
      tl.fromTo("#ba-t1", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, 0.3);
      tl.fromTo("#ba-flower", { opacity: 0, scale: 0.3, svgOrigin: "860 560" }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)" }, ${r3(tFlor - 0.15)});
      tl.fromTo("#ba-slice", { scale: 0.2, rotation: -90, svgOrigin: "600 820" }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(1.6)" }, 0.2);
      tl.fromTo("#ba-lens", { x: 300, y: 300, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, ${r3(tPun - 0.35)});
      tl.fromTo("#ba-cam", { scale: 1 }, { scale: 1.35, duration: 0.6, ease: "power2.inOut" }, ${r3(tPun - 0.2)});
      tl.fromTo("#ba-seeds", { scale: 1, svgOrigin: "0 0" }, { scale: 1.25, duration: 0.15, yoyo: true, repeat: 3 }, ${r3(tPun + 0.3)});
      tl.fromTo("#ba-lbl", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" }, ${r3(tSem - 0.2)});
      tl.to("#ba-t1", { opacity: 0, duration: 0.12 }, ${r3(tSem + 0.3)});
      tl.fromTo("#ba-stamp", { opacity: 0, scale: 2.2, rotation: -10 }, { opacity: 1, scale: 1, rotation: -5, duration: 0.2, ease: "power4.in" }, ${r3(tSem + 0.35)});
      tl.set("#ba-stamp", { opacity: 0 }, 0);`));
}

// ----- berry: la fresa tiene las semillas por fuera -----
{
  const S = SHOTS.find((s) => s.id === "berry");
  const D = r3(S.end - S.start);
  const tFue = rel(at("l5", "fuera!"), S.start), tPun = rel(at("l5", "puntitos"), S.start), tFru = rel(at("l5", "frutitos."), S.start);
  write("compositions/berry.html", scene("berry", TITLE_CSS + `
    #be-cam { position: absolute; inset: 0; transform-origin: 650px 830px; }
    #be-t0 { top: 215px; font-size: 84px; }
    #be-t1 { top: 215px; font-size: 84px; }
    #be-t2 { top: 215px; font-size: 76px; }`,
`    <div id="be-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#ffe1e4"/>
        <ellipse cx="540" cy="1240" rx="260" ry="40" fill="#f2bcc2"/>
        ${STRAW("be-str", 540, 920, 1.9)}
        <g id="be-arrows" stroke="${INK}" stroke-width="8" fill="${YEL}" stroke-linejoin="round" opacity="0">
          <path d="M150 760 L270 800 L250 770 L330 780 L320 820 L280 815 L300 840 Z"/>
          <path d="M930 980 L810 1000 L835 975 L760 965 L770 925 L810 935 L795 905 Z"/>
        </g>
        <!-- zoom a un "puntito": frutito con su semilla -->
        <g id="be-zoom" opacity="0">
          <circle cx="760" cy="560" r="170" fill="#fff" stroke="${INK}" stroke-width="12"/>
          <ellipse cx="760" cy="560" rx="70" ry="105" fill="#f6d55c" stroke="${INK}" stroke-width="8"/>
          <ellipse cx="760" cy="575" rx="30" ry="52" fill="#c98a3c" stroke="${INK}" stroke-width="6"/>
          <path d="M640 690 L650 760" stroke="${INK}" stroke-width="10"/>
          <text x="760" y="790" text-anchor="middle" font-family="Archivo Black" font-size="56" fill="${INK}">FRUTITO</text>
        </g>
      </svg>
    </div>
    <div id="be-t0" class="t">¿Y LA <span class="y">FRESA</span>?</div>
    <div id="be-t1" class="t">¡SEMILLAS<br><span class="y">POR FUERA</span>!</div>
    <div id="be-t2" class="t">CADA PUNTITO<br>= UN <span class="y">FRUTITO</span></div>`,
`      tl.fromTo("#be-cam", { x: -1080 }, { x: 0, duration: 0.4, ease: "expo.out" }, 0);
      tl.fromTo("#be-str", { rotation: -8, svgOrigin: "540 920" }, { rotation: 8, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: ${Math.max(0, Math.floor(D / 0.9) - 1)} }, 0);
      tl.fromTo("#be-t0", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, 0.25);
      tl.to("#be-t0", { opacity: 0, duration: 0.12 }, ${r3(tFue - 0.75)});
      tl.fromTo("#be-t1", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power4.out" }, ${r3(tFue - 0.7)});
      tl.fromTo("#be-arrows", { opacity: 0 }, { opacity: 1, duration: 0.2 }, ${r3(tFue - 0.5)});
      tl.to(["#be-t1", "#be-arrows"], { opacity: 0, duration: 0.12 }, ${r3(tPun - 0.1)});
      tl.fromTo("#be-cam", { scale: 1 }, { scale: 1.12, duration: 0.6, ease: "power2.inOut" }, ${r3(tPun - 0.2)});
      tl.fromTo("#be-zoom", { opacity: 0, scale: 0.2, svgOrigin: "650 760" }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, ${r3(tPun)});
      tl.fromTo("#be-t2", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, ${r3(tFru - 0.6)});
      tl.set(["#be-t1", "#be-t2"], { opacity: 0 }, 0);`));
}

// ----- whale: ¿la ballena es pescado? -----
{
  const S = SHOTS.find((s) => s.id === "whale");
  const D = r3(S.end - S.start);
  const tPes = rel(at("l6", "pescado"), S.start), tAgua = rel(at("l6", "agua!"), S.start);
  write("compositions/whale.html", scene("whale", TITLE_CSS + `
    #wh-world { position: absolute; inset: 0; }
    #wh-t1 { top: 215px; font-size: 92px; }`,
`    <div id="wh-world">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#bfe3ea"/>
        <rect y="900" width="1080" height="1020" fill="#3f9fc8"/>
        <g id="wh-whale" stroke="${INK}" stroke-width="10" stroke-linejoin="round">
          <path d="M180 900 Q200 700 480 680 Q760 670 820 820 Q860 760 940 700 Q930 800 880 860 Q960 880 980 960 Q900 940 840 920 Q800 1000 560 1010 Q260 1020 180 900 Z" fill="#4a7fc0"/>
          <path d="M210 930 Q330 1000 560 990 Q700 985 790 940" fill="#bcd6ee" stroke-width="8"/>
          <circle cx="320" cy="830" r="16" fill="${INK}"/><circle cx="326" cy="824" r="5" fill="#fff" stroke="none"/>
          <path d="M240 900 Q280 920 320 905" fill="none"/>
          <g id="wh-spout" fill="#fff" stroke-width="7"><path d="M460 680 Q420 560 380 520 Q440 540 460 600 Q480 520 540 500 Q500 560 470 680 Z"/></g>
        </g>
        <path d="M0 920 q60 -26 120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0 t120 0" stroke="#fff" stroke-width="10" fill="none"/>
        <!-- rótulo PESCADO tachado -->
        <g id="wh-sign"><g transform="translate(760 520) rotate(6)">
          <rect x="-190" y="-70" width="380" height="140" rx="16" fill="#e9c98b" stroke="${INK}" stroke-width="9"/>
          <text y="24" text-anchor="middle" font-family="Archivo Black" font-size="68" fill="${INK}">PESCADO</text>
          <path id="wh-x" d="M-170 -60 L170 60 M170 -60 L-170 60" stroke="${RED}" stroke-width="22" stroke-linecap="round"/>
        </g></g>
      </svg>
      <div id="wh-t1" class="t">¿LA <span class="y">BALLENA</span>…<br>UN PESCADO?</div>
    </div>`,
`      tl.fromTo("#wh-world", { clipPath: "circle(0% at 540px 960px)" }, { clipPath: "circle(120% at 540px 960px)", duration: 0.35, ease: "power2.out" }, 0);
      tl.set("#wh-whale", { y: 300 }, 0);
      tl.fromTo("#wh-whale", { y: 300 }, { y: 0, duration: 0.6, ease: "back.out(1.6)" }, 0.05);
      tl.fromTo("#wh-whale", { y: 0 }, { y: 18, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: ${Math.max(0, Math.floor((D - 0.7) / 0.7) - 1)} }, 0.7);
      tl.fromTo("#wh-spout", { scaleY: 0, svgOrigin: "465 680" }, { scaleY: 1, duration: 0.35, ease: "back.out(2)" }, 0.5);
      tl.fromTo("#wh-t1", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, 0.3);
      tl.fromTo("#wh-sign", { opacity: 0, y: -200 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, ${r3(Math.max(0.4, tPes - 0.2))});
      tl.fromTo("#wh-x", { opacity: 0, scale: 1.6, svgOrigin: "0 0" }, { opacity: 1, scale: 1, duration: 0.18, ease: "power4.in" }, ${r3(tAgua + 0.15)});
      tl.set("#wh-x", { opacity: 0 }, 0);`));
}

// ----- bonus: tomate, uva y chile dulce -----
{
  const S = SHOTS.find((s) => s.id === "bonus");
  const D = r3(S.end - S.start);
  const tTom = rel(at("l7", "tomate,"), S.start), tUva = rel(at("l7", "uva"), S.start), tChi = rel(at("l7", "chile"), S.start);
  const grapes = [[0, -90], [-50, -40], [50, -40], [-90, 15], [0, 15], [90, 15], [-50, 70], [50, 70], [0, 125]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="44" fill="#7b3fa3" stroke="${INK}" stroke-width="8"/><circle cx="${x - 14}" cy="${y - 14}" r="10" fill="#a97ad0"/>`).join("");
  write("compositions/bonus.html", scene("bonus", TITLE_CSS + `
    #bo-cam { position: absolute; inset: 0; }
    #bo-t1 { top: 215px; font-size: 76px; }`,
`    <div id="bo-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <rect width="1080" height="1920" fill="#e7f6dc"/>
        <rect x="60" y="1080" width="960" height="60" rx="26" fill="#c08a55" stroke="${INK}" stroke-width="10"/>
        <g id="bo-tom" transform="translate(220 920)" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <ellipse rx="150" ry="135" fill="#e8402f"/><ellipse cx="-50" cy="-50" rx="36" ry="20" fill="#f47a6a" stroke="none"/>
          <path d="M0 -130 L-60 -160 L-20 -150 L-40 -200 L0 -160 L40 -200 L20 -150 L60 -160 Z" fill="${LEAF}"/>
        </g>
        <g id="bo-uva" transform="translate(540 900)">
          <path d="M0 -150 L10 -190" stroke="${INK}" stroke-width="12"/><path d="M10 -170 Q70 -210 110 -170 Q60 -150 10 -170 Z" fill="${LEAF}" stroke="${INK}" stroke-width="7"/>
          ${grapes}
        </g>
        <g id="bo-chi" transform="translate(860 920)" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <path d="M-110 -80 Q-130 60 -80 130 Q-40 160 0 120 Q40 160 80 130 Q130 60 110 -80 Q60 -120 0 -95 Q-60 -120 -110 -80 Z" fill="#d93b2b"/>
          <path d="M-60 -60 Q-80 40 -50 110" stroke="#f0705f" stroke-width="16" fill="none" stroke-linecap="round"/>
          <path d="M-30 -100 Q0 -120 30 -100 L20 -150 L-10 -150 Z" fill="${LEAF}"/>
        </g>
        ${CHECK("bo-c1", 220, 720, true)}${CHECK("bo-c2", 540, 680, true)}${CHECK("bo-c3", 860, 720, true)}
      </svg>
    </div>
    <div id="bo-t1" class="t">TAMBIÉN SON <span class="y">BAYAS</span></div>`,
`      tl.fromTo("#bo-cam", { y: 1920 }, { y: 0, duration: 0.4, ease: "expo.out" }, 0);
      tl.fromTo("#bo-t1", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, 0.3);
      [["#bo-tom", ${r3(Math.max(0.15, tTom - 0.15))}, "220 920", "#bo-c1", "220 720"], ["#bo-uva", ${r3(tUva - 0.15)}, "540 900", "#bo-c2", "540 680"], ["#bo-chi", ${r3(tChi - 0.15)}, "860 920", "#bo-c3", "860 720"]].forEach(([el, t, o, c, oc]) => {
        tl.fromTo(el, { scale: 0, svgOrigin: o }, { scale: 1, duration: 0.35, ease: "back.out(2.5)" }, t);
        tl.fromTo(c, { scale: 0, svgOrigin: oc }, { scale: 1, duration: 0.3, ease: "back.out(3)" }, t + 0.25);
      });`));
}

// ========== TÍTULOS SOBRE EL CHEF ==========
{
  const tNo = rel(at("l1", "NO!"), 0);
  const tChef = at("l2", "Chef"), tTruco = at("l7", "bonus:");
  const tSig = at("l8", "Sígame"), tPura = at("l8", "¡Pura");
  write("compositions/titles.html", scene("titles", TITLE_CSS + `
    #ti-hook { top: 215px; font-size: 84px; left: 70px; right: 70px; padding: 18px 10px 26px; background: rgba(30,18,12,0.62); border-radius: 30px; }
    #ti-hook .l2 { font-size: 128px; } #ti-hook .l1 { font-size: 72px; }
    #ti-hook .nobox { color: #fff; background: #c62a1f; border-radius: 18px; padding: 0 18px 8px; -webkit-text-stroke: 0; text-shadow: none; }
    #ti-plate { position: absolute; left: 90px; right: 90px; top: 210px; text-align: center; }
    #ti-plate .nm { display: inline-block; background: ${RED}; color: #fff; font: 900 74px/1 "Archivo Black", sans-serif; padding: 20px 34px 24px; border: 8px solid ${INK}; border-radius: 16px; }
    #ti-plate .sub { display: inline-block; margin-top: 14px; background: ${YEL}; color: ${INK}; font: 800 44px/1 "Montserrat", sans-serif; padding: 12px 24px; border: 6px solid ${INK}; border-radius: 12px; }
    #ti-truco { top: 220px; font-size: 130px; }
    #ti-cta { top: 200px; font-size: 66px; }
    #ti-btn { position: absolute; left: 0; right: 0; top: 330px; text-align: center; }
    #ti-btn b { display: inline-block; font: 900 64px/1 "Archivo Black", sans-serif; color: #fff; background: ${RED}; padding: 22px 50px 26px; border: 8px solid ${INK}; border-radius: 24px; box-shadow: 0 10px 0 ${INK}; }
    #ti-btn b.on { background: #3d3d40; }
    #ti-pura { top: 470px; font-size: 128px; color: ${YEL}; }`,
`    <div id="ti-hook" class="t"><span class="l1">EL BANANO ES <span class="y">BAYA</span></span><br><span class="l2">LA FRESA <span class="r nobox">NO</span></span></div>
    <div id="ti-plate"><div class="nm">CHEF CHINO ARTAVIA</div><br><div class="sub">Datos curiosos #3</div></div>
    <div id="ti-truco" class="t">¡<span class="y">BONUS</span>!</div>
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
  land: 0.25, nameplate: r3(at("l2", "Chef") - 0.1), click: r3(at("l8", "¡Pura") - 0.5), stampPura: at("l8", "¡Pura"),
};
fs.writeFileSync("events.json", JSON.stringify({ ...EV, total: TOTAL, cut: cutHookChef, carIn, boardIn, boardOut,
  liebigIn: SHOTS[1].start, juiceIn: Lb.l4.start, maiIn: SHOTS[3].start, banIn: SHOTS[2].start, truco: r3(Lb.l7.start - 0.05),
  ok: r3(Math.max(0.5, at("l1", "baya,"))), no: at("l1", "NO!"), sola: at("l3", "sola"), fruit: r3(at("l3", "semillas") - 0.55),
  flor: r3(at("l4", "flor,") - 0.15), lens: r3(at("l4", "puntitos") - 0.35), stamp: r3(at("l4", "semillitas.") + 0.55),
  fuera: r3(at("l5", "fuera!") - 0.7), zoom: at("l5", "puntitos"), spout: r3(carIn + 0.5), x: r3(at("l6", "agua!") + 0.33), slam: r3(at("l6", "agua!") + 0.33),
  items: [at("l7", "tomate,"), at("l7", "uva"), at("l7", "chile")].map((t) => r3(t - 0.15)),
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
    <title>Chef Chino Artavia · 03 · Banano y fresa</title>
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
