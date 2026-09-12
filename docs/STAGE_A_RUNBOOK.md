# Stage A 实跑纪要（样本 aroll_sample）

日期：2026-09-12  
样本：`D:\coding\arollcut\ref\aroll_sample.wav` + 同目录文稿  
输出：`Z:\2026.08西昊C300\AROLL\chatcut\stage-a-sample\剪口播\`

## 本轮结果

| 步骤 | 状态 | 产物 |
|------|------|------|
| ASR 2.0（seedasr） | ✅ | `1_转录/volcengine_v3_result.json`（~19:48，4072 字文本，170 utterances） |
| 字级字幕 | ✅ | `1_转录/subtitles_words.json`（3664 字 + 312 静音） |
| 分析 | ✅ | `2_分析/analysis.txt`（312 句）+ `sentence_map.json` |
| 整句标删 | ✅ | `2_分析/speech_errors.json`（~252 整句删；偏紧，审核页可勾回） |
| 自动口癖 | ✅ | `delete_idx` +6（然后/那/嗯） |
| 审核页 | ✅ | `3_审核/{review.html,data.json,audio.mp3,...}` |
| 审核服务 | ✅ | `http://localhost:8899`；本机也可双击 `3_审核/启动审核服务.cmd` |

下一步：你在审核页确认后导出 FCPXML；再用真实 Stage A 产物做 Stage B。

---

## 踩坑与经验沉淀

### 1. Git Bash 找不到 ffmpeg

**现象**：`run_stage_a.ps1` → `run_transcribe.sh` 抽音频失败（exit 127 / 找不到 ffmpeg）。

**原因**：Git Bash 继承的 PATH 里没有本机 ffmpeg。

**处理**：
- 本机固定路径：`C:\App\ffmpeg\bin`
- 已写入 `D:\coding\aroll-pipeline\scripts\run_stage_a.ps1`：启动前把该目录 prepend 到 `$env:Path`
- Stage A / Git Bash 相关任务都先保证该目录在 PATH

**经验**：Windows 上不要假设 `ffmpeg` 全局可用；流水线入口脚本自己补 PATH。

---

### 2. `Z:` 路径在 Git Bash / PowerShell 混用翻车

**现象 A**：ASR 已成功写出 `volcengine_v3_result.json`，但紧接着：
`❌ 找不到文件: /z/.../1_转录\volcengine_v3_result.json`（正斜杠目录 + 反斜杠文件名）。

**现象 B**：包装脚本里若把 OutDir 弄成错误盘符，会出现 `D:\z\...` 这种假路径。

**原因**：
- Bash 侧用 `/z/...`，Node（Windows）侧对「混斜杠」或错误拼接不稳健
- PowerShell 传空参数 `""` 给 `generate_subtitles.js` 时，空参常被丢掉，导致第 3 参（输出目录）被当成 `delete_segments.json`，触发 `EISDIR`

**处理**：
- 转录成功后若字幕步骤挂了：**不要重跑 ASR**；在 `1_转录` 目录内用 Windows 路径续跑：
  ```powershell
  cd $T
  node D:\coding\ai-jian-koubo\scripts\generate_subtitles.js .\volcengine_v3_result.json
  ```
- 调用 `generate_subtitles.js` 时：**不要传空的 delete 文件参数**；需要指定输出目录时，先 `Push-Location` 到目标目录，或显式传真实 delete JSON
- `Convert-ToGitBashPath`：`Z:\foo` → `/z/foo`；后续 PowerShell 列目录必须用 `Z:\foo`，绝不能把 `/z` 当成 `D:\z`

