# omp-antigravity-acp

独立 omp provider：通过官方 `agy acp` 使用 Antigravity，工具、权限与会话历史以 omp 为准。根目录的 `package.json#omp.extensions` 加载 `lib/index.js`；此子目录也可直接作为本地扩展包加载。

## 调用链

```text
omp agent loop
  → registerProvider("antigravity", { api: "omp-antigravity-acp", streamSimple })
  → 本地请求/事件协议
  → agy acp --process-per-session
  → 每会话独立的本地 HTTP MCP 端点
  → omp 工具调用事件，交还宿主审批执行
  → omp toolResult 回填 MCP，继续原 ACP turn
```

- `provider.ts`：把文本、思考、工具与结束原因映射为 omp 规范事件；工具步结束原因为 `toolUse`。
- `messages.ts`：转换 omp 历史。消息内容哈希作为内部 id，能检测保留原时间戳的裁剪、压缩和改写。
- `runtime.ts`：ACP 生命周期、会话复用、模型/思考选择、权限验证、结果回填。
- `mcp-bridge.ts`：仅监听 loopback，每会话随机路径与 bearer secret，防止跨会话调用。
- `preflight.ts`：隔离的官方 CLI 配置和无内置执行工具的 `omp-bridge` agent。
- `usage-db.ts`：在支持 `node:sqlite` 的环境读取本地会话 `steps` 表，缺失时回退到官方轮末用量。

每次 omp 扩展 factory 绑定独立 runtime，避免子会话退出时关闭父会话。`options.sessionId` 关联宿主和 ACP 会话；缺少宿主 session id 的请求为一次性会话。历史改变时按 `<omp_history>` 转录重建，不继续使用过期上下文。图片按 ACP/MCP 图片块传递。

工具声明在会话创建时冻结，减少缓存失效；新增/修改工具通过增量 schema 和 `omp_call_tool` 调用，宿主白名单实时生效。长工具默认在 85 秒时返回仍在运行提示，官方 agent 通过 `omp_await_result` 等待原结果；omp 仍只执行一次工具。

## 配置

安装、登录和加载方式见[根 README](../README.md)。默认配置文件是 `getAgentDir()/antigravity-acp.json`；环境变量 `OMP_ANTIGRAVITY_CONFIG` 可覆盖文件路径。文件可省略未修改字段；非法类型、范围或未知字段会报告加载错误。

| 字段 | 默认值 | 说明 |
|---|---|---|
| `provider` | `antigravity` | omp provider id |
| `displayName` | `Antigravity` | 模型显示名前缀 |
| `command` | 空 | 官方 agy 路径；为空自动查找本机安装和 PATH |
| `home` | 当前 agent 目录下 `cache/antigravity-acp` | 隔离 CLI 配置、会话库、日志、模型目录缓存；不同 omp profile 默认隔离 |
| `contextWindow` | `0` | 自动按未解锁 256,000、确认解锁后 1,048,576 声明；非零显式覆盖 |
| `defaultEffort` | `high` | 未指定思考档位时使用；`low` / `medium` / `high` |
| `autoPatch` | `false` | 是否允许调用本地脚本修改官方二进制；接入无需开启 |
| `patchScript` | 空 | 空时查找 `~/.gemini/antigravity/tools/agy-patch.py` |
| `maxLiveSessions` | `16` | runtime 同时保留会话上限，1..64 |
| `idleSessionTtlMs` | `1800000` | 空闲回收时间，至少 10000 ms |
| `parkSettleMs` | `250` | 并行工具归并窗口，0..5000 ms |
| `keepAliveMs` | `15000` | MCP SSE 保活，至少 1000 ms |
| `relayAfterMs` | `85000` | 长工具中继阈值，5000..165000 ms |
| `longDecodeContinuations` | `3` | 达输出上限后自动续写次数，0..16 |
| `warmup` | `true` | session_start 时尝试启动并读取模型目录 |
| `quotaTtlMs` | `120000` | 官方额度查询缓存时间，至少 5000 ms |

## 限制和凭据

1. 官方 `agy >= 1.5.0` 必须已登录：`agy acp --login`。认证错误会作为 omp 错误事件返回，不改用其他模型或网关。
2. 沿用上游白名单机制，ACP 握手使用 `jetbrains.omp`。第三方模型取决于上游允许的客户端与套餐；并非官方 JetBrains 集成。
3. Claude Sonnet 5.5 与 GPT-OSS 仍沿用原项目的目录隐藏规则。模型可用性最终由 ACP session 返回值验证。
4. 不支持 ACP 没有的采样参数或强制关闭思考。omp 的 `minimal`/关闭映射 `low`，`xhigh`/`max` 映射 `high`。`maxTokens: 64000` 是注册元数据，不是服务端输出约束。
5. 官方 CLI 运行在空的隔离 workspace，避免加载用户项目规则、技能与内置执行工具。实际工具 cwd 仍由 omp 管理。
6. 不继承 omp 进程中的其他模型 API 凭据；仅向子进程传递运行环境、代理和证书路径等必要变量。
7. 登录凭据不写入 omp 的 provider key 配置。无凭据库环境会同步官方 `~/.gemini/antigravity-cli` 或 `~/.gemini/antigravity` 下的 token 文件到隔离目录（`0600`）；该目录和官方会话日志应按敏感数据保管。
8. 模型按订阅调用，注册的 token 单价为 0，不代表没有订阅费用或额度消耗。额度显示通过官方 `agy -p /usage` 获取。

## 构建和回归

在仓库根目录执行：

```sh
npm ci --ignore-scripts --omit=optional
npm run build
npm run typecheck
npm test
```

SDK 仅为开发依赖；运行时使用 omp 提供的 SDK，不安装 DSH 或额外推理代理。预编译 `lib/` 随仓库发布。
