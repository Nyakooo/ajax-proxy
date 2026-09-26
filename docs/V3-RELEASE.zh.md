# Ajax Proxy V3 发布策略（草案）

本文是 V3 首发前的发布约定草案，不代表发布已经获批或已经完成。

## 当前状态

截至 2026-09-26，V3 仍处于 `refactor/v3` 开发 staging。默认扩展入口仍是 Vue 2 的 `panels/`，V3 面板位于 `panels-v3/`，需要显式打开。此分支及其构建产物不能视为正式发布；不得据此创建正式版本或推送主分支。正式切换须在发布准备完成后单独审查并批准。

V2 与 V3 的配置、规则和备份格式不兼容，当前没有自动迁移工具。V3 首发应使用 **3.0.0** 作为建议的首个正式语义版本，以主版本号明确标记不兼容变更。该版本号只是发布策略建议；在正式发布决策前，保持仓库当前版本不变。用户需分别导出并保留 V2 与 V3 备份，不能把旧格式改字段名后导入。详见 [V3 配置备份与恢复](V3-BACKUP-RESTORE.zh.md)。

## 版本与构建产物

根 `package.json` 和 `packages/shell-chrome/manifest.json` 的扩展版本必须一致。根目录 `release.js` 会交互式校验新版本不低于当前版本，并在确认后同时写入这两个文件；该脚本不创建 Git 标签、不生成发行说明、不构建扩展、不打包或发布商店版本。当前值为 `2.2.10`。正式候选提交应检查版本同步，且只在获批的发布分支 / 提交上运行版本更新。

其他 workspace package 使用各自的 `package.json` 版本（目前多为 `0.1.0` 或 `1.0.0`），不应为了扩展版本机械地批量改号；若它们未来独立发布，再制定各自版本策略。

发布前必须检查产物内容。`scripts/pkg.cjs` 会将 Vue 2 面板复制到 `build/panels/`、Vue 3 面板复制到 `build/panels-v3/`；但现有 `extension-zips.js` 的归档清单只包含 `panels/**`，没有 `panels-v3/**`。因此当前 zip 脚本不能证明 V3 面板已进入发行 zip。发布实现须先明确目标目录并修正、构建和检查 zip 内容；在该项关闭前不得把 zip 称为 V3 发布包。本文不承诺 Chrome Web Store 或 Edge Add-ons 的提交、审核或上架操作。

## 变更日志格式

V3 正式发布前应在仓库根目录维护 `CHANGELOG.md`，按版本倒序记录用户可感知的变更。使用 `Added`、`Changed`、`Fixed`、`Removed`、`Known limitations` 分类；每条写清影响、必要的迁移 / 备份动作，并在适用时关联 GitHub issue。不要把内部重构、测试数量或未交付计划写成用户功能。V3 首发条目必须明确 V2 / V3 配置不兼容、无自动迁移、默认入口切换情况、当前已知功能缺口与备份建议。

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

- https://github.com/g0ngjie/ajax-proxy/issues
```

## 发布前清单

- [ ] 正式发布决议已批准；工作位于专用发布分支，未把 staging 内容直接推入主分支。
- [ ] README、迁移说明、备份说明、浏览器兼容说明与实际首发功能一致；已逐项确认尚未迁移的 V2 功能及已知限制。
- [ ] 根 `package.json` 与 Chrome manifest 版本一致；拟发布版本满足 3.0.0 主版本策略，并在发行说明中解释不兼容范围。
- [ ] 从干净 checkout 安装依赖，完成构建、类型检查、lint、格式检查、单元 / 组件测试、扩展 smoke 与所需的安全 / 包边界检查；记录通过的 CI run 和提交 SHA。
- [ ] 按 [浏览器兼容策略](V3-BROWSER-COMPATIBILITY.zh.md) 验收 Chrome 与 Edge 当前稳定版；CI 中扩展加载、service worker、content script 和真实 Fetch / XHR 集成使用 Playwright 配套 Chromium。品牌浏览器的网页 runtime smoke 与交互式 Stable 扩展验收是不同证据，不能互相代替。
- [ ] 构建后检查 manifest、默认入口、`panels-v3/` 与所需资源；修复并验证 zip 清单遗漏后，解压检查实际归档内容和文件名版本。
- [ ] 对发布候选执行一次真实的 V3 配置导出与恢复检查；保留发布前的 V2 备份，并确认 V3 备份可独立读取。
- [ ] 完成发行说明，确认反馈链接指向 [GitHub Issues](https://github.com/g0ngjie/ajax-proxy/issues)，检查发布文件、版本、校验和及源提交对应关系。
- [ ] 发布后保存候选源码提交、CI 记录、浏览器验收记录、最终归档和发行说明；不把待审核 / 待上架状态描述为已上架。

## 回归与回滚

发现阻断性回归时，先停止继续分发候选包，并记录受影响版本、浏览器、复现步骤和对应提交。回滚代码时，从已知良好的发行标签 / 提交重新构建上一版包；不要通过强推改写已共享历史。若问题可由小修复可靠解决，则基于已发布版本建立修复分支并按新的补丁版本流程评审。仓库当前 `release.js` 仅同步版本字段，不具备回滚、标签或发布操作。

回滚期间保留所有用户导出的备份和原始发布归档。V3 配置不能导入旧 V2 版本；回到 V2 时不要删除、覆盖或尝试转换 V3 配置，先将 V3 JSON 备份另存到扩展数据之外。V2 与 V3 备份应分开标注版本并长期保留，直到用户确认不再需要；调查数据损坏时不要让用户先清除扩展存储。

## 反馈入口

缺陷、兼容性问题和功能建议统一通过 [GitHub Issues](https://github.com/g0ngjie/ajax-proxy/issues) 收集。反馈应附上扩展版本、浏览器及版本、使用的面板（`panels/` 或 `panels-v3/`）、最小复现步骤和脱敏后的错误信息。请勿上传包含真实请求内容、Cookie、令牌或自定义函数秘密的备份；报告数据损坏时先保留原始备份副本。

## 依据

- 根版本和命令：[`package.json`](../package.json)
- 版本字段同步逻辑：[`release.js`](../release.js)
- Manifest 版本、权限和默认扩展入口：[`packages/shell-chrome/manifest.json`](../packages/shell-chrome/manifest.json)
- staging 面板打包目标：[`scripts/pkg.cjs`](../scripts/pkg.cjs)
- zip 文件名和归档清单：[`extension-zips.js`](../extension-zips.js)
- V2 / V3 格式、恢复和备份要求：[V3 配置备份与恢复](V3-BACKUP-RESTORE.zh.md)
- V3 当前迁移阶段及显式面板入口：[V3 面板迁移说明](V3-PANEL-MIGRATION.zh.md)
- 浏览器范围和版本：[V3 浏览器兼容策略](V3-BROWSER-COMPATIBILITY.zh.md)
- 测试入口与 CI / 手工验收边界：[V3 测试约定](V3-TESTING.zh.md)
