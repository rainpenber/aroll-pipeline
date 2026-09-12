const fs = require('fs');
const path = require('path');
const [,, wordsPath, autoPath, outDir] = process.argv;
const words = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
const auto = new Set(JSON.parse(fs.readFileSync(autoPath, 'utf8')));

const keptWords = [];
for (let i = 0; i < words.length; i++) {
  const w = words[i];
  if (w.isGap) continue;
  if (auto.has(i)) continue;
  keptWords.push({ idx: i, text: w.text, start: w.start, end: w.end });
}

const clips = [];
let cur = null;
for (const w of keptWords) {
  if (!cur) { cur = { start: w.start, end: w.end, text: w.text, idxs: [w.idx] }; continue; }
  if (w.start - cur.end <= 0.45) {
    cur.end = w.end; cur.text += w.text; cur.idxs.push(w.idx);
  } else {
    clips.push(cur);
    cur = { start: w.start, end: w.end, text: w.text, idxs: [w.idx] };
  }
}
if (cur) clips.push(cur);

const keeps = {
  source: 'stage-a-auto_selected-provisional',
  note: 'Provisional keeps from Stage A review preselect',
  audio_mp3: 'Z:/2026.08西昊C300/AROLL/chatcut/stage-a-sample/剪口播/1_转录/audio.mp3',
  original_wav: 'D:/coding/arollcut/ref/aroll_sample.wav',
  script: 'D:/coding/arollcut/ref/aroll_script.txt',
  fps: 29.97,
  stats: { kept_words: keptWords.length, clips: clips.length, deleted_idxs: auto.size },
  clips,
};
fs.writeFileSync(path.join(outDir, 'keeps.json'), JSON.stringify(keeps, null, 2));
fs.writeFileSync(path.join(outDir, 'keeps_text.txt'), clips.map((c, i) => `${i}\t${c.start.toFixed(2)}-${c.end.toFixed(2)}\t${c.text}`).join('\n'), 'utf8');
console.log(JSON.stringify(keeps.stats));