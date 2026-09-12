# aroll-pipeline

AROLL / 口播剪辑 **Stage B**：把 Stage A（`ai-jian-koubo`）审核后的保留片段，按**文稿顺序**排好，导出 Premiere 可导入的 FCP7 XML。

## 解决什么问题

- 成片顺序跟文稿，不跟录音顺序  
- 多 take 在 Stage A 已尽量「留最后合格」；这里按文稿挂片段  
- 文稿有、口播没有 → 时间线**空档**（方便 Premiere 微调），不用静音文件填充  
- 只导出可再编辑的 `.xml`，不拼 timeline wav  

## 依赖

- Node.js 18+  
- Stage A 产物：`subtitles_words.json` + `auto_selected.json`  
- 文稿：`aroll_script.txt`（一行一句或按现有脚本约定）  

Stage A 仓库：你 fork 后的 `ai-jian-koubo`（火山 ASR 2.0）。API Key **只**放在那个仓库本机 `.env`，本仓库不含密钥。

## 快速跑

```bash
node post/export_keeps_from_auto.js <subtitles_words.json> <auto_selected.json> <stage-b/in>
cp <文稿> <stage-b/in/aroll_script.txt>
node post/assemble_plan.js <stage-b/in/aroll_script.txt> <stage-b/in/keeps.json> <stage-b/out>
node post/export_xmeml.js <stage-b/out/assemble_plan.json> <stage-b/out/AROLL-StageB.xml>
```

Premiere：文件 → 导入 → 选 `AROLL-StageB.xml`。

默认相邻 VO 间隙 `breath_sec=0.1`；AROLL 空档约 5s。可改 `assemble_plan.json` 后只重跑 `export_xmeml.js`。

## 文档

- [docs/PIPELINE.md](docs/PIPELINE.md) — 全流程  
- [docs/STAGE_A_RUNBOOK.md](docs/STAGE_A_RUNBOOK.md) — Stage A 踩坑  
- [docs/MAC_SETUP.md](docs/MAC_SETUP.md) — Mac 新机安装  
- [docs/AROLL_KOUBO_SKILL.md](docs/AROLL_KOUBO_SKILL.md) — 给执行 agent 的 SOP skill  

## 目录

```
post/          Stage B 脚本
scripts/       环境自检、Stage A 封装、删前保后重算等
docs/          文档与 skill 原文
```