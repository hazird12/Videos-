/* Chef Chino Artavia — rig SVG determinista.
   ChefRig.mount(el)            -> dibuja el personaje dentro de el y devuelve el rig
   rig.render(t, keys, env)     -> pose en el tiempo t (segundos de la escena)
   keys: { pose: [[t,"name"],...], face: [[t,"name"],...], talk: [[t0,t1],...] }
   env:  { fps, v:[0..1] } envolvente de la voz para la boca (tiempo de la película)
*/
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const INK = "#2a1a12";
  const SKIN = "#b77a4f";
  const SKIN_D = "#9a6340";
  const HAIR = "#1d1410";
  const WHITE = "#fbfaf6";
  const WHITE_D = "#dcd8cf";

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const S = { stroke: INK, "stroke-width": 7, "stroke-linejoin": "round", "stroke-linecap": "round" };
  const A = (o) => Object.assign({}, S, o);

  // Poses de brazo: hombro (grados), codo (grados), mano
  // 0 grados = brazo colgando hacia abajo. Positivo = hacia fuera del cuerpo.
  const POSES = {
    rest: { lS: 6, lE: 6, rS: 6, rE: 6, lH: "fist", rH: "fist", lean: 0 },
    fingerUp: { lS: 12, lE: 10, rS: 58, rE: 112, lH: "fist", rH: "index", lean: -2 },
    hat: { lS: 12, lE: 8, rS: 150, rE: 60, lH: "fist", rH: "open", lean: 3 },
    explain: { lS: 26, lE: 96, rS: 30, rE: 92, lH: "open", rH: "open", lean: 0 },
    present: { lS: 12, lE: 10, rS: 78, rE: 30, lH: "fist", rH: "open", lean: -3 },
    door: { lS: 12, lE: 10, rS: 92, rE: 4, lH: "fist", rH: "open", lean: 4 },
    shrug: { lS: 38, lE: 112, rS: 38, rE: 112, lH: "open", rH: "open", lean: 0 },
    point: { lS: 12, lE: 10, rS: 64, rE: 64, lH: "fist", rH: "index", lean: -4 },
    thumbs: { lS: 12, lE: 10, rS: 50, rE: 120, lH: "fist", rH: "thumb", lean: -2 },
  };
  // Caras: cejas (sube px, inclinación grados), sonrisa (0..1), ojos (escala), cabeza (grados)
  const FACES = {
    normal: { brow: 0, browTilt: 0, smile: 0.5, eye: 1, head: 0 },
    happy: { brow: -6, browTilt: 0, smile: 1, eye: 0.85, head: -3 },
    wow: { brow: -20, browTilt: 0, smile: 0.2, eye: 1.18, head: 2 },
    sly: { brow: -10, browTilt: 12, smile: 0.85, eye: 0.8, head: -6 },
    serious: { brow: 6, browTilt: -10, smile: 0.25, eye: 1, head: 3 },
    nope: { brow: 4, browTilt: -14, smile: 0.1, eye: 0.9, head: 6 },
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Parpadeos deterministas cada 2.2–4.4 s
  const BLINKS = (() => {
    const r = mulberry32(7), out = [];
    let t = 0.9;
    while (t < 120) { out.push(t); t += 2.2 + r() * 2.2; }
    return out;
  })();

  const backOut = (x) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const smooth = (x) => x * x * (3 - 2 * x);

  // Valor numérico en t entre claves con transición de dur segundos
  function keyed(keys, table, prop, t, dur, ease) {
    if (!keys || !keys.length) return table[Object.keys(table)[0]][prop];
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1][0] <= t) i++;
    const cur = table[keys[i][1]][prop];
    if (i === 0 || t >= keys[i][0] + dur) return t < keys[0][0] ? table[keys[0][1]][prop] : cur;
    const prev = table[keys[i - 1][1]][prop];
    const x = Math.min(1, Math.max(0, (t - keys[i][0]) / dur));
    if (typeof cur !== "number") return x < 0.5 ? prev : cur;
    return prev + (cur - prev) * ease(x);
  }
  // Cada parte con un pequeño retraso propio: la cabeza guía, los brazos siguen
  function poseVal(keys, prop, t, lag) { return keyed(keys, POSES, prop, t - (lag || 0), 0.32, backOut); }
  function faceVal(keys, prop, t, lag) { return keyed(keys, FACES, prop, t - (lag || 0), 0.22, smooth); }

  function buildArm(g, side) {
    const sx = side === "l" ? 168 : 432;
    const dir = side === "l" ? -1 : 1;
    const arm = el("g", { transform: `translate(${sx} 520)` }, g);
    const upper = el("g", {}, arm);
    el("rect", A({ x: -34, y: -10, width: 68, height: 170, rx: 32, fill: WHITE }), upper);
    el("path", { d: `M ${-20 * dir} 20 Q ${-6 * dir} 90 ${-18 * dir} 150`, stroke: WHITE_D, "stroke-width": 6, fill: "none", "stroke-linecap": "round" }, upper);
    const fore = el("g", { transform: "translate(0 150)" }, upper);
    el("rect", A({ x: -30, y: -12, width: 60, height: 150, rx: 28, fill: WHITE }), fore);
    el("rect", A({ x: -32, y: 112, width: 64, height: 26, rx: 12, fill: WHITE_D }), fore);
    const hand = el("g", { transform: "translate(0 168)" }, fore);
    const hands = {
      fist: el("g", {}, hand),
      index: el("g", {}, hand),
      open: el("g", {}, hand),
      thumb: el("g", {}, hand),
    };
    el("circle", A({ cx: 0, cy: 4, r: 34, fill: SKIN }), hands.fist);
    el("path", { d: "M -16 -6 Q 0 4 16 -6", stroke: SKIN_D, "stroke-width": 5, fill: "none", "stroke-linecap": "round" }, hands.fist);
    el("rect", A({ x: -10 + 6 * dir, y: 10, width: 20, height: 70, rx: 10, fill: SKIN }), hands.index);
    el("circle", A({ cx: 0, cy: 0, r: 32, fill: SKIN }), hands.index);
    [-21, -7, 7, 21].forEach((fx, k) => el("rect", A({ x: fx - 7, y: 18, width: 14, height: 44 - Math.abs(fx) * 0.5, rx: 7, fill: SKIN, "stroke-width": 5 }), hands.open));
    el("rect", A({ x: -12, y: -16, width: 14, height: 40, rx: 7, fill: SKIN, "stroke-width": 5, transform: `rotate(${-60 * dir} 0 0) translate(${-34 * dir} 0)` }), hands.open);
    el("ellipse", A({ cx: 0, cy: 10, rx: 30, ry: 28, fill: SKIN }), hands.open);
    el("circle", A({ cx: 0, cy: 0, r: 34, fill: SKIN }), hands.thumb);
    el("rect", A({ x: -10, y: -70, width: 22, height: 60, rx: 11, fill: SKIN }), hands.thumb);
    return { arm, upper, fore, hands, dir };
  }

  function mount(host) {
    const svg = el("svg", { viewBox: "0 0 600 900", width: "100%", height: "100%", overflow: "visible" }, null);
    host.appendChild(svg);
    const root = el("g", { id: host.id + "-g" }, svg);
    const body = el("g", {}, root);

    // Brazo izquierdo detrás del cuerpo cuando cuelga
    const armL = buildArm(body, "l");
    // Torso: chaqueta cruzada
    el("path", A({ d: "M 150 470 Q 300 430 450 470 Q 500 490 505 560 L 560 1300 L 40 1300 L 95 560 Q 100 490 150 470 Z", fill: WHITE }), body);
    el("path", { d: "M 300 470 L 300 1300", stroke: WHITE_D, "stroke-width": 5 }, body);
    el("path", A({ d: "M 245 455 Q 300 485 355 455 L 360 500 Q 300 520 240 500 Z", fill: WHITE }), body); // cuello mao
    for (let i = 0; i < 3; i++) {
      el("circle", { cx: 258, cy: 560 + i * 62, r: 10, fill: INK }, body);
      el("circle", { cx: 342, cy: 560 + i * 62, r: 10, fill: INK }, body);
    }
    // Delantal negro
    el("path", A({ d: "M 170 740 L 430 740 L 520 1300 L 80 1300 Z", fill: "#1f1f22" }), body);
    el("path", { d: "M 170 740 L 430 740", stroke: "#3a3a3f", "stroke-width": 10 }, body);
    el("rect", { x: 255, y: 790, width: 90, height: 60, rx: 6, fill: "none", stroke: "#3a3a3f", "stroke-width": 5 }, body);

    // Cabeza
    const headWrap = el("g", { transform: "translate(300 440)" }, root);
    const head = el("g", {}, headWrap);
    const H = el("g", { transform: "translate(-300 -440)" }, head);
    el("rect", A({ x: 262, y: 400, width: 76, height: 70, rx: 18, fill: SKIN_D }), H); // cuello
    el("ellipse", A({ cx: 178, cy: 312, rx: 24, ry: 34, fill: SKIN }), H);
    el("ellipse", A({ cx: 422, cy: 312, rx: 24, ry: 34, fill: SKIN }), H);
    el("path", A({ d: "M 182 250 Q 180 170 300 165 Q 420 170 418 250 L 420 330 Q 418 440 300 445 Q 182 440 180 330 Z", fill: SKIN }), H);
    // Barba corta
    el("path", A({ d: "M 186 318 Q 192 448 300 452 Q 408 448 414 318 Q 396 372 366 382 Q 300 360 234 382 Q 204 372 186 318 Z", fill: HAIR }), H);
    // Pelo / patillas
    el("path", A({ d: "M 182 262 Q 186 196 300 192 Q 414 196 418 262 L 404 268 Q 396 224 300 222 Q 204 224 196 268 Z", fill: HAIR }), H);
    el("rect", { x: 186, y: 250, width: 16, height: 70, rx: 7, fill: HAIR }, H);
    el("rect", { x: 398, y: 250, width: 16, height: 70, rx: 7, fill: HAIR }, H);
    // Mejillas
    el("ellipse", { cx: 228, cy: 338, rx: 22, ry: 12, fill: "#c9805a", opacity: 0.55 }, H);
    el("ellipse", { cx: 372, cy: 338, rx: 22, ry: 12, fill: "#c9805a", opacity: 0.55 }, H);
    // Ojos
    const eyes = [];
    [[255, 296], [345, 296]].forEach(([x, y]) => {
      const g = el("g", { transform: `translate(${x} ${y})` }, H);
      const inner = el("g", {}, g);
      el("ellipse", A({ cx: 0, cy: 0, rx: 19, ry: 23, fill: "#fff", "stroke-width": 5 }), inner);
      const pupil = el("circle", { cx: 2, cy: 2, r: 10, fill: INK }, inner);
      el("circle", { cx: 6, cy: -3, r: 3.5, fill: "#fff" }, inner);
      eyes.push({ g, inner, pupil });
    });
    // Cejas
    const brows = [];
    [[255, 258, -1], [345, 258, 1]].forEach(([x, y, d]) => {
      const g = el("g", { transform: `translate(${x} ${y})` }, H);
      const b = el("rect", { x: -28, y: -8, width: 56, height: 16, rx: 8, fill: HAIR }, g);
      brows.push({ g, d });
    });
    // Nariz
    el("path", { d: "M 300 310 Q 290 345 282 352 Q 300 362 318 352", stroke: SKIN_D, "stroke-width": 7, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, H);
    // Boca
    const mouthG = el("g", { transform: "translate(300 398)" }, H);
    const mouthOpen = el("path", { d: "", fill: "#5b1d1d", stroke: INK, "stroke-width": 5, "stroke-linejoin": "round" }, mouthG);
    const teeth = el("path", { d: "", fill: "#fff" }, mouthG);
    const tongue = el("path", { d: "", fill: "#d6605f" }, mouthG);
    // Gorro
    const hat = el("g", {}, H);
    el("path", A({ d: "M 205 205 Q 150 160 180 105 Q 200 60 255 78 Q 270 25 330 38 Q 380 30 395 85 Q 450 70 445 130 Q 445 180 395 205 Z", fill: WHITE }), hat);
    el("path", { d: "M 255 90 Q 262 140 250 190 M 330 50 Q 330 120 325 192 M 392 98 Q 388 150 380 196", stroke: WHITE_D, "stroke-width": 6, fill: "none", "stroke-linecap": "round" }, hat);
    el("rect", A({ x: 196, y: 192, width: 208, height: 46, rx: 10, fill: WHITE }), hat);
    el("path", { d: "M 205 230 L 395 230", stroke: WHITE_D, "stroke-width": 6 }, hat);

    // Brazo derecho delante
    const armR = buildArm(root, "r");
    root.appendChild(armL.arm); // ambos brazos delante del torso
    root.insertBefore(armL.arm, headWrap);
    root.insertBefore(armR.arm, null);

    return { svg, root, body, headWrap, head, eyes, brows, mouthOpen, teeth, tongue, armL, armR, render };

    function setHand(a, type) {
      for (const k in a.hands) a.hands[k].style.display = k === type ? "inline" : "none";
    }

    function render(t, keys, env, tFilm) {
      const pose = keys.pose || [[0, "rest"]];
      const face = keys.face || [[0, "normal"]];
      // Respiración y vaivén muy leves (actuación, no decoración)
      const breathe = Math.sin(t * 2.1) * 3;
      const lean = poseVal(pose, "lean", t, 0);
      root.setAttribute("transform", `translate(0 ${breathe.toFixed(2)}) rotate(${lean.toFixed(2)} 300 900)`);

      const headRot = faceVal(face, "head", t, 0) + Math.sin(t * 1.3 + 1) * 1.4;
      head.setAttribute("transform", `rotate(${headRot.toFixed(2)})`);

      // Brazos: el derecho llega primero, el izquierdo 60 ms después
      const arms = [[armL, "l", 0.06], [armR, "r", 0]];
      for (const [a, s, lag] of arms) {
        const sh = poseVal(pose, s + "S", t, lag) * a.dir * -1;
        const elb = poseVal(pose, s + "E", t, lag + 0.04) * a.dir * -1;
        a.upper.setAttribute("transform", `rotate(${sh.toFixed(2)})`);
        a.fore.setAttribute("transform", `translate(0 150) rotate(${elb.toFixed(2)})`);
        setHand(a, keyed(pose, POSES, s + "H", t - lag, 0.32, smooth));
      }

      // Cejas
      const bUp = faceVal(face, "brow", t, 0.03);
      const bTilt = faceVal(face, "browTilt", t, 0.03);
      brows.forEach((b) => b.g.setAttribute("transform", `translate(${b.d < 0 ? 255 : 345} ${(258 + bUp).toFixed(2)}) rotate(${(bTilt * b.d).toFixed(2)})`));

      // Ojos + parpadeo
      let blink = 1;
      for (const bt of BLINKS) { const d = t - bt; if (d >= 0 && d < 0.16) { blink = Math.abs(d - 0.08) / 0.08; break; } }
      const eyeS = faceVal(face, "eye", t, 0) * Math.max(0.08, blink);
      eyes.forEach((e) => e.inner.setAttribute("transform", `scale(1 ${eyeS.toFixed(3)})`));

      // Boca: apertura según la envolvente de la voz, sólo en tramos donde habla
      let open = 0;
      const tf = tFilm == null ? t : tFilm;
      const talking = (keys.talk || []).some(([a, b]) => tf >= a && tf < b);
      if (talking && env && env.v) {
        const i = Math.floor(tf * env.fps);
        const v = env.v[Math.min(env.v.length - 1, Math.max(0, i))] || 0;
        const v2 = env.v[Math.min(env.v.length - 1, Math.max(0, i + 1))] || 0;
        const fr = tf * env.fps - i;
        open = Math.min(1, (v + (v2 - v) * fr) * 1.25);
      }
      const smile = faceVal(face, "smile", t, 0.02);
      const w = 44 + smile * 16 - open * 6;
      const hgt = 4 + open * 46;
      const curve = 6 + smile * 14;
      // contorno: borde superior curvo (sonrisa) + borde inferior que baja al abrir
      mouthOpen.setAttribute("d", `M ${-w} ${-curve * 0.3} Q 0 ${curve * 0.9} ${w} ${-curve * 0.3} Q ${w * 0.7} ${hgt + curve} 0 ${hgt + curve * 1.1} Q ${-w * 0.7} ${hgt + curve} ${-w} ${-curve * 0.3} Z`);
      const tw = w * 0.75;
      teeth.setAttribute("d", open > 0.08 ? `M ${-tw} ${-curve * 0.1} Q 0 ${curve * 0.85} ${tw} ${-curve * 0.1} L ${tw * 0.85} ${curve * 0.35 + 6} Q 0 ${curve + 8} ${-tw * 0.85} ${curve * 0.35 + 6} Z` : "");
      tongue.setAttribute("d", open > 0.3 ? `M ${-w * 0.45} ${hgt + curve * 0.75} Q 0 ${hgt * 0.45 + curve * 0.6} ${w * 0.45} ${hgt + curve * 0.75} Q 0 ${hgt + curve * 1.05} ${-w * 0.45} ${hgt + curve * 0.75} Z` : "");
    }
  }

  window.ChefRig = { mount, POSES, FACES };
})();