**经验**：跨 Bash/Node/PowerShell 时，**每个进程只用一种路径方言**；续跑优先纯 PowerShell + `D:\`/`Z:\`。

---

### 3. `generate_subtitles.js` 参数语义

```
node generate_subtitles.js <volcengine_v3_result.json> [delete_segments.json] [outDir]
```

- `outDir` 默认 `.`（写到 cwd）
- PowerShell 的 `""` 不会稳定地传到 Node
- 官方 `run_transcribe.sh` 传了空 delete + outDir；在 Git Bash 下可行，在 PowerShell 直调易错位

**经验**：Windows 续跑用「先 cd 再只传 result 文件」最稳。

---

### 4. 分析文本带 UTF-8 BOM

**现象**：从 Temp/`Out-File -Encoding utf8` 拷到 Linux box 后，首行变成 `\uFEFF0: 咳`，正则解析失败。

**处理**：读文件时 `.replace(/^\uFEFF/, '')`，或 `sed` 去 BOM。

**经验**：跨机拷文本默认按「可能有 BOM」处理。

---

### 5. 整句标删（5.3）在多 take 口播上的尺度

样本是典型多 take：同句反复重说、残句、中途改词（如「双轨」纠正戏）。

**做法**：
1. 规则基线：`用户习惯/规则.md`（删前保后、残句、语气词整句）
2. 启发式簇内只留一句 + 人工收紧/回补连接句
3. **审核页是安全网**：本轮偏紧（~252/312 整句预删），漏掉的连接句可在网页取消勾选；过删比漏删难恢复，但多 take 素材不过删会极度啰嗦

**经验**：
- 纯启发式「前缀相同」容易把不相关句粘成一簇，或拆不开被插嘴打断的 take → **必须人工扫一遍 kept 列表**
- 「双轨 / 读过了 / 咳」等 meta、废 take 应进硬删名单
- Stage A 目标是「可审的预删」，不是免审成片

---

### 6. 审核服务保活

**现象**：agent 会话结束后台 Node 会被收走 → 浏览器「拒绝连接」。

**处理**：
- 优先 `serve_review.sh`（OS 新开终端）
- 本机已落盘：`3_审核/启动审核服务.cmd`（含 `C:\App\ffmpeg\bin` PATH）
- 默认 URL：`http://localhost:8899`

**经验**：审核服务必须由**用户可见的独立终端**持有，不要挂在 agent 临时 shell。

---

### 7. 路径与仓库边界（提醒）

| 用途 | 位置 |
|------|------|
| 代码 / skill fork | `D:\coding\ai-jian-koubo`、`D:\coding\aroll-pipeline` |
| 工作产物 | `Z:\...`（不放代码与 runtime） |
| API Key | 仅 `D:\coding\ai-jian-koubo\.env` |
| ffmpeg | `C:\App\ffmpeg\bin` |

CopyFromBox/Read 对 `D:\coding` 可能受 local-exec 根目录限制 → 大文件/脚本落地可经 `C:\Users\scott\AppData\Local\Temp` 中转。

---

## 推荐续跑命令（PowerShell）

```powershell
$env:Path = "C:\App\ffmpeg\bin;" + $env:Path
$Skill = "D:\coding\ai-jian-koubo"
$Base  = "Z:\2026.08西昊C300\AROLL\chatcut\stage-a-sample\剪口播"
$T = "$Base\1_转录"; $A2 = "$Base\2_分析"; $A3 = "$Base\3_审核"

# 若只有 ASR 结果、缺字幕：
Set-Location $T
node "$Skill\scripts\generate_subtitles.js" .\volcengine_v3_result.json
node "$Skill\scripts\gen_analysis.js" "$T\subtitles_words.json" $A2

# 有 speech_errors.json 之后：
node "$Skill\scripts\auto_filler.js" "$A2\sentence_map.json" "$T\subtitles_words.json" "$A2\speech_errors.json"
node "$Skill\scripts\merge_selections.js" "$A2\sentence_map.json" "$A2\speech_errors.json" "$A2\auto_selected.json"
node "$Skill\scripts\generate_review.js" "$T\subtitles_words.json" "$A2\auto_selected.json" "$T\audio.mp3" $A3

# 起审核页：
Start-Process "$A3\启动审核服务.cmd"
# 浏览器打开 http://localhost:8899
```

