# Revisión · Chef Chino Artavia · Video 01

**Formato:** 1080×1920 (renderizado a 2160×3840), 30 fps, 38,9 s.

## Cómo se construye
- `node gen-voice.mjs`: genera la voz local (Kokoro `em_alex`, español, velocidad 1.08) frase por frase → `assets/voice/l*.wav` + tramos de cada frase.
- `node build.mjs`: genera `index.html` y `compositions/*.html` con los tiempos de la voz, la envolvente para la boca (`assets/env.js`), los subtítulos y `events.json`.
- `/root/lemo-opuscar/.venv/bin/python audio.py`: escribe la música original (marimba, guitarra, bajo, cajón, congas; 100 BPM) y los efectos en `assets/music.wav` y `assets/sfx.wav`.
- `npx hyperframes render --resolution portrait-4k --quality delivery`, luego normalización a −14 LUFS.

## Lo revisado
- Fotograma 0: título del gancho ya en pantalla con la carne cayendo (sirve de miniatura).
- Subtítulos dentro de la zona segura (y≈1150–1300), con fondo oscuro detrás para leerse sobre fondos claros.
- Cortes: sartén → chef ("NO"), chef → pergamino del siglo XIX, sello "MITO" en "poros", jugo, vuelta de la carne en "¡Por sabor!", acercamiento a la costra en "Maillard", iris al carro con portazo, tabla con cortes, cierre con "Siguiendo ✓" y "¡Pura vida!".
- `hyperframes check`: sin errores después de las correcciones. Queda un aviso: "¿El verdadero truco?" está 0,84 s en pantalla porque la frase dura eso; los subtítulos lo repiten.
- Audio: medido, no escuchado. Voz ≈ −16 LUFS por línea, música ≈ −25 LUFS (unos 9 dB por debajo de la voz, con duck de −5 dB al hablar), efectos en su fotograma + 1.

## Límites conocidos
- La voz es sintética local (Kokoro): acento español neutro, no costarricense. Con HeyGen o ElevenLabs se puede cambiar sin tocar el resto: se regeneran los WAV y se corre `build.mjs` y `audio.py` de nuevo.
- La sincronía de las palabras es aproximada dentro de cada frase (reparto por sílabas); los inicios de frase son exactos.
