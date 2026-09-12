# AROLL 口播管线总览

## 背景

口播出镜片需要：对着文稿挑 take、留最后合格遍、给没录的句子留空位，再进 Premiere 贴画面。本仓库负责 **Stage B**；Stage A 在 fork 后的 `ai-jian-koubo`。

## 流程

```
文稿 + 口播音频
  → Stage A（ai-jian-koubo）
      火山 ASR 2.0 → 脚本「删前保后」→ LLM 复核 → 审核页手改
  → Stage B（本仓库）
      keeps → 按文稿组装 → Premiere FCP7 XML（.xml）
  → Stage C（人手）
      Premiere 导入 XML → 贴 AROLL 画面 → 精修
```

## Stage A 要点

- API Key 只在 `ai-jian-koubo/.env`，永不进 git  
- 默认引擎：录音文件识别 2.0（`volc.seedasr.auc`）  
- 多 take：后句语义盖住前句才删前句；后半重录要留前半  
- 人审通过后再进 Stage B  

详见 [STAGE_A_RUNBOOK.md](STAGE_A_RUNBOOK.md)。

## Stage B 要点

1. `post/export_keeps_from_auto.js`  
2. 放入 `aroll_script.txt`  
3. `post/assemble_plan.js`（文稿序；对不上 → 约 5s 空档；`breath_sec` 默认 0.1）  
4. `post/export_xmeml.js` → `AROLL-StageB.xml`  

**不要**：静音 wav 填空档；拼 timeline wav。空档就是时间线 gap，方便在 Premiere 拖出入点。

## 文档

- [MAC_SETUP.md](MAC_SETUP.md) — Mac 新机安装  
- [AROLL_KOUBO_SKILL.md](AROLL_KOUBO_SKILL.md) — 执行 agent SOP  