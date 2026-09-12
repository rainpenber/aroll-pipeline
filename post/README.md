# Stage B — 文稿序组装 + Premiere FCP7 XML

## 导出原则
- 只放 **VO 片段**（指向原始 wav 的入出点）
- AROLL / 气口 = 时间线上的 **空档 gap**，不插入静音素材
- 方便在 Premiere 里直接拖出入点微调

## 导入
`Z:\2026.08西昊C300\AROLL\chatcut\stage-a-sample\stage-b\out\AROLL-StageB.xml`

Premiere：`文件 → 导入` → 选 `.xml`

```powershell
node D:\coding\aroll-pipeline\post\export_xmeml.js `
  <assemble_plan.json> `
  <out.xml>
```
