#!/usr/bin/env node
/**
 * Stage A 脚本粗筛 — 删前保后 + 后半/分句重录（含语义覆盖检查）
 *
 * 核心修正（2026-09-12）：
 * 后句若只重录下一分句/后半，且并不覆盖前句独特语义，
 * 不得因 related / 更长 就整句删前句；应保留前半最后合格遍，必要时词级裁前句被覆盖的后半。
 * 后缀匹配容忍「地」等 ASR 微差。
 */
const fs = require('fs');
const dir = process.argv[2] || '.';
const analysis = fs.readFileSync(`${dir}/analysis.txt`, 'utf8').replace(/^\uFEFF/, '');
const map = JSON.parse(fs.readFileSync(`${dir}/sentence_map.json`, 'utf8'));
const words = JSON.parse(fs.readFileSync(`${dir}/subtitles_words.json`, 'utf8'));

const sents = analysis.split(/\r?\n/).filter(Boolean).map((l) => {
  const m = l.match(/^(\d+):\s*(.*)$/);
  if (!m) throw new Error('bad line: ' + l);
  return { id: +m[1], text: m[2].trim() };
});

const particles = new Set([
  '咳', '嗯', '啊', '哎', '诶', '呃', '额', '唉', '哦', '噢', '呀', '欸',
  '对', '好', '好吧', '然后', '那', '但', '体', '就', '靠', '双', '轨', '弯', '曲', '漏', '想', '更', '能', '同时',
]);
const hardExact = new Set([
  '想', '控制', '更', '爽的是', '作为', '所以最', '挺直', '想挺直腰板', '低一点', '后仰一些',
  '给后脑勺', '给后', '大曲面', '大曲面大曲面', '曲子', '弯', '曲', '腰靠采用了', '能', '同时',
  '漏', '双轨', '双', '轨', '什么东西', '什么双轨没有双轨', '不对这个地方为什么多了个双轨',
  '有套弹力滑翔', '结构有套弹力', '就', '弹力就行了不要双轨', '靠', '哦我现在', '玩的时候', '双手',
  '但', '体', '往后倒一倒', '然后', '扶手', '嗯这好像读过了', '晚上十二点人很少午休的时候',
  '到软件', '怎么走怎么做更舒服', '调节了', '再松手', '俯仰平移', '旋转翻折', '椅背往后放倒',
  '发生轻微的变化是发会发生轻微变化的而我现在做的这把西号C300', '终我选了西昊的DLSPro',
]);

const deleteSentences = new Set();
const deleteIdx = new Set();

function soft(t) {
  return (t || '')
    .replace(/地/g, '')
    .replace(/的/g, (m, i, s) => s) // keep 的 for now — only strip 地 which caused half-miss
    .replace(/\s+/g, '');
}

function isParticleOnly(t) {
  if (!t) return true;
  if (particles.has(t) || hardExact.has(t)) return true;
  if (t.length <= 2) return true;
  if ([...t].every((c) => '嗯啊呃额唉哦噢呀欸哎诶对好咳 '.includes(c))) return true;
  return false;
}

function nonGapIdxs(sid) {
  const info = map[sid];
  if (!info) return [];
  const out = [];
  for (let i = info.startIdx; i <= info.endIdx; i++) {
    if (words[i] && !words[i].isGap) out.push(i);
  }
  return out;
}

function idxsForSoftSuffix(sid, suffixText) {
  const idxs = nonGapIdxs(sid);
  const target = soft(suffixText);
  if (!idxs.length || !target) return [];
  for (let k = 0; k < idxs.length; k++) {
    const joined = soft(idxs.slice(k).map((i) => words[i].text).join(''));
    if (joined === target) return idxs.slice(k);
  }
  // startswith soft suffix from some k (later shorter ending)
  for (let k = 0; k < idxs.length; k++) {
    const joined = soft(idxs.slice(k).map((i) => words[i].text).join(''));
    if (joined.endsWith(target) && target.length >= 4) {
      // find exact cut point by expanding from end
      let remain = target.length;
      // approximate: walk back collecting soft length
      // fallback: return from k if joined===target already handled; if endsWith, trim prefix chars
      let acc = '';
      const picked = [];
      for (let j = idxs.length - 1; j >= k; j--) {
        picked.push(idxs[j]);
        acc = soft(words[idxs[j]].text) + acc;
        if (acc === target) return picked.reverse();
        if (acc.length > target.length) break;
      }
    }
  }
  return [];
}

function sharePrefix(a, b, n = 6) {
  const sa = soft(a), sb = soft(b);
  if (sa.length < n || sb.length < n) return sa === sb || sa.startsWith(sb) || sb.startsWith(sa);
  return sa.slice(0, n) === sb.slice(0, n);
}

function related(a, b) {
  if (!a || !b) return false;
  const sa = soft(a), sb = soft(b);
  if (sa === sb) return true;
  if (sa.includes(sb) || sb.includes(sa)) return true;
  return sharePrefix(a, b, 6);
}

