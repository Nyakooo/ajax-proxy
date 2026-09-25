# 依赖安全审查与修复流程

## 审查结果（2026-09-25）

- `re2js@2.8.6` 从 npm 官方 registry 获取的元数据声明 MIT 许可，仓库地址为 `le0pard/re2js`。npm registry 返回的 SHA-512 integrity 与 `pnpm-lock.yaml` 一致；`pnpm why re2js` 确认仅由 `@proxy/protocol` 与 `@proxy/lib` 直接依赖。当前最新版本也是 2.8.6。
- 使用 npm 官方 registry 执行 `pnpm audit --json` 得到 50 个公告：20 高、26 中、4 低。除下述生产依赖外，其余 49 个公告均属于开发依赖，集中在旧版 Vue CLI / Webpack / Vite / lint 工具链。该结果作为旧工具链升级的跟踪基线，不以批量覆盖版本的方式处理。
- `pnpm audit --prod --json` 得到一个低危 Vue 2 公告 [GHSA-5j4c-8p2g-v4jx](https://github.com/advisories/GHSA-5j4c-8p2g-v4jx)：当前安装 `vue@2.6.11`，公告修复版本为 Vue 3。源码检查未发现 `Vue.compile` 或动态模板调用；当前组件模板通过单文件组件构建。将 Vue 3 迁移完成前保留该低危项并在生产依赖审计中持续报告；如引入动态模板或公告影响范围发生变化，应提前重新评估。
- `pnpm audit signatures --registry=https://registry.npmjs.org --json` 验证 1,276 个已安装包，invalid / missing 均为 0。
- 默认 registry `https://registry.npmmirror.com` 不提供 pnpm 12 的 bulk audit endpoint，安全审计命令显式使用 `https://registry.npmjs.org`。pnpm 12 通过该 endpoint 查询 GHSA 公告；参考 [pnpm audit 文档](https://pnpm.io/cli/audit)。

## 日常流程

1. 在依赖变更的 PR 中运行 `pnpm security:audit`。它会检查生产依赖中 moderate 及以上的公告，并验证 lockfile 解析到的包签名；低危公告仍输出供审阅，但不单独阻断 CI。
2. 每月以及准备发布前运行完整 `pnpm audit --registry=https://registry.npmjs.org`，同时运行 `pnpm audit --prod --registry=https://registry.npmjs.org`。按生产 / 开发、严重级别、是否有修复版本和实际调用路径分类，不能只看依赖名称或公告数量。
3. 有可用安全版本时，优先最小安全升级并更新 lockfile；只有在没有兼容升级且确认 API / 构建回归通过时，才用 pnpm override 限定易受影响的传递依赖。完成后运行冻结安装、typecheck、单测、完整构建和浏览器 smoke，再复跑审计。
4. 无修复版本、升级需要跨主版本，或公告无法在当前使用路径触发时，记录 GHSA、受影响路径、可达性判断、缓解措施、责任阶段和复查日期；例外必须持续出现在审计记录中，不用全局忽略或隐藏审计结果。
5. 处理目标：Critical 立即阻断发布并优先修复；High 在 7 天内修复或建立明确缓解；Moderate 在 30 天内处理；Low 在 90 天内处理或随已排期的主版本升级关闭。超期条目在发布前重新确认。

`pnpm audit --fix` 可能批量增加 overrides 或变更锁定版本；执行前先审阅它将修改的依赖范围，不把自动修复结果直接合并。