## 后续改进（未做）

1. `run_stage_a.ps1` / `run_transcribe.sh`：Windows 下字幕步骤改为 Node 直调，避免混路径  
2. 把「多 take 删前保后」收成可复用脚本进 `aroll-pipeline/scripts/`（需你确认尺度后再固化）  
3. Stage B：对审核后的 keeps + 文稿做文稿序 / last-good / AROLL 静音槽 / Premiere FCP7

### 8. `启动审核服务.cmd` 首行「文件名、目录名或卷标语法不正确」

**现象**：独立 CMD 窗口第一行报该错，但随后仍打印 `READY_PORT=8899` / 审核服务器已启动。

**原因**：早期 `.cmd` 用 ASCII 写出，中文路径在 `cd /d` 时被损坏；`Start-Process -WorkingDirectory` 已把进程放在正确的 `3_审核`，故 `cd` 失败不影响 Node。

**处理**：`.cmd` 改为 UTF-8 BOM + `chcp 65001`。若仍看到该行可忽略，只要后面有 `READY_PORT` 且浏览器能开 `http://localhost:8899` 即可。

### 9. 标删误偏好「更完整的前句」，违背「删前保后 / 后半句重录」

**用户偏好（已确认）**：多 take 与后半句重录一律时间更靠后的合格段落优先；后 take 若只重录后半句，应 **保留后 take**，并用词级删除盖住前句被覆盖的后半，而不是整句保留前句、整句删后句。

**反例（本轮）**：
- 句 159 保留 `腿长就前伸一些腿短就后缩一些`（11:41）
- 句 160 整句删除 `腿短就后缩一些`（11:44）← 应为后半重录保留

同类反模式本轮约 **16 处**（kept 较长前句 + deleted 较短后缀后句）。

**原因**：本轮 5.3 非整句 LLM 逐条审，而是启发式「簇内留 completeness 最高（偏长）的一句」+ 人工 keep 名单；与官方 `规则.md` A1「删前保后」以及用户 AROLL last-good 不一致。

**正确处理（后续应落地）**：
1. 整句簇：默认可删前留后（后句完整度足够时）
2. 后句是前句 **后缀**（后半重录）：保留后句；对前句做词级 `delete_idx` 删掉被覆盖的后半，保留前半
3. 不要用「谁更长谁留下」作为主规则

### 10. 已落地：`scripts/recalc_last_good.js`（删前保后 + 后半重录）

重算样本后验证：
- 158 整句删；159 保留「腿长就前伸一些」并词级删后半；160 整句保留「腿短就后缩一些」

**重算时注意**：`merge_selections.js` 是往已有 `auto_selected.json` **并集**写入。若旧版曾整句删过后 take，必须先再跑一次 `gen_analysis.js` 重置静音预选，再 `auto_filler` → `merge` → `generate_review`，否则旧删除会残留。

## 流程约定（2026-09-12 对齐）

```
脚本粗筛（recalc_last_good）
  → LLM 复核（llm_review_patch / 人工规则补丁）
  → 人工审核页（仍可改）
  → Stage B：文稿序对齐 + AROLL 静音槽 + 导出 FCP7（临门一脚）
```

- **Take 选择**（删前保后、后半重录）留在 Stage A / A.5，不进 Stage B。
- Stage B 在 A 段定稿后，主要工作是插 AROLL 静音槽并导出；可改动空间相对小。
- 重算标删时必须先 `gen_analysis` 重置 `auto_selected`，再 merge。
### 12. 全量重跑（coverage-aware）

`scripts/recalc_last_good.js` 已改为：仅当后句**语义覆盖**前句时才整句删前；分句/后半重录保留前半；soft 匹配「地」。样本已按此全量重解析并刷新审核页。
