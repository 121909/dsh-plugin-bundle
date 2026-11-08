# omp-antigravity-bundle

通过官方 Antigravity CLI（`agy acp`）把 Antigravity 模型接入 **Oh My Pi（omp）**。模型作为 `antigravity` provider 出现在 omp 中；工具调用、权限审批、子代理和上下文压缩仍由 omp 管理。

本仓库 fork 自 [lili-luo/dsh-plugin-bundle](https://github.com/lili-luo/dsh-plugin-bundle)，已切换为 omp 扩展，不再提供 DSH/Cordis 插件或 DSH Web UI。保留原项目 MIT 许可证。

## 安装

要求：**omp >= 18.15.0**、官方 **agy >= 1.5.0**。开发构建另需 Node.js >= 22.19。

### 1. 安装并登录官方 agy

macOS / Linux：

```sh
curl -fsSL https://antigravity.google/cli/install.sh | bash
~/.local/bin/agy --version
~/.local/bin/agy acp --login
```

在官方登录流程中完成 Google 授权。Windows 安装方式见 [官方指南](https://antigravity.google/docs/getting-started?tab=cli)。本扩展不收集 API key，不需要在 omp 中再次 `/login`。

### 2. 安装 omp 扩展

仓库包含预编译 `lib/`，使用时无需本地构建：

```sh
omp plugin install github:121909/dsh-plugin-bundle
```

重启 omp 后选择模型：

```sh
omp --model antigravity/gemini-4-argon
```

或者在 `/model` 中搜索 `Antigravity`。模型目录以账号的 ACP 返回结果为准，不保证所有套餐提供相同模型。

### 从源码开发或本地安装

```sh
git clone https://github.com/121909/dsh-plugin-bundle.git
cd dsh-plugin-bundle
npm ci --ignore-scripts --omit=optional
npm run build
npm test
omp plugin link .
```

也可不安装，单次加载：

```sh
omp -e /absolute/path/to/dsh-plugin-bundle --model antigravity/gemini-4-argon
```

## 使用

- `/antigravity status`：连接状态、隔离目录、上下文窗口、活动会话。
- `/antigravity models`：连接官方 ACP、刷新模型目录并重新注册模型。
- `/antigravity usage`：通过官方 `/usage` 读取额度，不发送模型推理请求。
- omp 原生思考档位支持 `low` / `medium` / `high`；其他档位向最近支持值映射。ACP 没有关闭思考的通道，关闭请求按 `low` 处理。
- omp 的原生 `/usage` 可读取此 provider 的每周和短时额度窗口。

## 配置

默认读取当前 omp agent 目录的 `antigravity-acp.json`，通常为：

```text
~/.omp/agent/antigravity-acp.json
```

`--profile` 使用对应 profile 的 agent 目录。可通过 `OMP_ANTIGRAVITY_CONFIG=/absolute/path/config.json` 指定另一份配置。修改配置后重启 omp。

```json
{
  "command": "/home/you/.local/bin/agy",
  "defaultEffort": "high",
  "contextWindow": 0,
  "autoPatch": false,
  "maxLiveSessions": 16
}
```

手动应用 `agy-patch.py` 后，如果脚本不在默认位置，还需在配置中设置 `"patchScript": "/absolute/path/to/agy-patch.py"`。保持 `"autoPatch": false`、`"contextWindow": 0` 即可只读检测：扩展在注册模型前完成本地预检，确认解锁后声明 1,048,576 tokens；脚本缺失或结果不确定时仍保守使用 256,000。补丁或配置改变后重启 omp，已运行的进程不会自动重载二进制与窗口状态。

完整配置、桥接机制和限制见 [`omp-antigravity-acp/README.md`](./omp-antigravity-acp/README.md)。

## 安全与限制

- **默认不修改官方二进制。** `autoPatch` 默认关闭。保留的 [`agy-context-unlock`](./agy-context-unlock) 仅是可选独立脚本，不随扩展安装，不是接入前提。
- 复用原项目的 `jetbrains.omp` ACP 客户端标识以请求第三方模型目录；上游白名单变化可能使 Claude 等模型不可用。这不是官方 JetBrains 客户端，不能保证长期兼容或套餐授权。
- 登录由官方 CLI 完成。无系统凭据库的环境中，原项目的凭据同步逻辑会把官方本地 token 文件复制到扩展隔离目录，并设置 `0600` 权限；不要分享该目录。
- ACP 没有采样参数通道，`temperature`、`stop`、`maxTokens` 不会成为服务端限制；注册模型的 `maxTokens` 只是 omp 所需的元数据。
- 不同于 `omp acp`（把 omp 作为 ACP **服务端**），本扩展是驱动 `agy acp` 的 ACP **客户端**。

## 开发验证

```sh
npm run build
npm run typecheck
npm test
```

回归集使用脚本化 ACP 进程，覆盖工具挂起/回填、权限隔离、并行调用、历史压缩/改写、子代理并发、长工具中继、取消、图片和 SQLite 精确用量。真实账号可额外运行：

```sh
omp --model antigravity/gemini-4-argon --no-title --no-session -p 'Reply with OK.'
```

真实模型验证需要先完成官方登录，并受套餐额度限制。
