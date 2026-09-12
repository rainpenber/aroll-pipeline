#!/usr/bin/env node
/**
 * Stage B: align keeps clips to script order; insert AROLL silence slots.
 * Usage: node assemble_plan.js <script.txt> <keeps.json> <outDir>
 */
const fs = require('fs');
const path = require('path');

const [,, scriptPath, keepsPath, outDir] = process.argv;
const scriptRaw = fs.readFileSync(scriptPath, 'utf8').replace(/^\uFEFF/, '');
const keeps = JSON.parse(fs.readFileSync(keepsPath, 'utf8'));

function soft(t) {
  return (t || '')
    .replace(/[“”"']/g, '')
    .replace(/[，。！？、；：\s\t\n\r]/g, '')
    .replace(/地/g, '')
    .replace(/过/g, '个') // ASR 过/个
    .replace(/希奥|西号/g, '西昊')
    .replace(/熨烫/g, '犯懒')
    .toLowerCase();
}
function fuzzyIncludes(hay, needle) {
  if (!needle || !hay) return false;
  if (hay.includes(needle)) return true;
  // allow 1-char mismatch windows for short needles
  if (needle.length < 6) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let diff = 0;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) diff++;
    if (diff <= 1) return true;
  }
  return false;
}

function parseScriptLines(raw) {
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((text, i) => ({
    id: i,
    text,
    soft: soft(text),
  }));
}

function scoreMatch(scriptSoft, clipSoft) {
  if (!scriptSoft || !clipSoft) return 0;
  if (scriptSoft === clipSoft) return 1;
  if (clipSoft.includes(scriptSoft) || scriptSoft.includes(clipSoft)) {
    const ratio = Math.min(scriptSoft.length, clipSoft.length) / Math.max(scriptSoft.length, clipSoft.length);
    return 0.75 + 0.25 * ratio;
  }
  // shared prefix length
  let i = 0;
  while (i < scriptSoft.length && i < clipSoft.length && scriptSoft[i] === clipSoft[i]) i++;
  const pref = i / Math.max(8, Math.min(scriptSoft.length, clipSoft.length));
  // bigram overlap
  const grams = (s) => {
    const g = new Set();
    for (let k = 0; k < s.length - 1; k++) g.add(s.slice(k, k + 2));
    return g;
  };
  const A = grams(scriptSoft), B = grams(clipSoft);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const jacc = inter / Math.max(1, A.size + B.size - inter);
  return Math.max(pref * 0.6, jacc);
}

const script = parseScriptLines(scriptRaw);
const clips = keeps.clips.map((c, i) => ({ ...c, i, soft: soft(c.text), used: false }));

const AROLL_SILENCE = 5.0; // seconds
const LOCATOR_PAD = 5.0;
const BREATH = 0.1;

// Greedy: for each script line, pick best unused clip above threshold; allow one clip to cover multiple consecutive script lines if clip contains them
const plan = [];
let clipPtr = 0;

for (let s = 0; s < script.length; s++) {
  const line = script[s];
  let best = null;
  let bestScore = 0;
  // search nearby unused clips (prefer chronological)
  for (const c of clips) {
    if (c.used) continue;
    const sc = scoreMatch(line.soft, c.soft);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }

  if (best && bestScore >= 0.42) {
    // If clip already starts much earlier content covering previous lines, still OK — mark used once
    // Check if this clip can also absorb following short script lines that are substrings
    const covered = [line.id];
    let absorbUntil = s;
    for (let t = s + 1; t < Math.min(script.length, s + 4); t++) {
      if ((fuzzyIncludes(best.soft, script[t].soft) || best.soft.includes(script[t].soft)) && script[t].soft.length >= 4) {
        covered.push(script[t].id);
        absorbUntil = t;
      } else break;
    }
    best.used = true;
    plan.push({
      type: 'vo',
      script_ids: covered,
      script_text: covered.map((id) => script[id].text).join(''),
      clip_index: best.i,
      src_start: best.start,
      src_end: best.end,
      text: best.text,
      match_score: Number(bestScore.toFixed(3)),
      breath_after: BREATH,
    });
    s = absorbUntil;
  } else {
    // AROLL slot — merge consecutive unmatched into one slot
    const ids = [line.id];
    let texts = [line.text];
    while (s + 1 < script.length) {
      // peek if next would also miss
      const next = script[s + 1];
      let ns = 0, nb = null;
      for (const c of clips) {
        if (c.used) continue;
        const sc = scoreMatch(next.soft, c.soft);
        if (sc > ns) { ns = sc; nb = c; }
      }
      if (nb && ns >= 0.42) break;
      s++;
      ids.push(script[s].id);
      texts.push(script[s].text);
    }
    plan.push({
      type: 'aroll_slot',
      script_ids: ids,
      script_text: texts.join(''),
      duration: AROLL_SILENCE,
      pad_mode: 'silence_only',
      note: '文稿有、keeps 无完整覆盖 → AROLL 静音占位',
    });
  }
}

// Append unused late clips as orphans (manual review)
const orphans = clips.filter((c) => !c.used).map((c) => ({
  clip_index: c.i,
  src_start: c.start,
  src_end: c.end,
  text: c.text,
}));

const assemble = {
  version: 1,
  created: new Date().toISOString(),
  source: {
    keeps: keepsPath,
    script: scriptPath,
    audio_mp3: keeps.audio_mp3,
    original_wav: keeps.original_wav,
    fps: keeps.fps || 29.97,
  },
  rules: {
    order: 'script',
    unmatched: 'aroll_silence_slot',
    aroll_silence_sec: AROLL_SILENCE,
    breath_sec: BREATH,
    match_threshold: 0.42,
  },
  stats: {
    script_lines: script.length,
    vo_items: plan.filter((p) => p.type === 'vo').length,
    aroll_slots: plan.filter((p) => p.type === 'aroll_slot').length,
    orphan_clips: orphans.length,
  },
  timeline: plan,
  orphans,
  editable: true,
  note: '人工可改 timeline[]：调 clip 入出点、改 type、合并/拆分 aroll_slot，再跑 export_xmeml.js',
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'assemble_plan.json'), JSON.stringify(assemble, null, 2));
fs.writeFileSync(
  path.join(outDir, 'assemble_plan.txt'),
  plan
    .map((p, i) => {
      if (p.type === 'vo') return `${i}\tVO\t${p.src_start.toFixed(2)}-${p.src_end.toFixed(2)}\tscore=${p.match_score}\t${p.script_text}\n   << ${p.text}`;
      return `${i}\tAROLL\t${p.duration}s\t${p.script_text}`;
    })
    .join('\n'),
  'utf8'
);
console.log(JSON.stringify(assemble.stats, null, 2));