# Ajax Proxy V3.0.0 发布记录

本文记录 V3.0.0 首次正式发布的版本约定、实际状态和产物检查结果。

## 当前状态

截至 2026-09-28，项目已批准按 **V3.0.0** 正式发布。`refactor/v3` 的生产构建默认打开 Vue 3 `panels-v3/`，发行包不包含 Vue 2 面板。此记录随发布候选准备；只有 GitHub tag / release 和商店平台的实际状态可以证明对应发布步骤已完成。商店审核前应将 V3 条目标为草稿，不得宣称已上架。

V2 与 V3 的配置、规则和备份格式不兼容，且没有自动迁移工具。**3.0.0** 是首个正式语义版本，以主版本号明确标记不兼容变更。用户需分别导出并保留 V2 与 V3 备份，不能把旧格式改字段名后导入。详见 [V3 配置备份与恢复](V3-BACKUP-RESTORE.zh.md)。

## 版本与构建产物

根 `package.json` 和 `packages/shell-chrome/manifest.json` 的扩展版本必须一致，首发版本为 `3.0.0`。根目录 `release.js` 只同步这两个版本字段；它不创建 Git 标签、不生成发行说明、不构建、不打包或发布商店版本。其他 workspace package 保留独立版本。

其他 workspace package 使用各自的 `package.json` 版本（目前多为 `0.1.0` 或 `1.0.0`），不应为了扩展版本机械地批量改号；若它们未来独立发布，再制定各自版本策略。

发布前必须检查产物内容。`scripts/pkg.cjs` 会将 V3 面板复制到 `build/panels-v3/`；生产布局 smoke 与 ZIP 归档检查应确认 V3 panel 已进入产物，且没有 `panels/` Vue 2 目录。GitHub Release 与商店条目的发布状态分别记录；商店更新需要平台审核通过后才能称为已上架。

## 变更日志格式

根目录 `CHANGELOG.md` 与 `CHANGELOG.zh.md` 按版本倒序记录用户可感知变更，使用 `Added`、`Changed`、`Fixed`、`Removed`、`Known limitations` 分类。V3 首发条目明确 V2 / V3 配置不兼容、无自动迁移、默认入口切换、已知功能缺口与备份建议。

### 发行说明模板

```markdown
# Ajax Proxy 3.0.0

发布日期：YYYY-MM-DD

## 主要变化

- …

## 兼容性与升级

- 支持浏览器：Chrome Stable、Microsoft Edge Stable；最低版本见浏览器兼容策略。
- V2 / V3 配置和备份不兼容；无自动迁移。升级前导出并另存 V2 备份。
- 首次打开 V3 后，先导出一份 V3 备份并确认规则行为。

## 已知限制

- …

## 问题反馈

- https://github.com/Nyakooo/ajax-proxy/issues
```

## 发布前清单

- [x] 正式发布决议已批准；发布候选只进入 `refactor/v3`，并在合并前创建 `master` 备份分支。
- [x] README、迁移说明、备份说明、浏览器兼容说明与首发功能及已知限制一致。
- [x] 根 `package.json` 与 Chrome manifest 版本统一为 3.0.0，发行说明解释 V2 / V3 不兼容范围。
- [x] PR #57 的 CI build、Chrome / Edge Stable、Chrome 141 / Edge 140 矩阵均通过；报告记录于 [V3 测试约定](V3-TESTING.zh.md)。
- [x] 已按 [浏览器兼容策略](V3-BROWSER-COMPATIBILITY.zh.md) 完成 Chrome 与 Edge Stable 功能验收；CI 另验证扩展加载、service worker、content script 和 Fetch / XHR。
- [x] 已制作 440×280 必需宣传图、1400×560 可选宣传图及 3 张 1280×800 的 V3 实际界面截图；采用当前扩展图标，不使用旧 V2 截图。
- [ ] 从正式发布提交重新构建并检查 manifest、默认入口、`panels-v3/`、ZIP 内容和文件名版本。
- [ ] 保存 Git tag / Release、发行说明、ZIP 校验和及源提交对应关系。
- [ ] Chrome Web Store 与 Edge Add-ons 更新包和素材已上传为草稿；待门户确认截图、图标、文案及两边包版本后再记录；提交审核与公开上架状态以平台页面为准。

## 回归与回滚

发现阻断性回归时，先停止继续分发候选包，并记录受影响版本、浏览器、复现步骤和对应提交。回滚代码时，从已知良好的发行标签 / 提交重新构建上一版包；不要通过强推改写已共享历史。若问题可由小修复可靠解决，则基于已发布版本建立修复分支并按新的补丁版本流程评审。仓库当前 `release.js` 仅同步版本字段，不具备回滚、标签或发布操作。

回滚期间保留所有用户导出的备份和原始发布归档。V3 配置不能导入旧 V2 版本；回到 V2 时不要删除、覆盖或尝试转换 V3 配置，先将 V3 JSON 备份另存到扩展数据之外。V2 与 V3 备份应分开标注版本并长期保留，直到用户确认不再需要；调查数据损坏时不要让用户先清除扩展存储。

## 反馈入口

缺陷、兼容性问题和功能建议统一通过 [GitHub Issues](https://github.com/Nyakooo/ajax-proxy/issues) 收集。反馈应附上扩展版本、浏览器及版本、使用的面板（`panels/` 或 `panels-v3/`）、最小复现步骤和脱敏后的错误信息。请勿上传包含真实请求内容、Cookie、令牌或自定义函数秘密的备份；报告数据损坏时先保留原始备份副本。

## 依据

- 根版本和命令：[`package.json`](../package.json)
- 版本字段同步逻辑：[`release.js`](../release.js)
- Manifest 版本、权限和默认扩展入口：[`packages/shell-chrome/manifest.json`](../packages/shell-chrome/manifest.json)
- staging 面板打包目标：[`scripts/pkg.cjs`](../scripts/pkg.cjs)
- zip 文件名和归档清单：[`extension-zips.js`](../extension-zips.js)
- V2 / V3 格式、恢复和备份要求：[V3 配置备份与恢复](V3-BACKUP-RESTORE.zh.md)
- V3 当前功能边界及显式面板入口：[V3 面板迁移说明](V3-PANEL-MIGRATION.zh.md)
- 浏览器范围和版本：[V3 浏览器兼容策略](V3-BROWSER-COMPATIBILITY.zh.md)
- 测试入口与 CI / 手工验收边界：[V3 测试约定](V3-TESTING.zh.md)
