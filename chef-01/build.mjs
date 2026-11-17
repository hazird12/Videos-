// Genera index.html y compositions/*.html del video 01 a partir de la voz.
// node build.mjs            (usa audio_meta.json si existe; si no, tiempos estimados)
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const W = 1080, H = 1920, FPS = 30;
const INK = "#2a1a12", YEL = "#ffd23f", RED = "#e63b2e";
const GAP = 0.28, TAIL = 2.2;

const LINES = [
  { id: "l1", text: "¡Mae, sellar la carne NO le guarda los jugos!" },
  { id: "l2", text: "Diay, soy el Chef Chino Artavia, y hoy le rompo un mito." },
  { id: "l3", text: "Hace casi 200 años, un químico alemán dijo que dorar la carne cerraba los poros." },
  { id: "l4", text: "Pero vea: la carne sigue soltando líquido. ¡Ese chisporroteo es jugo saliendo!" },
  { id: "l5", text: "Entonces, ¿pa' qué se sella? ¡Por sabor! Con el calor fuerte pasa la reacción de Maillard: esta costrita dorada." },
  { id: "l6", text: "Sellar pa' guardar el jugo es como cerrarle la puerta al carro con las ventanas abiertas." },
  { id: "l7", text: "¿El verdadero truco? No la sobrecocine y déjela reposar." },
  { id: "l8", text: "Sígame pa' más secretos de cocina. ¡Pura vida!" },
];
// Palabras resaltadas en amarillo en los subtítulos
const HOT = new Set(["no", "jugos", "chino", "artavia", "mito", "poros", "líquido", "jugo", "sabor", "maillard", "dorada", "ventanas", "abiertas", "truco", "reposar", "sobrecocine", "secretos", "vida"]);

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
const carIn = r3(at("l6", "al") - 0.05);
const carOut = r3(Lb.l6.end + GAP * 0.6);
const boardIn = r3(at("l7", "No") - 0.08);
const boardOut = r3(Lb.l7.end + GAP * 0.6);
const SHOTS = [
  // panel, inicio, fin
  { id: "pan", start: 0, end: cutHookChef },
  { id: "liebig", start: r3(Lb.l3.start - 0.14), end: r3(Lb.l4.start + 0.45) },
  { id: "juice", start: r3(Lb.l4.start + 0.45), end: r3(Lb.l5.start - 0.08) },
  { id: "maillard", start: r3(Lb.l5.start - 0.08), end: r3(Lb.l6.start - 0.05) },
  { id: "car", start: carIn, end: carOut },
  { id: "board", start: boardIn, end: boardOut },
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
    [Lb.l3.start, "rest"], [Lb.l6.start, "explain"], [at("l6", "puerta"), "door"],
    [Lb.l7.start, "shrug"], [Lb.l8.start, "point"], [at("l8", "Pura"), "thumbs"],
  ].map(([a, b]) => [r3(a), b]);
  const face = [
    [0, "serious"], [cutHookChef, "serious"], [at("l2", "Diay"), "happy"], [at("l2", "mito"), "sly"],
    [Lb.l6.start, "sly"], [at("l6", "ventanas"), "nope"], [Lb.l7.start, "wow"], [at("l7", "No") - 0.3, "serious"],
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
const PAN_SVG = (id, steak) => `
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0">
        <rect width="1080" height="1920" fill="#8e969c"/>
        <g stroke="#6f777d" stroke-width="10" opacity="0.6">
          <path d="M0 520 H1080 M0 1480 H1080 M140 0 V1920 M940 0 V1920"/>
        </g>
        <g id="${id}-panwrap">
          <rect x="840" y="1180" width="420" height="96" rx="40" fill="#2f2f33" stroke="${INK}" stroke-width="10" transform="rotate(32 860 1220)"/>
          <circle cx="540" cy="1000" r="440" fill="#3a3a3f" stroke="${INK}" stroke-width="12"/>
          <circle cx="540" cy="1000" r="392" fill="#232327"/>
          <ellipse cx="470" cy="900" rx="230" ry="120" fill="#4a4a52" opacity="0.5"/>
          ${steak}
        </g>
      </svg>`;
const RAW_STEAK = (id) => `
          <g id="${id}">
            <path d="M330 860 Q360 760 520 770 Q690 760 750 860 Q800 980 730 1090 Q640 1200 500 1180 Q360 1170 320 1060 Q290 960 330 860 Z" fill="#f1e2d4" stroke="${INK}" stroke-width="10"/>
            <path d="M360 880 Q390 800 520 805 Q660 800 715 880 Q760 980 700 1070 Q620 1160 505 1145 Q385 1135 352 1050 Q330 960 360 880 Z" fill="#c2414b"/>
            <path d="M420 900 q60 30 120 -10 q50 40 110 20 M400 990 q90 40 170 -20 q40 30 90 10 M450 1080 q60 -30 140 10" stroke="#f3d3c8" stroke-width="12" fill="none" stroke-linecap="round"/>
          </g>`;
const SEARED_STEAK = (id) => `
          <g id="${id}">
            <path d="M330 860 Q360 760 520 770 Q690 760 750 860 Q800 980 730 1090 Q640 1200 500 1180 Q360 1170 320 1060 Q290 960 330 860 Z" fill="#c98a4a" stroke="${INK}" stroke-width="10"/>
            <path d="M360 880 Q390 800 520 805 Q660 800 715 880 Q760 980 700 1070 Q620 1160 505 1145 Q385 1135 352 1050 Q330 960 360 880 Z" fill="#7a4423"/>
            <g fill="#a8622f">
              <ellipse cx="450" cy="900" rx="60" ry="26"/><ellipse cx="610" cy="940" rx="70" ry="30"/><ellipse cx="500" cy="1040" rx="80" ry="34"/>
              <ellipse cx="650" cy="1060" rx="40" ry="20"/><ellipse cx="400" cy="1000" rx="30" ry="16"/>
            </g>
            <g fill="#d99a4e">
              <ellipse cx="470" cy="895" rx="26" ry="10"/><ellipse cx="625" cy="932" rx="30" ry="12"/><ellipse cx="520" cy="1032" rx="34" ry="13"/>
            </g>
            <g fill="#4a2814">
              <circle cx="560" cy="880" r="9"/><circle cx="430" cy="1080" r="11"/><circle cx="690" cy="1000" r="8"/><circle cx="580" cy="1110" r="10"/>
            </g>
          </g>`;

// semilla determinista
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ----- pan: el gancho -----
{
  const S = SHOTS.find((s) => s.id === "pan");
  const D = r3(S.end - S.start);
  const R = rng(3);
  const drops = Array.from({ length: 16 }, (_, i) => {
    const a = R() * Math.PI * 2, d = 380 + R() * 260;
    return { x: 540 + Math.cos(a) * 200, y: 980 + Math.sin(a) * 130, dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.7 - 120, r: 6 + R() * 8 };
  });
  const steam = [0, 1, 2, 3, 4].map((i) => ({ x: 380 + i * 80, d: `M0 0 q-30 -60 0 -120 q30 -60 0 -120` }));
  write("compositions/pan.html", scene("pan", `
    #pan-cam { position: absolute; inset: 0; transform-origin: 540px 1000px; }`,
`    <div id="pan-cam">${PAN_SVG("pan", RAW_STEAK("pan-steak"))}
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <g id="pan-drops">${drops.map((d, i) => `<circle id="pan-d${i}" cx="${d.x.toFixed(0)}" cy="${d.y.toFixed(0)}" r="${d.r.toFixed(1)}" fill="#f7e7b0" stroke="${INK}" stroke-width="3"/>`).join("")}</g>
        <g id="pan-steam" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round">${steam.map((s, i) => `<path id="pan-s${i}" d="${s.d}" transform="translate(${s.x} 860)" opacity="0"/>`).join("")}</g>
      </svg>
    </div>`,
`      const land = 0.42;
      tl.fromTo("#pan-steak", { y: -520, scale: 1.25, rotation: -14, svgOrigin: "540 980" }, { y: 0, scale: 1, rotation: 0, duration: land, ease: "power3.in" }, 0);
      tl.fromTo("#pan-steak", { scaleY: 0.86, scaleX: 1.08 }, { scaleY: 1, scaleX: 1, duration: 0.3, ease: "back.out(3)" }, land);
      // sacudida de cámara al caer
      [[14,-10],[-12,8],[9,6],[-6,-5],[3,3],[0,0]].forEach(([x,y],i)=>tl.to("#pan-cam",{x,y,duration:0.045,ease:"none"},land+i*0.045));
      tl.fromTo("#pan-cam", { scale: 1.0 }, { scale: 1.12, duration: ${r3(Math.max(0.6, D - 0.42))}, ease: "power2.out" }, land);
      ${JSON.stringify(drops)}.forEach((d, i) => {
        tl.fromTo("#pan-d" + i, { x: 0, y: 0, opacity: 0, scale: 0.4 }, { x: d.dx, y: d.dy, opacity: 1, scale: 1, duration: 0.5, ease: "expo.out" }, land + i * 0.008);
        tl.to("#pan-d" + i, { opacity: 0, duration: 0.2 }, land + 0.45 + i * 0.01);
      });
      for (let i = 0; i < 5; i++) {
        tl.fromTo("#pan-s" + i, { opacity: 0, y: 0 }, { opacity: 0.75, y: -120, duration: 0.6, ease: "power1.out" }, land + 0.1 + i * 0.09);
        tl.to("#pan-s" + i, { opacity: 0, y: -220, duration: 0.5, ease: "power1.in" }, land + 0.7 + i * 0.09);
      }`));
}

// ----- liebig: la teoría del siglo XIX -----
{
  const S = SHOTS.find((s) => s.id === "liebig");
  const tDor = rel(at("l3", "dorar"), S.start), tPor = rel(at("l3", "poros"), S.start), D = r3(S.end - S.start);
  const R = rng(11);
  const hatch = Array.from({ length: 60 }, (_, i) => `<path d="M${-200 + i * 30} 0 l${600} 1920" />`).join("");
  write("compositions/liebig.html", scene("liebig", TITLE_CSS + `
    #liebig-card { position: absolute; inset: 0; transform-origin: 540px 900px; }
    #liebig-era { top: 210px; font-size: 92px; }
    #liebig-sub { top: 318px; font-size: 44px; -webkit-text-stroke: 7px ${INK}; }
    #liebig-quote { position: absolute; left: 90px; right: 90px; top: 925px; padding: 22px 30px; background: #fff7e2; border: 8px solid ${INK};
      border-radius: 18px; font: 800 54px/1.1 "Montserrat", sans-serif; color: ${INK}; text-align: center; box-shadow: 0 12px 0 rgba(42,26,18,0.35); }
    #liebig-quote b { color: ${RED}; }
    #liebig-stamp { position: absolute; left: 0; right: 0; top: 560px; text-align: center; font: 900 220px/1 "Archivo Black", sans-serif; color: ${RED};
      letter-spacing: 0.04em; }
    #liebig-stamp span { display: inline-block; border: 18px solid ${RED}; border-radius: 26px; padding: 6px 40px 18px; background: rgba(255,247,226,0.25); }`,
`    <div id="liebig-card">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0">
        <rect width="1080" height="1920" fill="#e9d6ac"/>
        <g stroke="#cdb684" stroke-width="3" opacity="0.6">${hatch}</g>
        <rect x="70" y="440" width="940" height="520" rx="20" fill="#f3e4c0" stroke="${INK}" stroke-width="8"/>
        <!-- grabado: silueta de un químico con su matraz y un mechero -->
        <g id="liebig-sci" fill="#3b2a1a" stroke="${INK}" stroke-width="6" stroke-linejoin="round">
          <path d="M260 960 Q270 760 360 730 L470 730 Q560 760 570 960 Z"/>
          <path d="M365 735 L415 800 L465 735" fill="#f3e4c0"/>
          <ellipse cx="415" cy="640" rx="78" ry="92"/>
          <path d="M338 650 Q330 720 380 735 L380 700 Z M492 650 Q500 720 450 735 L450 700 Z" fill="#2a1d12"/>
          <path d="M345 590 Q415 520 488 592 Q470 560 415 556 Q360 560 345 590 Z" fill="#2a1d12"/>
        </g>
        <g stroke="${INK}" stroke-width="7" stroke-linejoin="round">
          <path d="M700 560 h60 v90 l90 170 q12 30 -20 30 h-200 q-32 0 -20 -30 l90 -170 z" fill="#f3e4c0"/>
          <path d="M650 760 h200 l-20 40 q-6 10 -18 10 h-130 q-12 0 -18 -10 z" fill="#c2414b"/>
          <rect x="660" y="880" width="180" height="40" rx="8" fill="#6b5a40"/>
          <path id="liebig-flame" d="M750 880 q-30 -40 0 -80 q30 40 0 80 z" fill="#e8a33a"/>
        </g>
        <g id="liebig-bub" fill="#f3e4c0" stroke="${INK}" stroke-width="4">
          <circle cx="740" cy="740" r="10"/><circle cx="770" cy="710" r="7"/><circle cx="745" cy="680" r="5"/>
        </g>
      </svg>
      <div id="liebig-era" class="t">SIGLO <span class="y">XIX</span></div>
      <div id="liebig-sub" class="t">UN QUÍMICO ALEMÁN DIJO…</div>
      <div id="liebig-quote">«Dorar la carne<br><b>cierra los poros</b>»</div>
      <div id="liebig-stamp"><span>MITO</span></div>
    </div>`,
`      tl.fromTo("#liebig-card", { x: 1080, rotation: 6 }, { x: 0, rotation: 0, duration: 0.5, ease: "expo.out" }, 0);
      tl.fromTo("#liebig-sci", { scale: 1, svgOrigin: "415 760" }, { scale: 1.06, duration: ${D}, ease: "none" }, 0);
      tl.fromTo("#liebig-flame", { scaleY: 0.85, svgOrigin: "750 880" }, { scaleY: 1.12, duration: 0.25, ease: "sine.inOut", repeat: ${Math.max(0, Math.floor(D / 0.25) - 1)}, yoyo: true }, 0);
      tl.fromTo("#liebig-bub", { y: 0, opacity: 1 }, { y: -60, opacity: 0, duration: 0.9, ease: "power1.out", repeat: ${Math.max(0, Math.floor(D / 0.9) - 1)} }, 0);
      tl.fromTo("#liebig-era", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18, ease: "power4.out" }, 0.25);
      tl.fromTo("#liebig-sub", { opacity: 0 }, { opacity: 1, duration: 0.16 }, ${r3(rel(at("l3", "químico"), S.start) - 0.1)});
      tl.fromTo("#liebig-quote", { opacity: 0, y: 40, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "expo.out" }, ${r3(tDor - 0.1)});
      tl.fromTo("#liebig-stamp", { opacity: 0, scale: 2.4, rotation: -14 }, { opacity: 1, scale: 1, rotation: -12, duration: 0.22, ease: "power4.in" }, ${r3(tPor + 0.2)});
      [[10,-6],[-8,6],[5,-3],[0,0]].forEach(([x,y],i)=>tl.to("#liebig-card",{x,y,duration:0.04,ease:"none"},${r3(tPor + 0.42)}+i*0.04));`));
}

// ----- juice: la carne suelta líquido -----
{
  const S = SHOTS.find((s) => s.id === "juice");
  const D = r3(S.end - S.start);
  const tLiq = rel(at("l4", "líquido."), S.start), tJugo = rel(at("l4", "jugo"), S.start);
  const R = rng(21);
  const beads = Array.from({ length: 9 }, (_, i) => ({ x: 300 + i * 60 + R() * 20, y: 900 + R() * 40, r: 9 + R() * 8, d: 0.2 + R() * 1.8 }));
  const bubbles = Array.from({ length: 14 }, (_, i) => ({ x: i < 7 ? 200 + R() * 80 : 800 + R() * 80, y: 1015 + R() * 20, r: 8 + R() * 10, t: R() * Math.max(0.5, D - 0.6) }));
  write("compositions/juice.html", scene("juice", TITLE_CSS + `
    #juice-cam { position: absolute; inset: 0; transform-origin: 540px 760px; }
    #juice-lbl { top: 260px; font-size: 104px; }
    #juice-q { top: 260px; font-size: 96px; }`,
`    <div id="juice-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0">
        <rect width="1080" height="1920" fill="#8e969c"/>
        <rect y="870" width="1080" height="1050" fill="#5f666b"/>
        <g transform="translate(0 -260)">
        <!-- llama de la cocina -->
        <g id="juice-fire" fill="#3d7fd6" stroke="${INK}" stroke-width="5">
          ${[280, 400, 520, 640, 760].map((x) => `<path d="M${x} 1160 q-22 -40 0 -70 q22 30 0 70 z"/>`).join("")}
        </g>
        <!-- sartén de perfil -->
        <path d="M120 1000 L960 1000 L900 1100 L180 1100 Z" fill="#2e2e33" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
        <rect x="940" y="985" width="260" height="56" rx="24" fill="#2e2e33" stroke="${INK}" stroke-width="10"/>
        <!-- charco de jugo que crece -->
        <ellipse id="juice-pool" cx="540" cy="1004" rx="400" ry="14" fill="#8c2f22" stroke="${INK}" stroke-width="5"/>
        <!-- bistec de perfil: abajo dorado, arriba crudo -->
        <path d="M250 1000 Q250 860 360 850 L720 850 Q830 860 830 1000 Z" fill="#c2414b" stroke="${INK}" stroke-width="10"/>
        <path d="M252 1000 Q254 960 262 940 L818 940 Q826 960 828 1000 Z" fill="#7a4423"/>
        <path d="M300 900 q80 18 160 -6 q90 -20 200 4" stroke="#f3d3c8" stroke-width="10" fill="none" stroke-linecap="round"/>
        <g id="juice-beads">${beads.map((b, i) => `<ellipse id="juice-b${i}" cx="${b.x.toFixed(0)}" cy="${b.y.toFixed(0)}" rx="${(b.r * 0.8).toFixed(1)}" ry="${b.r.toFixed(1)}" fill="#a3362a" stroke="${INK}" stroke-width="3" opacity="0"/>`).join("")}</g>
        <g>${bubbles.map((b, i) => `<circle id="juice-u${i}" cx="${b.x.toFixed(0)}" cy="${b.y.toFixed(0)}" r="${b.r.toFixed(1)}" fill="none" stroke="#f7e7b0" stroke-width="4" opacity="0"/>`).join("")}</g>
        <g fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round">
          ${[330, 470, 610, 750].map((x, i) => `<path id="juice-s${i}" d="M${x} 840 q-26 -50 0 -100 q26 -50 0 -100" opacity="0"/>`).join("")}
        </g>
        <!-- flecha -->
        <g id="juice-arrow" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <path d="M840 560 Q960 700 880 900 L920 905 L850 990 L815 880 L850 892 Q910 720 800 600 Z" fill="${YEL}"/>
        </g>
        </g>
      </svg>
    </div>
      <div id="juice-q" class="t">¿“SELLADA”?</div>
      <div id="juice-lbl" class="t"><span class="y">JUGO</span><br>SALIENDO</div>`,
`      tl.fromTo("#juice-cam", { scale: 1.14, filter: "blur(8px)" }, { scale: 1.24, filter: "blur(0px)", duration: ${D}, ease: "expo.out" }, 0);
      tl.fromTo("#juice-fire", { scaleY: 0.9, svgOrigin: "540 1160" }, { scaleY: 1.1, duration: 0.2, ease: "sine.inOut", repeat: ${Math.max(0, Math.floor(D / 0.2) - 1)}, yoyo: true }, 0);
      tl.fromTo("#juice-q", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.25, ease: "expo.out" }, 0.3);
      tl.to("#juice-q", { opacity: 0, filter: "blur(6px)", duration: 0.15 }, ${r3(tJugo - 0.45)});
      tl.fromTo("#juice-pool", { attr: { rx: 330, ry: 6 } }, { attr: { rx: 430, ry: 22 }, duration: ${r3(Math.max(0.8, tLiq + 0.6))}, ease: "power2.out" }, 0.2);
      ${JSON.stringify(beads)}.forEach((b, i) => {
        tl.fromTo("#juice-b" + i, { opacity: 0, y: 0, scale: 0.3 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: "back.out(2)" }, b.d);
        tl.to("#juice-b" + i, { y: 95, scaleY: 0.6, duration: 0.6, ease: "power2.in" }, b.d + 0.35);
        tl.to("#juice-b" + i, { opacity: 0, duration: 0.1 }, b.d + 0.92);
      });
      ${JSON.stringify(bubbles)}.forEach((b, i) => {
        tl.fromTo("#juice-u" + i, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out" }, b.t);
        tl.to("#juice-u" + i, { opacity: 0, scale: 1.5, duration: 0.1 }, b.t + 0.3);
      });
      for (let i = 0; i < 4; i++) {
        tl.fromTo("#juice-s" + i, { opacity: 0, y: 0 }, { opacity: 0.8, y: -80, duration: 0.7, ease: "power1.out" }, 0.2 + i * 0.25);
        tl.to("#juice-s" + i, { opacity: 0, y: -160, duration: 0.6 }, 0.9 + i * 0.25);
      }
      tl.fromTo("#juice-arrow", { opacity: 0, x: 60, y: -60 }, { opacity: 1, x: 0, y: 0, duration: 0.35, ease: "expo.out" }, ${r3(tJugo - 0.3)});
      tl.fromTo("#juice-lbl span, #juice-lbl", { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power4.out" }, ${r3(tJugo - 0.05)});`));
}

// ----- maillard: vuelta a la carne y costra -----
{
  const S = SHOTS.find((s) => s.id === "maillard");
  const D = r3(S.end - S.start);
  const tQue = rel(at("l5", "¿pa'"), S.start), tPor = rel(at("l5", "¡Por"), S.start), tSab = rel(at("l5", "sabor!"), S.start);
  const tMai = rel(at("l5", "Maillard:"), S.start), tCos = rel(at("l5", "costrita"), S.start);
  write("compositions/maillard.html", scene("maillard", TITLE_CSS + `
    #mai-cam { position: absolute; inset: 0; transform-origin: 540px 980px; }
    #mai-q { top: 230px; font-size: 84px; }
    #mai-sabor { top: 230px; font-size: 150px; }
    #mai-name { top: 230px; font-size: 96px; }
    #mai-eq { top: 445px; font-size: 54px; -webkit-text-stroke: 8px ${INK}; }`,
`    <div id="mai-cam">${PAN_SVG("mai", RAW_STEAK("mai-raw") + SEARED_STEAK("mai-sear"))}
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0;overflow:visible">
        <g id="mai-tongs" stroke="${INK}" stroke-width="9" stroke-linejoin="round" fill="#b9c0c6">
          <path d="M1200 700 L640 930 L655 960 L1220 760 Z"/><path d="M1220 820 L650 990 L660 1020 L1240 880 Z"/>
        </g>
        <g id="mai-stars" fill="${YEL}" stroke="${INK}" stroke-width="5" stroke-linejoin="round">
          ${[[300, 760, 1], [800, 800, 0.8], [270, 1150, 0.7], [820, 1160, 1]].map(([x, y, s], i) => `<path id="mai-st${i}" transform="translate(${x} ${y}) scale(${s})" d="M0 -40 L10 -10 L40 0 L10 10 L0 40 L-10 10 L-40 0 L-10 -10 Z" opacity="0"/>`).join("")}
        </g>
      </svg>
    </div>
      <div id="mai-q" class="t">¿PA' QUÉ SE SELLA?</div>
      <div id="mai-sabor" class="t">¡POR <span class="y">SABOR!</span></div>
      <div id="mai-name" class="t">REACCIÓN<br>DE <span class="y">MAILLARD</span></div>
      <div id="mai-eq" class="t">= COSTRA DORADA<br>LLENA DE SABOR</div>`,
`      const flip = ${r3(tPor - 0.25)};
      tl.fromTo("#mai-cam", { x: -1080 }, { x: 0, duration: 0.35, ease: "expo.out" }, 0);
      tl.fromTo("#mai-q", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, 0.3);
      tl.to("#mai-q", { opacity: 0, filter: "blur(6px)", duration: 0.13 }, flip);
      tl.fromTo("#mai-tongs", { x: 500, y: -80 }, { x: 0, y: 0, duration: 0.45, ease: "expo.out" }, ${r3(Math.max(0.2, tQue))});
      tl.set("#mai-sear", { opacity: 0 }, 0);
      tl.fromTo("#mai-raw", { scaleX: 1, svgOrigin: "540 980" }, { scaleX: 0, y: -60, duration: 0.14, ease: "power2.in" }, flip);
      tl.set("#mai-raw", { opacity: 0 }, flip + 0.14);
      tl.set("#mai-sear", { opacity: 1 }, flip + 0.14);
      tl.fromTo("#mai-sear", { scaleX: 0, y: -60, svgOrigin: "540 980" }, { scaleX: 1, y: 0, duration: 0.32, ease: "back.out(2.2)" }, flip + 0.14);
      tl.to("#mai-tongs", { x: 600, y: -120, duration: 0.3, ease: "power3.in" }, flip + 0.3);
      tl.fromTo("#mai-sabor", { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power4.out" }, ${r3(tSab - 0.12)});
      tl.to("#mai-sabor", { opacity: 0, filter: "blur(6px)", duration: 0.13 }, ${r3(tMai - 1.0)});
      tl.fromTo("#mai-cam", { scale: 1 }, { scale: 1.42, y: 40, duration: 0.8, ease: "power2.inOut" }, ${r3(tMai - 0.9)});
      tl.fromTo("#mai-name", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.2 }, ${r3(tMai - 0.35)});
      tl.fromTo("#mai-eq", { opacity: 0 }, { opacity: 1, duration: 0.18 }, ${r3(tMai + 0.25)});
      for (let i = 0; i < 4; i++) {
        tl.fromTo("#mai-st" + i, { opacity: 0, scale: 0.2, rotation: 0 }, { opacity: 1, scale: 1, rotation: 45, duration: 0.3, ease: "back.out(2)" }, ${r3(tCos)} + i * 0.08);
        tl.to("#mai-st" + i, { opacity: 0, scale: 0.4, duration: 0.2 }, ${r3(Math.min(D - 0.25, tCos + 1.0))} + i * 0.05);
      }`));
}

// ----- car: el chiste de las ventanas -----
{
  const S = SHOTS.find((s) => s.id === "car");
  const D = r3(S.end - S.start);
  const tVen = rel(at("l6", "ventanas"), S.start);
  const R = rng(31);
  const drops = Array.from({ length: 12 }, (_, i) => ({ win: i % 2, dx: (i % 2 ? 1 : -0.4) * (120 + R() * 220), dy: -(180 + R() * 220), t: tVen + 0.1 + R() * Math.max(0.3, D - tVen - 0.7) }));
  write("compositions/car.html", scene("car", TITLE_CSS + `
    #car-world { position: absolute; inset: 0; }
    #car-t1 { top: 230px; font-size: 92px; }
    #car-t2 { top: 360px; font-size: 92px; }
    #car-bam { position: absolute; left: 650px; top: 760px; font: 900 110px/1 "Archivo Black", sans-serif; color: ${YEL}; -webkit-text-stroke: 9px ${INK}; paint-order: stroke fill; }`,
`    <div id="car-world">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0">
        <rect width="1080" height="1920" fill="#bfe3ea"/>
        <rect y="1180" width="1080" height="740" fill="#9a9a9a"/>
        <path d="M0 1190 H1080" stroke="${INK}" stroke-width="8"/>
        <path d="M60 1420 h160 M380 1420 h160 M700 1420 h160" stroke="#f3eee5" stroke-width="18"/>
        <g id="car-car" stroke="${INK}" stroke-width="10" stroke-linejoin="round">
          <path d="M110 1130 Q110 990 210 980 L330 980 L430 820 Q450 800 480 800 L760 800 Q800 800 820 830 L920 980 Q990 990 990 1060 L990 1130 Z" fill="#d9452f"/>
          <path d="M455 830 L540 830 L540 975 L360 975 Z" fill="#bfe3ea"/>
          <path d="M580 830 L760 830 Q780 830 790 845 L880 975 L580 975 Z" fill="#bfe3ea"/>
          <path d="M540 830 v300" />
          <g id="car-door"><path d="M545 830 L760 830 Q780 830 790 845 L880 975 L885 1125 L545 1125 Z" fill="#e8604a" stroke-width="9"/>
            <path d="M580 840 L760 840 Q775 842 783 852 L866 970 L580 970 Z" fill="#cfeef3" stroke-width="7" opacity="0.001"/>
            <rect x="590" y="1010" width="70" height="18" rx="9" fill="${INK}"/></g>
          <circle cx="290" cy="1140" r="80" fill="#2e2e33"/><circle cx="290" cy="1140" r="34" fill="#b9c0c6"/>
          <circle cx="810" cy="1140" r="80" fill="#2e2e33"/><circle cx="810" cy="1140" r="34" fill="#b9c0c6"/>
          <rect x="960" y="1040" width="40" height="30" rx="8" fill="#ffd23f"/>
        </g>
        <g>${drops.map((d, i) => `<path id="car-j${i}" d="M0 -18 Q14 0 0 14 Q-14 0 0 -18 Z" transform="translate(${d.win ? 690 : 460} 900)" fill="#a3362a" stroke="${INK}" stroke-width="4" opacity="0"/>`).join("")}</g>
      </svg>
      <div id="car-t1" class="t">PUERTA CERRADA…</div>
      <div id="car-t2" class="t"><span class="y">VENTANAS</span> ABIERTAS</div>
      <div id="car-bam">¡PUM!</div>
    </div>`,
`      tl.fromTo("#car-world", { clipPath: "circle(0% at 540px 960px)" }, { clipPath: "circle(120% at 540px 960px)", duration: 0.35, ease: "power2.out" }, 0);
      tl.fromTo("#car-door", { scaleX: 0.35, svgOrigin: "545 980" }, { scaleX: 1, duration: 0.28, ease: "power4.in" }, 0.15);
      tl.fromTo("#car-bam", { opacity: 0, scale: 2, rotation: -10 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.16, ease: "power4.out" }, 0.43);
      tl.to("#car-bam", { opacity: 0, duration: 0.15 }, 1.0);
      [[0,-14],[0,8],[0,-5],[0,0]].forEach(([x,y],i)=>tl.to("#car-car",{y,duration:0.05,ease:"none"},0.43+i*0.05));
      tl.fromTo("#car-t1", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, 0.45);
      tl.fromTo("#car-t2", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18 }, ${r3(tVen - 0.05)});
      ${JSON.stringify(drops)}.forEach((d, i) => {
        tl.fromTo("#car-j" + i, { opacity: 1, x: 0, y: 0 }, { x: d.dx, y: d.dy, duration: 0.35, ease: "power2.out" }, d.t);
        tl.to("#car-j" + i, { y: d.dy + 500, duration: 0.45, ease: "power2.in" }, d.t + 0.35);
        tl.set("#car-j" + i, { opacity: 0 }, d.t + 0.8);
      });`));
}

// ----- board: corte de un bistec reposado -----
{
  const S = SHOTS.find((s) => s.id === "board");
  const D = r3(S.end - S.start);
  const tSob = rel(at("l7", "sobrecocine"), S.start), tRep = rel(at("l7", "reposar."), S.start);
  const slices = [0, 1, 2, 3, 4];
  write("compositions/board.html", scene("board", TITLE_CSS + `
    #board-cam { position: absolute; inset: 0; transform-origin: 540px 980px; }
    .chk { position: absolute; left: 120px; font: 900 70px/1 "Archivo Black", sans-serif; color: #fff; -webkit-text-stroke: 9px ${INK}; paint-order: stroke fill; display: flex; align-items: center; gap: 26px; }
    .chk i { display: inline-block; width: 86px; height: 86px; border-radius: 18px; background: ${YEL}; border: 8px solid ${INK}; position: relative; }
    .chk i::after { content: ""; position: absolute; left: 22px; top: 6px; width: 24px; height: 46px; border: solid ${INK}; border-width: 0 12px 12px 0; transform: rotate(45deg); }
    #board-c1 { top: 230px; } #board-c2 { top: 350px; }`,
`    <div id="board-cam">
      <svg viewBox="0 0 1080 1920" width="1080" height="1920" style="position:absolute;inset:0">
        <rect width="1080" height="1920" fill="#e9e1d3"/>
        <rect x="60" y="600" width="960" height="680" rx="60" fill="#c08a55" stroke="${INK}" stroke-width="12"/>
        <g stroke="#a8743f" stroke-width="6" fill="none" opacity="0.8">
          <path d="M120 700 q300 -30 840 10 M110 820 q400 30 860 -10 M120 1180 q420 -30 840 20"/>
        </g>
        <!-- bistec entero a la derecha -->
        <g stroke="${INK}" stroke-width="10" stroke-linejoin="round">
          <path d="M620 760 Q900 740 920 900 Q930 1080 760 1120 L620 1120 Z" fill="#7a4423"/>
        </g>
        <!-- tajadas -->
        ${slices.map((i) => `<g id="board-sl${i}" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <path d="M${520 - i * 92} 770 l80 0 l0 350 l-80 0 z" fill="#7a4423"/>
          <path d="M${532 - i * 92} 786 l56 0 l0 318 l-56 0 z" fill="#e2737d" stroke="none"/>
          <path d="M${546 - i * 92} 810 l28 0 l0 270 l-28 0 z" fill="#f09aa0" stroke="none"/>
        </g>`).join("")}
        <g id="board-knife" stroke="${INK}" stroke-width="9" stroke-linejoin="round">
          <path d="M610 520 L640 520 L640 980 Q625 1010 600 980 Z" fill="#dfe4e8"/>
          <rect x="598" y="330" width="54" height="200" rx="18" fill="#2e2e33"/>
        </g>
        <!-- reloj de reposo -->
        <g id="board-clock" transform="translate(870 470)" stroke="${INK}" stroke-width="9">
          <circle r="80" fill="#fff"/><path id="board-hand" d="M0 0 V-56" stroke-linecap="round"/><path d="M0 0 H38" stroke-linecap="round"/>
        </g>
      </svg>
      <div id="board-c1" class="chk"><i></i><span>NO SOBRECOCINAR</span></div>
      <div id="board-c2" class="chk"><i></i><span class="y" style="color:${YEL}">DEJAR REPOSAR</span></div>
    </div>`,
`      tl.fromTo("#board-cam", { y: 1920 }, { y: 0, duration: 0.4, ease: "expo.out" }, 0);
      for (let i = 0; i < 5; i++) tl.fromTo("#board-sl" + i, { x: 120 + i * 92, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "expo.out" }, 0.25 + i * 0.22);
      for (let i = 0; i < 5; i++) tl.fromTo("#board-knife", { y: -120 }, { y: 0, duration: 0.11, ease: "power2.in", immediateRender: i === 0 }, 0.12 + i * 0.22);
      tl.to("#board-knife", { y: -900, duration: 0.3, ease: "power3.in" }, 1.35);
      tl.fromTo("#board-c1", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.3, ease: "expo.out" }, ${r3(tSob - 0.25)});
      tl.fromTo("#board-c2", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.3, ease: "expo.out" }, ${r3(tRep - 0.25)});
      tl.fromTo("#board-clock", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, ${r3(tRep - 0.15)});
      tl.fromTo("#board-hand", { rotation: 0, svgOrigin: "870 470" }, { rotation: 360, duration: 1.2, ease: "none" }, ${r3(tRep)});
      tl.fromTo("#board-cam", { scale: 1 }, { scale: 1.06, duration: ${r3(Math.max(0.5, D - 0.4))}, ease: "power1.out" }, 0.4);`));
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
`    <div id="ti-hook" class="t"><span class="l1">SELLAR LA CARNE</span><br><span class="l2"><span class="r nobox">NO</span> GUARDA</span><br><span class="l3">LOS <span class="y">JUGOS</span></span></div>
    <div id="ti-plate"><div class="nm">CHEF CHINO ARTAVIA</div><br><div class="sub">Mitos de cocina #1</div></div>
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
  land: 0.42, nameplate: r3(at("l2", "Chef") - 0.1), paper: SHOTS[1].start, stamp: r3(at("l3", "poros") + 0.4),
  sizzle: SHOTS[2].start, flip: r3(at("l5", "¡Por") - 0.25), whoosh1: cutHookChef, whoosh2: SHOTS[3].start,
  pop: r3(at("l5", "sabor!") - 0.12), slam: r3(carIn + 0.43), knife: boardIn + 0.12, click: r3(at("l8", "¡Pura") - 0.5),
  stampPura: at("l8", "¡Pura"),
};
fs.writeFileSync("events.json", JSON.stringify({ ...EV, total: TOTAL, cut: cutHookChef, carIn, boardIn, boardOut,
  liebigIn: SHOTS[1].start, juiceIn: SHOTS[2].start, maiIn: SHOTS[3].start, truco: r3(Lb.l7.start - 0.05),
  sobre: at("l7", "sobrecocine"), reposar: at("l7", "reposar."), maillard: at("l5", "Maillard:"), costrita: at("l5", "costrita"), chispo: at("l4", "chisporroteo"),
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
    <title>Chef Chino Artavia · 01 · Sellar la carne</title>
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
