# 依赖安全审查与修复流程

## 审查结果（截至 2026-09-26）

- `re2js@2.8.6` 从 npm 官方 registry 获取的元数据声明 MIT 许可，仓库地址为 `le0pard/re2js`。npm registry 返回的 SHA-512 integrity 与 `pnpm-lock.yaml` 一致；`pnpm why re2js` 确认仅由 `@proxy/protocol` 与 `@proxy/lib` 直接依赖。当前最新版本也是 2.8.6。
- 使用 npm 官方 registry 执行 `pnpm audit --json`：当前 `refactor/v3` 锁文件有 11 个公告（0 高、10 中、1 低、0 严重）；其中 10 个属于开发依赖，生产依赖只有下述一个低危 Vue 公告。相较 2026-09-25 的 50 个公告基线，工具链修复后当前总数减少 39；该结果用于跟踪当前分支，不以批量覆盖版本的方式处理。
- `pnpm audit --prod --json` 得到一个低危 Vue 2 公告 [GHSA-5j4c-8p2g-v4jx](https://github.com/advisories/GHSA-5j4c-8p2g-v4jx)：当前安装 `vue@2.6.11`，公告修复版本为 Vue 3。源码检查未发现 `Vue.compile` 或动态模板调用；当前组件模板通过单文件组件构建。将 Vue 3 迁移完成前保留该低危项并在生产依赖审计中持续报告；如引入动态模板或公告影响范围发生变化，应提前重新评估。
- 为修复 `@proxy/lib` 构建工具链中的 Vite 公告，将其 Vite 从 2.9.13 升级至 6.4.3（GHSA [fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) 的修复版本）。Vite 6 的 UMD 输出要求显式声明 `output.name`，并将 sourcemap 配置移至 build 层；本地构建与 CI 全量构建、测试及 Chrome / Edge 浏览器矩阵均通过（CI run [36245512243](https://github.com/Nyakooo/ajax-proxy/actions/runs/36245512243)）。当前分支审计已无 Vite 公告。
- 为旧 Vue CLI / ESLint 开发工具链增加按父包版本限定的 pnpm overrides：`acorn@7.1.0` → `7.1.1`、`ansi-regex` 3 / 4 / 5 分支 → `3.0.1` / `4.1.1` / `5.0.1`、`css-what@5.0.0` → `5.0.1`、`nth-check@2.0.0` → `2.0.1`、`normalize-url@4.5.0` → `4.5.1`，以及受影响的 semver 2 / 5 / 6 分支 → 父包声明范围内的 semver `5.7.2` / `6.3.1`。这些变更只影响开发依赖，不改变生产依赖；全量构建、345 项覆盖测试、typecheck、声明、边界、迁移 lint 和生产审计通过，CI run [36246275038](https://github.com/Nyakooo/ajax-proxy/actions/runs/36246275038) 的 Chrome / Edge Stable 与最低版本扩展 smoke 全部通过。
- 将旧 ESLint 6 缓存链的 `flat-cache@2.0.1` 子依赖精确替换为 `flatted@3.4.4`，只影响开发期缓存。实际用旧 ESLint 6 执行缓存写入和二次读取；全量 build、345 项覆盖测试、typecheck、声明、边界、迁移 lint、安全审计和签名校验通过，CI run [36246723057](https://github.com/Nyakooo/ajax-proxy/actions/runs/36246723057) 的 Chrome / Edge Stable 与最低版本扩展 smoke 全部通过。
- 为 `external-editor@3.1.0` 精确覆盖 `tmp@0.0.33` 至 `tmp@0.2.7`，修复路径遍历公告 [GHSA-ph9p-34f9-6g65](https://github.com/advisories/GHSA-ph9p-34f9-6g65) 并包含对 `0.2.6` 的绕过修复 [GHSA-7c78-jf6q-g5cm](https://github.com/advisories/GHSA-7c78-jf6q-g5cm)。实际从 external-editor 的解析路径调用 `tmp.tmpNameSync` 验证版本与 API；全量 build、345 项覆盖测试、typecheck、声明、边界、迁移 lint、格式、安全审计和签名校验通过。CI run [36247139586](https://github.com/Nyakooo/ajax-proxy/actions/runs/36247139586) 的 Chrome / Edge Stable、Chrome 141 / Edge 140 最低版本扩展 smoke 全部通过。
- 将三个开发期工具链父包 `copy-webpack-plugin@9.0.1`、`copy-webpack-plugin@11.0.0` 和 `css-minimizer-webpack-plugin@3.0.2` 所用的 `serialize-javascript@6.0.0` 精确覆盖至 `7.1.2`，修复 RCE、CPU DoS 和旧 XSS 公告 [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq)、[GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v)、[GHSA-76p7-773f-r4q5](https://github.com/advisories/GHSA-76p7-773f-r4q5)。这是跨主版本 override；已从三个父包各自解析模块并验证 CommonJS 函数导出与 RegExp / Date / options 序列化，再运行全量构建、345 项测试、typecheck、声明、边界、迁移 lint、格式和生产审计 / 签名。CI run [36247634483](https://github.com/Nyakooo/ajax-proxy/actions/runs/36247634483) 的 Chrome / Edge Stable 与 Chrome 141 / Edge 140 最低版本扩展 smoke 全部通过。
- Vue 2 样式链中，`@vue/component-compiler-utils@3.3.0` 声明 PostCSS `^7.0.36`，但 PostCSS 7 无覆盖现有 high / moderate 公告的修复版本，上游编译工具也没有更新版本。仅对该父包做精确 override 到已在工作区使用的 `postcss@8.5.28`，清除 PostCSS 7 的文件读取 / source-map 路径及 CSS 输出公告 [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q)、[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)、[GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)。直接验证 Vue 编译器的 scoped / trim、SCSS 预处理、自定义插件和 source map；code-editor、json-editor、vue-panels、扩展完整构建、345 项测试、typecheck、声明、边界、迁移 lint、格式、生产审计 / 签名均通过。CI run [36248082897](https://github.com/Nyakooo/ajax-proxy/actions/runs/36248082897) 的 Stable 与 Chrome 141 / Edge 140 最低版本 smoke 全部通过。旧的 `postcss.plugin()` 调用会输出弃用提示，但目前兼容工作正常；Vue 2 编译链迁移时应改用 PostCSS 8 插件 API。
- GitHub push 提示的 133 个 Dependabot 告警来自默认分支 `master` 的旧依赖图，不代表 `refactor/v3` 的告警总数；两条分支分别按自身锁文件审查。当前 V3 分支以 npm 官方 registry 的 `pnpm audit` / `pnpm audit --prod` 结果为准，`master` 告警另行处理。
- `pnpm audit signatures --registry=https://registry.npmjs.org --json` 验证 1,357 个已安装包，invalid / missing 均为 0。
- 默认 registry `https://registry.npmmirror.com` 不提供 pnpm 12 的 bulk audit endpoint，安全审计命令显式使用 `https://registry.npmjs.org`。pnpm 12 通过该 endpoint 查询 GHSA 公告；参考 [pnpm audit 文档](https://pnpm.io/cli/audit)。

## 日常流程

1. 在依赖变更的 PR 中运行 `pnpm security:audit`。它会检查生产依赖中 moderate 及以上的公告，并验证 lockfile 解析到的包签名；低危公告仍输出供审阅，但不单独阻断 CI。
2. 每月以及准备发布前运行完整 `pnpm audit --registry=https://registry.npmjs.org`，同时运行 `pnpm audit --prod --registry=https://registry.npmjs.org`。按生产 / 开发、严重级别、是否有修复版本和实际调用路径分类，不能只看依赖名称或公告数量。
3. 有可用安全版本时，优先最小安全升级并更新 lockfile；只有在没有兼容升级且确认 API / 构建回归通过时，才用 pnpm override 限定易受影响的传递依赖。完成后运行冻结安装、typecheck、单测、完整构建和浏览器 smoke，再复跑审计。
4. 无修复版本、升级需要跨主版本，或公告无法在当前使用路径触发时，记录 GHSA、受影响路径、可达性判断、缓解措施、责任阶段和复查日期；例外必须持续出现在审计记录中，不用全局忽略或隐藏审计结果。
5. 处理目标：Critical 立即阻断发布并优先修复；High 在 7 天内修复或建立明确缓解；Moderate 在 30 天内处理；Low 在 90 天内处理或随已排期的主版本升级关闭。超期条目在发布前重新确认。

`pnpm audit --fix` 可能批量增加 overrides 或变更锁定版本；执行前先审阅它将修改的依赖范围，不把自动修复结果直接合并。
