
# AROLL 口播剪辑（给执行 agent）

用**短句**跟用户说话。少用术语。缺什么就问什么，问清再动手。

## 背景（你自己知道即可）

用户剪的是：出镜画面（AROLL）+ 不出镜口播。成片顺序永远跟**文稿**走。本流程先剪出口播轨的 Premiere XML，再让用户回 Premiere 贴画面。

## 开场：先问齐这三样

用最少的话确认（用户可能只给一部分）：

1. **口播音频**（wav/mp3/视频都行）路径？  
2. **文稿**路径？（没有也可以先做 Stage A，但 Stage B 强烈建议有文稿）  
3. **输出目录**？（没有就默认：音频同级下 `aroll-out/`，并告诉用户）

可选：安装根目录（默认 `~/AROLL` 或 Windows `D:\coding`；用户指定则用指定的）。

若缺音频：停，说「先给我口播音频路径」。  
若缺文稿：Stage A 可继续；进 Stage B 前提醒「没有文稿就只能按录音顺序，对不上的句没法留空位」。

## 路径约定

| 东西 | 默认位置 |
|------|----------|
| Stage A 代码 | `<根>/ai-jian-koubo` |
| Stage B 代码 | `<根>/aroll-pipeline` |
| API Key | **只**在 `<根>/ai-jian-koubo/.env`（绝不进 git、不写进聊天全文） |
| ffmpeg | Mac: PATH 里有；Windows: 常见 `C:\App\ffmpeg\bin`，没有就问 |

工作产物放用户给的输出目录，不要写进代码仓库。

---

## Stage A — 听清并标出要删的

目标：得到「审核后的保留片段」，不是成片顺序。

### A0 检查环境

```bash
node "<根>/ai-jian-koubo/scripts/doctor.js" --force
```

失败 → 按安装文档查 key / 是否开通 seedasr 2.0，不要猜。

### A1 转录（火山 ASR 2.0）

```bash
bash "<根>/ai-jian-koubo/scripts/run_transcribe.sh" \
  "<音频>" "<输出目录>" --v2-standard
```

Windows 也可用：

```powershell
& "<根>\aroll-pipeline\scripts\run_stage_a.ps1" -Video "<音频>" -OutDir "<输出目录>"
```

产物在：`<输出>/剪口播/1_转录/`  
（`audio.mp3`、`volcengine_v3_result.json`、`subtitles_words.json`）

若只有 json、缺字幕：在 `1_转录` 目录执行  
`node .../generate_subtitles.js ./volcengine_v3_result.json`  
（不要给空参数，避免 Windows 参数错位。）

### A2 分析

```bash
node "<根>/ai-jian-koubo/scripts/gen_analysis.js" \
  "<输出>/剪口播/1_转录/subtitles_words.json" \
  "<输出>/剪口播/2_分析"
```

### A3 标删（脚本粗筛 → 你复核）

1. 脚本粗筛（删前保后 / 后半重录；**后句盖不住前句语义就不要整句删前句**）：

```bash
node "<根>/aroll-pipeline/scripts/recalc_last_good.js" "<含 analysis+sentence_map+subtitles 的目录或按脚本用法>"
```

（若脚本需要三文件在同目录，把 `analysis.txt`、`sentence_map.json`、`subtitles_words.json` 拷到工作目录再跑。）

2. **你（LLM）再扫一遍**：多 take 留最后合格；后半重录要留前半；勿因「后面更长」删掉仍承担前半意思的句子。

3. 写出 `2_分析/speech_errors.json`：`{ "delete_sentences": [...], "delete_idx": [...] }`

4. **重算前必须先**再跑一次 `gen_analysis.js` 重置 `auto_selected.json`，再：

```bash
node .../auto_filler.js <sentence_map> <subtitles_words> <speech_errors>
node .../merge_selections.js <sentence_map> <speech_errors> <auto_selected>
node .../generate_review.js <subtitles_words> <auto_selected> <audio.mp3> <输出>/剪口播/3_审核
```

### A4 人审

启动审核页（独立终端，别挂死在 agent 后台）：

```bash
bash "<根>/ai-jian-koubo/scripts/serve_review.sh" \
  "<输出>/剪口播/3_审核" "<原音频>" "<根>/ai-jian-koubo/scripts/review_server.js"
```

告诉用户：打开本地审核地址（一般是 `http://localhost:8899`），改完再说一声。  
**等用户确认**再进 Stage B。

---

## Stage B — 按文稿排好并导出 XML

目标：Premiere 能再剪的 XML（只有口播片段 + 空档，**不要**塞静音文件，**不要**拼成一条 wav）。

### B1 导出 keeps

```bash
node "<根>/aroll-pipeline/post/export_keeps_from_auto.js" \
  "<输出>/剪口播/1_转录/subtitles_words.json" \
  "<输出>/剪口播/2_分析/auto_selected.json" \
  "<输出>/stage-b/in"
```

放入文稿：

```bash
cp "<文稿>" "<输出>/stage-b/in/aroll_script.txt"
```

### B2 按文稿组装

```bash
node "<根>/aroll-pipeline/post/assemble_plan.js" \
  "<输出>/stage-b/in/aroll_script.txt" \
  "<输出>/stage-b/in/keeps.json" \
  "<输出>/stage-b/out"
```

规则（已写在脚本里）：
- 顺序 = 文稿顺序  
- 对不上的文稿句 → 时间线 **空档**（默认约 5 秒）  
- 相邻 VO 间隙默认 **0.1 秒**（可改 `assemble_plan.json` 里 `breath_sec`）

用户要改间隙：改 `assemble_plan.json` 后只重跑 B3。

### B3 导出 Premiere XML

```bash
node "<根>/aroll-pipeline/post/export_xmeml.js" \
  "<输出>/stage-b/out/assemble_plan.json" \
  "<输出>/stage-b/out/AROLL-StageB.xml"
```

### B4 告诉用户结果

明确说：

1. XML 路径：`<输出>/stage-b/out/AROLL-StageB.xml`  
2. Premiere：`文件 → 导入` → 选这个 **`.xml`**  
3. 时间线上是一段段口播，中间空档可自己拖出入点；回 Premiere 再贴 AROLL 画面  

---

## 用户只给部分材料时

| 有 | 没有 | 你怎么做 |
|----|------|----------|
| 音频 | 文稿、输出目录 | Stage A；输出默认音频旁 `aroll-out/`；Stage B 前再要文稿 |
| 音频+文稿 | 输出目录 | 默认 `aroll-out/`，告诉用户 |
| 音频+输出 | 文稿 | 做完 Stage A 后问文稿；没有则说明无法按稿留空位 |
| 三样都有 | — | 全流程跑完，最后只强调 XML 路径 |

## 绝对不要

- 把 API Key 打进聊天或提交 git  
- 把 Stage B 拼成一条 timeline wav  
- 用静音 wav 填空档（只要时间线 gap）  
- 没等人审就当 Stage A 定稿  
- 纯学术黑话；对用户用「下一步请…」

## 安装不齐时

让用户先看 `aroll-pipeline/docs/MAC_SETUP.md`（Mac）或仓库 README；缺 ffmpeg / node / 仓库 / key 就停下来列缺什么。