/** later fully replaces earlier (safe to whole-delete earlier) */
function covers(later, earlier) {
  const L = soft(later), E = soft(earlier);
  if (!E || !L) return false;
  if (L === E) return true;
  if (L.includes(E)) return true; // later contains earlier
  if (E.length >= 4 && L.startsWith(E)) return true; // earlier is prefix of later
  // high overlap same-clause: longer later with same opening and earlier mostly inside later
  if (sharePrefix(later, earlier, 8) && E.length <= L.length && L.includes(E.slice(0, Math.min(12, E.length)))) {
    // require most of earlier appears in later
    const head = E.slice(0, Math.min(16, E.length));
    if (L.includes(head) && E.length <= L.length * 1.05) return true;
  }
  return false;
}

/** unique head of earlier not covered by later — must keep if non-empty meaningful */
function uncoveredHead(earlier, later) {
  const E = soft(earlier), L = soft(later);
  if (!E) return '';
  if (L.includes(E) || L.startsWith(E)) return '';
  // if later is soft-suffix of earlier, head is the prefix
  if (E.endsWith(L) && L.length >= 4 && E.length > L.length) {
    return earlier.slice(0, earlier.length - later.length); // approx raw; enough for length check
  }
  // if they share no long prefix and later doesn't contain earlier head → uncovered
  if (!sharePrefix(earlier, later, 5)) {
    // continuation clause (而是/所以/你就会/直到/并且…)
    return earlier;
  }
  // shared prefix: find divergence
  let i = 0;
  const sa = soft(earlier), sb = soft(later);
  while (i < sa.length && i < sb.length && sa[i] === sb[i]) i++;
  // if later continues beyond shared prefix only, earlier may still have unique middle — keep earlier whole unless suffix case
  if (sa.startsWith(sb) || sb.startsWith(sa)) return sa.startsWith(sb) ? '' : earlier;
  return earlier; // conservative: treat as uncovered
}

function isSoftSuffixRetake(earlier, later) {
  const E = soft(earlier), L = soft(later);
  return L.length >= 4 && E.length > L.length && E.endsWith(L);
}

function isContinuationStart(t) {
  return /^(而是|所以|你就会|直到|并且|同时|而且|那|然后|再|当我|整个|像我|不论|还能|又不|这时候)/.test(t);
}

function wholeDelete(sid) {
  deleteSentences.add(sid);
  for (const i of nonGapIdxs(sid)) deleteIdx.delete(i);
}
function wholeKeep(sid) {
  deleteSentences.delete(sid);
}
function applyHalfRetake(earlierId, laterText) {
  wholeKeep(earlierId);
  // clear previous cuts on earlier then apply
  for (const i of nonGapIdxs(earlierId)) deleteIdx.delete(i);
  const cover = idxsForSoftSuffix(earlierId, laterText);
  if (!cover.length) {
    console.warn('halfRetake miss', earlierId, laterText.slice(0, 40));
    return false;
  }
  for (const i of cover) deleteIdx.add(i);
  return true;
}

// Pass 0: particles / hard
for (const s of sents) {
  if (isParticleOnly(s.text)) wholeDelete(s.id);
}

const WINDOW = 10;

