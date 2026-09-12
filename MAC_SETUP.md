# AROLL 口播管线 — 新电脑安装指南（macOS）

给另一个 agent / 你自己在 Mac 上从零装好整套工具。看完应能直接开工，不缺依赖、不缺仓库、不缺配置步骤。

## 这套东西解决什么问题

口播剪辑最耗时的是：对着**逐字稿** + 很长一段口播音频，在 Premiere 里挑 take、留最后合格遍、切气口、给没录口播的出镜句留空位。

今天的流水线：

```
文稿 + 口播音频
  → Stage A（ai-jian-koubo fork）
      ASR（火山 2.0）→ 脚本粗筛（删前保后）→ LLM 复核 → 审核网页手改
  → Stage B（aroll-pipeline）
      按文稿顺序挂片段 → 文稿有录音无则留时间线空档 → 导出 Premiere FCP7 XML
```

**不要**把火山 API Key 提交进 Git。只在本机 `.env`。

## 仓库（用你的 fork，不要用上游原版当日常）

| 用途 | 仓库 | 说明 |
|------|------|------|
| Stage A | `https://github.com/rainpenber/ai-jian-koubo` | fork 自 lcbuaaliu/ai-jian-koubo，含 ASR 2.0 等改动 |
| Stage B | `https://github.com/rainpenber/aroll-pipeline` | 文稿对齐 + Premiere XML |

安装时把 `rainpenber` 换成实际 GitHub 用户名。

## 默认安装位置

默认装到用户目录下：

```text
~/AROLL/
  ai-jian-koubo/
  aroll-pipeline/
```

若用户指定了别的目录（例如 `~/Developer/aroll`），全程用用户给的根目录替换 `~/AROLL`。

## 1. 系统依赖

在 Terminal 执行：

```bash
# Homebrew（若无）
 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install git node ffmpeg
# 可选：GitHub CLI（方便以后拉仓库）
brew install gh
```

检查：

```bash
node -v
ffmpeg -version | head -1
git --version
```

## 2. 拉取仓库

```bash
mkdir -p ~/AROLL
cd ~/AROLL

git clone https://github.com/rainpenber/ai-jian-koubo.git
git clone https://github.com/rainpenber/aroll-pipeline.git
```

## 3. 配置火山引擎 API Key（仅本机）

1. 打开控制台：https://console.volcengine.com/speech/new/overview  
2. 生成 **一个** API Key  
3. 开通：**录音文件识别 2.0 / seedasr**（`volc.seedasr.auc`）  
4. 可选开通：极速版 `volc.bigasr.auc_turbo`、1.0 标准版 `volc.bigasr.auc`

```bash
cd ~/AROLL/ai-jian-koubo
cp .env.example .env
# 用编辑器打开 .env，填入：
# VOLCENGINE_API_KEY=你的key
# VOLCENGINE_ASR_VERSION=2
```

**禁止**把 `.env` 提交到 git。仓库 `.gitignore` 已忽略它。

自检：

```bash
cd ~/AROLL/ai-jian-koubo
node scripts/doctor.js --force
```

应能看到 seedasr / 2.0 相关探测通过（以 doctor 输出为准）。

## 4. Stage A / B 脚本说明（Mac）

- Stage A 转录入口仍是仓库内 `scripts/run_transcribe.sh`（bash + node + ffmpeg）。  
- Windows 上的 `aroll-pipeline/scripts/run_stage_a.ps1` 在 Mac **不需要**；Mac 直接：

```bash
cd ~/AROLL/ai-jian-koubo
bash scripts/run_transcribe.sh "/path/to/koubo.wav" "/path/to/out" --v2-standard
```

- Stage B：

```bash
cd ~/AROLL/aroll-pipeline
node post/export_keeps_from_auto.js \
  "/path/to/out/剪口播/1_转录/subtitles_words.json" \
  "/path/to/out/剪口播/2_分析/auto_selected.json" \
  "/path/to/job/stage-b/in"

# 放入文稿
cp "/path/to/script.txt" "/path/to/job/stage-b/in/aroll_script.txt"

node post/assemble_plan.js \
  "/path/to/job/stage-b/in/aroll_script.txt" \
  "/path/to/job/stage-b/in/keeps.json" \
  "/path/to/job/stage-b/out"

node post/export_xmeml.js \
  "/path/to/job/stage-b/out/assemble_plan.json" \
  "/path/to/job/stage-b/out/AROLL-StageB.xml"
```

Premiere：`文件 → 导入` → 选 `.xml`（不要用旧 `.xmeml`）。

## 5. 给 agent 用的 skill

把 `docs/AROLL_KOUBO_SKILL.md`（或 ChatCut 已安装的 AROLL口播 skill）拷到新电脑的 agent skills 目录，或让 ChatCut / 助手按该文档执行。

日常口播剪辑建议主要用 **ChatCut + 该 skill**。

## 6. 路径与产物约定

- 代码 / 工具：用户目录下的 `~/AROLL/...`（或用户指定目录）  
- 工作素材与中间产物：建议单独工作盘/项目文件夹，不要和代码混放  
- 最终给用户指出：`AROLL-StageB.xml` 的完整路径  

## 7. 常见坑

| 现象 | 处理 |
|------|------|
| doctor 报无权限 / 45000151 | 控制台开通 seedasr 2.0 |
| 审核页卡顿 | 已有 review.html 性能相关改动；大数据时少开无用面板 |
| Premiere 导不进 | 用 `.xml`；仅 VO 片段 + 时间线空档，无静音 filler |
| VO 间隙 | Stage B 默认 `breath_sec=0.1`；AROLL 空档默认 5s |
| merge 标删残留 | 重算前先 `gen_analysis` 重置 `auto_selected` |

## 8. 验收清单

- [ ] `node` / `ffmpeg` / `git` 可用  
- [ ] 两个仓库已 clone  
- [ ] `.env` 仅本机存在且 doctor 通过  
- [ ] 能跑通一段短音频的 Stage A 转录  
- [ ] 能导出 `AROLL-StageB.xml` 并在 Premiere 导入  