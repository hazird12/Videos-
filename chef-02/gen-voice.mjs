// Voz local (Kokoro em_alex) frase por frase -> assets/voice/<id>.wav + <id>.json con los tramos de cada frase
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const SP = process.env.TMPDIR_VOICE || "/tmp/claude-0/-home-user-Videos-/1510606b-1f4f-514a-b724-2998bba94431/scratchpad/vo2";
fs.mkdirSync(SP, { recursive: true });
const src = fs.readFileSync("build.mjs", "utf8");
const LINES = src.match(/\{ id: "l\d", text: ".*?" \}/g).map((s) => eval("(" + s + ")"));
const H = ["/root/.claude/skills/hyperframes/scripts/plugin-cli.mjs"];
const only = process.argv.slice(2);
for (const L of LINES) {
  if (only.length && !only.includes(L.id)) continue;
  const phrases = L.text.match(/[^.,:!?]+[.,:!?]*/g).map((x) => x.trim()).filter(Boolean);
  // "¿" o "¡" que quedan sueltos al inicio de la siguiente frase
  const parts = [], spans = [];
  let t = 0;
  phrases.forEach((ph, i) => {
    const raw = `${SP}/${L.id}-${i}.wav`, cut = `${SP}/${L.id}-${i}c.wav`;
    execFileSync("node", [...H, "tts", ph, "-v", "em_alex", "-l", "es", "-s", "1.08", "-o", raw, "--json"], { env: { ...process.env, HYPERFRAMES_PYTHON: "/root/lemo-opuscar/.venv/bin/python" } });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.03,areverse", "-ar", "24000", "-ac", "1", cut]);
    const d = +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", cut]).toString();
    spans.push({ text: ph, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
    parts.push(cut);
    const pause = /[.!?]$/.test(ph) ? 0.2 : /[,:]$/.test(ph) ? 0.12 : 0.06;
    t += d;
    if (i < phrases.length - 1) {
      const sil = `${SP}/sil-${Math.round(pause * 1000)}.wav`;
      if (!fs.existsSync(sil)) execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `anullsrc=r=24000:cl=mono`, "-t", String(pause), sil]);
      parts.push(sil);
      t += pause;
    }
  });
  const list = `${SP}/${L.id}.txt`;
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", `assets/voice/${L.id}.wav`]);
  fs.writeFileSync(`assets/voice/${L.id}.json`, JSON.stringify(spans));
  console.log(L.id, spans.map((s) => `${s.start}-${s.end} ${s.text}`).join(" | "));
}