// Pass 1: pairwise decisions with coverage check
for (let i = 0; i < sents.length; i++) {
  const a = sents[i];
  if (deleteSentences.has(a.id)) continue;

  for (let j = i + 1; j < Math.min(i + WINDOW, sents.length); j++) {
    const b = sents[j];
    if (deleteSentences.has(b.id)) continue;

    const A = a.text, B = b.text;

    // Soft suffix / half-retake: keep both structurally, cut covered suffix on earlier
    if (isSoftSuffixRetake(A, B)) {
      applyHalfRetake(a.id, B);
      continue;
    }

    // Earlier is soft-prefix of later → 删前保后
    if (covers(B, A) && soft(B).length >= soft(A).length) {
      wholeDelete(a.id);
      break;
    }

    // Related but later does NOT cover earlier → clause split / continuation
    if (related(A, B) || (isContinuationStart(B) && j <= i + 4)) {
      const head = uncoveredHead(A, B);
      if (head && soft(head).length >= 4) {
        // Do NOT delete A. If A ends with something that B covers as continuation start overlap, try cut overlapping soft suffix of A that equals B or prefix of B
        // e.g. A = 也不是因为…而是当…时间 , B = 而是当…大部分时间… → cut A's trailing 而是当…
        if (isContinuationStart(B) || !sharePrefix(A, B, 6)) {
          // find longest soft suffix of A that is prefix of B or equals soft(B) head
          const idxs = nonGapIdxs(a.id);
          let cutFrom = -1;
          for (let k = 1; k < idxs.length; k++) {
            const suf = soft(idxs.slice(k).map((x) => words[x].text).join(''));
            const Lb = soft(B);
            if (suf.length >= 4 && (Lb.startsWith(suf) || suf.startsWith(Lb.slice(0, Math.min(suf.length, Lb.length))) && Lb.includes(suf.slice(0, Math.min(8, suf.length))))) {
              // stronger: Lb.startsWith(suf) or suf is prefix of Lb
              if (Lb.startsWith(suf) || (suf.length >= 6 && Lb.startsWith(suf.slice(0, 6)))) {
                cutFrom = k;
                break; // earliest cut (= longest suffix) — actually want longest suffix → smallest k that still matches
              }
            }
          }
          // prefer longest matching suffix: scan k from 0..n
          cutFrom = -1;
          for (let k = 0; k < idxs.length; k++) {
            const suf = soft(idxs.slice(k).map((x) => words[x].text).join(''));
            if (suf.length < 4) continue;
            const Lb = soft(B);
            if (Lb.startsWith(suf) || (suf.length <= Lb.length && Lb.startsWith(suf.slice(0, Math.min(10, suf.length))) && soft(A).endsWith(suf))) {
              cutFrom = k;
              break;
            }
          }
          // also: if soft(A).includes continuation marker shared with B
          if (cutFrom < 0) {
            const markers = ['而是', '所以', '你就会', '直到', '并且', '同时', '而且'];
            for (const mk of markers) {
              if (soft(B).startsWith(soft(mk)) && soft(A).includes(soft(mk))) {
                // cut from first occurrence of marker in A words
                let acc = '';
                for (let k = 0; k < idxs.length; k++) {
                  const from = idxs.slice(k).map((x) => words[x].text).join('');
                  if (soft(from).startsWith(soft(mk)) || from.startsWith(mk)) {
                    cutFrom = k;
                    break;
                  }
                }
                if (cutFrom >= 0) break;
              }
            }
          }
          if (cutFrom >= 0) {
            wholeKeep(a.id);
            for (const i2 of idxs.slice(cutFrom)) deleteIdx.add(i2);
          }
          // keep B as later clause; don't delete A
          continue;
        }
      }

      // related + covered or near-duplicate same clause → delete earlier
      if (covers(B, A) || soft(A) === soft(B) || (sharePrefix(A, B, 8) && soft(B).length >= soft(A).length * 0.9)) {
        wholeDelete(a.id);
        break;
      }
    }
  }
}

// Pass 2: same-text duplicates — keep last only
const bySoft = new Map();
for (const s of sents) {
  if (deleteSentences.has(s.id)) continue;
  // ignore sentences that are only prefix donors with cuts — still can dedupe exact soft text of KEPT words
  const idxs = nonGapIdxs(s.id).filter((i) => !deleteIdx.has(i));
  const kept = idxs.map((i) => words[i].text).join('');
  const key = soft(kept);
  if (key.length < 4) continue;
  if (!bySoft.has(key)) bySoft.set(key, []);
  bySoft.get(key).push(s.id);
}
for (const ids of bySoft.values()) {
  if (ids.length < 2) continue;
  ids.sort((a, b) => a - b);
  for (let k = 0; k < ids.length - 1; k++) wholeDelete(ids[k]);
}

// Pass 3: fully cut sentences → whole delete
for (const s of sents) {
  if (deleteSentences.has(s.id)) continue;
  const idxs = nonGapIdxs(s.id);
  if (idxs.length && idxs.every((i) => deleteIdx.has(i))) {
    wholeDelete(s.id);
  }
}

const out = {
  delete_sentences: [...deleteSentences].sort((a, b) => a - b),
  delete_idx: [...deleteIdx].sort((a, b) => a - b),
  _meta: {
    stage: 'A-script-filter',
    rule: '删前保后 + 后半/分句重录；无语义覆盖不整句删前；soft匹配地',
  },
};
fs.writeFileSync(`${dir}/speech_errors.json`, JSON.stringify(out, null, 2));

function status(sid) {
  const idxs = nonGapIdxs(sid);
  const kept = idxs.filter((i) => !deleteIdx.has(i)).map((i) => words[i].text).join('');
  return {
    sid,
    mark: deleteSentences.has(sid) ? 'DEL' : kept.length < soft(sents.find((s) => s.id === sid).text).length ? 'CUT' : 'KEEP',
    kept: deleteSentences.has(sid) ? '' : kept,
  };
}

console.log(JSON.stringify({ delete_sentences: out.delete_sentences.length, delete_idx: out.delete_idx.length }, null, 2));
console.log('--- cluster 也不是/而是当 ---');
for (const sid of [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]) {
  console.log(JSON.stringify(status(sid)));
}
console.log('--- cluster 腿长 ---');
for (const sid of [158, 159, 160]) console.log(JSON.stringify(status(sid)));

// dump keep/cut timeline
const rows = [];
for (const s of sents) {
  const st = status(s.id);
  if (st.mark === 'DEL') continue;
  rows.push(`${String(s.id).padStart(3)} ${st.mark} ${st.kept}`);
}
fs.writeFileSync(`${dir}/timeline_keep.txt`, rows.join('\n'));
console.log('kept/cut lines', rows.length);
