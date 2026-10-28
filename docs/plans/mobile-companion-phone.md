# 方案：把 tabby 的「连接真机」能力移植到 Octop

> 状态：**已批准并实现**（2026-10-27，VLM 凭证采用方案 A：经 Octop 代理）。
> 分支：`feat/mobile-real-phone`（从 `coder-zkl1988/Octop` `main` @ `311087df` 切出）。
> tabby 侧的完整调研（协议报文、工具 schema 原文、文件行号）在会话共享笔记 `tabby-phone-control-research.md`，本文只摘结论。

## 1. tabby 是怎么做的

tabby 的手机能力由三部分组成：PC 插件 `tabby-control`、安卓 App `TabbyApp`（包名 `com.tabby.agent`），以及 tabby 桌面端的设备页。

- **连接方向**：手机主动连 PC，不走 ADB/USB。
  - PC 起一个 WebSocket 服务 `ws://<局域网IP>:18790/phone`。
  - 手机扫描二维码（内容就是这个 URL）后连接。App 会**原样保存 URL** 并一直用它重连。
- **握手**：
  - 手机先发 `{"type":"auth","deviceId":"<MODEL>-<ANDROID_ID>","capabilities":{型号、系统版本、屏幕尺寸、电量、支持的动作…}}`。
  - PC 回 `{"type":"connected","serverSessionId":…,"vlm":{apiUrl,apiKey,model,…}}`。
  - tabby 自己**没有任何认证**：只要有 deviceId 就放行。
- **AI 循环跑在手机上**：
  - PC 侧 agent 拿到的是「任务级」工具，例如 `device_execute_task(deviceId, task="打开微信给张三发消息…")`。
  - 手机 App 自己跑「截图 → 视觉模型 → 动作」循环，最后回一个结构化结果。
  - 视觉模型用 PC 在 `connected` 里下发的 OpenAI 兼容端点。**没有这份凭证，手机拒绝执行任务。**
  - 手机端动作用无障碍服务实现：点击、输入、滑动、滚动、长按、启动 App（AWAKE）、返回、主页等，坐标是 0–1000 归一化值。
- **任务协议**（`channel:"task"`）：
  - PC 用 `agent.execute` 下发任务。
  - 手机每 2 步或每 40 秒发一次 `agent.progress`，附带 728px 宽的 JPEG 截图。
  - 终态是 `id:"resp_<taskId>"`，状态取值 `completed / aborted / stuck / needs_takeover / blocked / error`。
  - **PC 必须回 `agent.result_ack`**，否则手机每次重连都重发这条结果。
  - 取消用 `agent.cancel`。
  - 手机需要人工决策时，在 progress 里带 `interaction_request`，最多等 60 秒；PC 用新的 taskId 加 `sessionId` 回一条 `guidance`。
- **镜像**（`channel:"mirror"`）：
  - 手机连上后自动推 JPEG 帧，空闲时约 4 秒一帧。
  - PC 下发 `fps>5` 时，手机会申请录屏权限并改推 H.264 二进制帧。
  - PC 也可以发 `click / swipe / input_text / press_key(back|home|recents)` 做人工操控，坐标是物理像素。
- **手机端没有并发保护**，PC 必须保证每台设备同一时间只跑一个任务。
- **桌面 UI**：配对二维码、设备卡片（缩略图、型号、当前 App、电量、紧急停止）、可交互的实时画面（H.264/WebCodecs）、任务历史。

## 2. Octop 已经有什么

Octop 已经有一套**基于 ADB 的「远程手机」**：

| 部分 | 位置 | 现状 |
|---|---|---|
| 能力探测 | `infra/control/mobile/probe.py` | macOS/Windows 判为 `physical`；Linux 有 binder 判为 `redroid`、有 KVM 判为 `emulator`，否则不支持 |
| ADB 封装 | `infra/control/mobile/adb.py` | 截图、点击、滑动、按键、输入、旋转、设备信息 |
| Agent 工具 | `infra/control/mobile/tools.py`，在 `infra/agents/manager.py:3976` 挂载 | 6 个：`mobile_screenshot / tap / swipe / launch_app / ui_dump / handoff_to_user` |
| Agent 绑定 | `infra/control/mobile/agent_control.py` | 全局单例：**同一时刻只绑定一台设备**，而且**只在 Dashboard 推流页面打开期间有效** |
| HTTP/WS | `api/routers/mobile/` | 状态、Redroid 安装、H.264/JPEG 推流加人工操控、ADB shell |
| Dashboard | `pages/Control/RemoteAndroid/` | 设备选择、实时画面、ADB shell |
| 测试 | `tests/unit/mobile/` | 64 个，全部通过 |

## 3. 差距

| tabby 有、Octop 没有 | 影响 |
|---|---|
| 手机通过 App 主动连接（不需要 USB、ADB、开发者模式） | Octop 现在必须插线或开无线调试，手机必须和 Octop 在同一台机器上，无法连远端服务器 |
| 任务级执行（手机端自主完成多步任务） | Octop 现在要上层 LLM 逐步「截图 → 看图 → 点坐标」，每一步都是一次大模型调用，慢而且容易点偏 |
| 配对、多设备、按用户归属 | Octop 现在是全局单设备，而且没有归属 |
| 给手机下发 VLM 凭证 | 新需求 |
| 配对页、设备卡片、任务状态 | 新 UI |

Octop 的 ADB 方案保持不动。新能力作为**第二种连接方式**并存，下文称「配套 App 模式」（companion）。

## 4. 设计

### 4.1 原则

- **不改 TabbyApp**：Octop 在 Python 里重新实现 PC 侧协议，兼容已经装好的 App（本机 3 台手机都装了 `com.tabby.agent`）。
- **只实现单设备闭环需要的部分**：握手、任务、取消、交互、结果确认、最新截图。
  - 技能包同步（`skill.sync`）不做，手机用 APK 内置技能。
  - 多设备批量派发、H.264 实时画面、推图到相册、旧版子任务编排，都放到后续。
- **按 AGENTS.md 分层**：协议和调度放在 `infra/control/mobile/companion/`；路由只做 WebSocket 收发和 HTTP 校验；用户可见文案走 `tr()`。

### 4.2 后端结构（新增 `infra/control/mobile/companion/`）

| 文件 | 职责 |
|---|---|
| `protocol.py` | 报文构造与宽松解析：auth、connected、agent.execute/progress/cancel/result_ack、终态结果、mirror realtime 帧 |
| `pairing.py` | 配对记录：生成、领取、过期、解绑，持久化在 `settings` 表（KV，键 `mobile.companion.devices`，**不加迁移**）。只存密钥的 SHA-256 |
| `hub.py` | `CompanionHub`：设备表（在线/离线、能力、当前 App、最新截图）、连接替换、任务调度（每台设备单任务、空闲超时与首步超时、取消、交互、结果 ack、重放去重、最近结果缓存）。与传输层解耦，测试时注入假连接 |
| `vlm.py` | 读取管理员选定的视觉模型（provider + model），组装下发给手机的 `vlm` 字段；实现 OpenAI 兼容代理的转发（httpx 流式） |
| `tools.py` | Agent 工具（见 4.5） |

接线：
- `infra/server.py` 在启动时创建 `CompanionHub`，停止时关闭全部连接。
- `infra/agents/manager.py` 在挂载现有 mobile 工具的位置一起挂载新工具。

### 4.3 连接与配对（安全加固，不改 App）

1. 用户在 Dashboard「远程手机 → 配套 App」点「添加手机」，后端生成一次性**设备密钥**（32 字节随机数）。二维码内容为：
   `ws(s)://<Octop 地址>/api/mobile/companion/ws?token=<密钥>`
   - 实现时密钥放在 query 的 `token` 里，而不是路径段里，这样能复用 `infra/server.py` 现有的 access log 打码规则（`_SECRET_QUERY_RE`）。
   - 端点挂在 Octop 主端口上，所以 HTTPS 部署下自然是 `wss://`。远端服务器上的 Octop 也能连。
   - 地址取浏览器当前访问的 Host。如果是 `localhost`/`127.0.0.1`：Octop 监听 `0.0.0.0` 时替换成局域网 IP；否则页面提示「Octop 只监听本机，手机无法直连」，并给出两种办法：用 `OCTOP_BIND_HOST=0.0.0.0` 启动，或者 USB 下用 `adb reverse`。
2. 手机扫码连接，密钥校验通过后：
   - 密钥**绑定到这个 deviceId 和生成它的用户**；
   - 别的 deviceId 再用同一个密钥会被拒绝；
   - 10 分钟内没被领取的密钥作废。
3. 解绑时删除记录并断开连接。之后手机用旧 URL 重连会被拒绝（`AUTH_FAILED`）。
4. 这两个路径加入 JWT 豁免（`api/deps.py`），因为密钥本身就是凭证：手机 WebSocket，以及 4.4 的 VLM 代理。access log 里的密钥由现有规则打码。
5. **归属**：设备属于配对它的用户。该用户的 agent 能用；管理员能看到所有设备。

### 4.4 给手机的视觉模型（需要你选）

手机必须拿到一个支持图像输入的 OpenAI 兼容端点。管理员在配套 App 面板里选一个「手机端模型」（provider + model）：只列 `openai` 协议、且模型标注支持图像的条目，沿用 OCR 选模型的做法。下发方式有两种：

- **A（推荐）：Octop 代理**
  - 下发 `apiUrl = <Octop 地址>/api/mobile/companion/vlm/v1/`、`apiKey = 设备密钥`。
  - 手机请求 Octop；Octop 校验密钥后，用服务端保存的 provider key 转发到上游，支持流式。
  - 好处：provider 主 key **不出服务器**；解绑立即失效；以后可以记用量。
  - 代价：多一个约 100 行的转发端点，每一步多一跳延迟（局域网内可忽略）。
- **B：直接下发 provider 的 base_url 和 api_key**
  - 和 tabby 一样，实现最简单。
  - 但主 key 会以明文经过 `ws://`，存在手机上，解绑后也收不回。

### 4.5 Agent 工具（新增 4 个，类别 `mobile`）

| 工具 | 对应 tabby | 行为 |
|---|---|---|
| `phone_list_devices` | `device_list` / `device_get_status` | 列出当前用户的配套设备：在线状态、型号、Android 版本、电量、当前 App、是否在跑任务 |
| `phone_run_task` | `device_execute_task` | 参数：`device_id`（只有一台在线时可省）、`task`（整段自然语言任务，**不要拆步**）、可选 `guidance` + `session_id`、`max_steps`、`timeout_s`（空闲超时，默认 300、上限 600）。阻塞到终态，返回状态、手机给出的结果文本、步数、耗时，以及**最终截图在 agent workspace 里的路径**（`outbound/screenshots/phone_*.jpg`，模型需要时用 `read_file` 查看）。手机提出交互请求时提前返回 `needs_interaction`（含问题和截图），agent 带 `session_id` + `guidance` 再调一次续跑。用户在对话里点「停止」时，向手机发取消 |
| `phone_cancel_task` | `device_cancel_task` | 取消正在运行的任务 |
| `phone_get_task_result` | `device_get_task_results` | 超时或断线后找回已经完成的结果（内存里每台设备保留最近 8 条，6 小时） |

- 挂载条件：agent 所属用户有 `mobile` 权限，或者是管理员。和现有 ADB 工具不同，**不依赖**主机的 ADB/binder 探测。
- 没有配对设备时，工具调用返回明确提示，引导用户去配对。
- 在工具设置里可以按 agent 关闭。

### 4.6 HTTP（`api/routers/mobile/companion.py`，权限 `mobile`）

| 方法与路径 | 作用 |
|---|---|
| `WS /api/mobile/companion/ws?token={key}` | 手机连接（密钥认证） |
| `POST /api/mobile/companion/vlm/v1/chat/completions` | VLM 代理（Bearer 设备密钥；仅方案 A） |
| `GET /api/mobile/companion/devices` | 当前用户的设备列表和状态 |
| `POST /api/mobile/companion/pairings` | 生成配对二维码 URL 和过期时间 |
| `DELETE /api/mobile/companion/devices/{device_id}` | 解绑 |
| `POST /api/mobile/companion/devices/{device_id}/cancel` | 紧急停止当前任务 |
| `GET /api/mobile/companion/devices/{device_id}/snapshot` | 最新一帧截图（JPEG） |
| `GET/PUT /api/mobile/companion/settings` | 手机端模型选择（PUT 仅管理员） |

### 4.7 Dashboard（独立的「手机」入口）

- **入口**（实现后按用户要求调整）：侧边栏新增独立入口「手机」（`/phone`），包含「手机 App」（`/phone/app`，配套 App）和「ADB 投屏」（`/phone/adb`，原远程手机页）两个 tab；「远程桌面」只保留服务器桌面。旧地址 `/remote-desktop/phone*`、`/remote-desktop/companion`、`/remote-phone`、`/remote-android` 自动跳转到新位置。
- **添加手机**：弹窗显示二维码（项目已有 `qrcode.react`）、URL（可复制）、有效期倒计时，以及三步说明：装 TabbyApp → 开无障碍 → 扫码。
- **设备卡片**：状态点、型号、Android 版本、电量、当前 App、正在执行的任务及「停止」按钮、最新截图缩略图（页面可见时每 5 秒刷新）、解绑。
- **手机端模型**：管理员可见的下拉框。
- **入口可见性**：Linux 服务器没有 binder/KVM 时，现在的「远程手机」入口是隐藏的。改为：用户有 `mobile` 权限就显示，ADB 视图按原逻辑判断是否可用。
- **不做**：可交互的 H.264 实时画面、任务历史页（列为后续）。

### 4.8 测试

- **单元测试**（`tests/unit/mobile/companion/`）：
  - 报文构造与解析；
  - 配对：生成、领取、过期、跨设备拒绝、解绑；
  - Hub（注入假连接）：握手和 `connected` 内容、任务全流程加 ack、重放去重、单设备单任务、空闲超时和首步超时（时间调小）、取消、交互续跑、重连替换 socket；
  - VLM 字段组装；
  - 4 个工具；
  - 代理转发（httpx MockTransport）。
- **集成测试**（`tests/integration/test_mobile_companion.py`）：
  - 用 FastAPI TestClient 起一个「假手机」WebSocket，走完：配对 → 连接 → 列设备 → agent 工具下发任务 → 假手机回 progress 和结果 → 校验 ack → 解绑后重连被拒；
  - VLM 代理端到端（上游 mock）。
- i18n 键在 en/zh 两边一致、工具目录、前端 `tsc -b`、`npm run lint`，最后 `make all` 全绿。

### 4.9 真机验证（需要你同意）

- 我在另一个端口（例如 `127.0.0.1:18088`）起一个独立的 Octop，用自己的 `OCTOP_HOME`。**不碰**你正在跑的 8088。
- 对其中一台手机执行 `adb reverse tcp:18088 tcp:18088`，这样手机可以通过 USB 访问 `ws://127.0.0.1:18088/...`。
- 用 adb 在 TabbyApp 设置页填入配对 URL。**这会改掉 App 里现存的服务器地址**（目前可能指向 tabby 的 18790）。
- 然后让 Octop agent 依次执行：
  1. 列出设备；
  2. 下发「打开设置，查看 Android 版本，然后回到桌面」；
  3. 看到结果和最终截图。
- 这一步需要一个**支持看图的模型凭证**，见文末问题 2。

## 5. 不做（后续可另开）

- 多设备批量派发（`device_dispatch_tasks` / `job_status`）。
- 可交互的 H.264 实时画面。
- 推图到相册、技能包同步、任务历史持久化。
- 补全现有 ADB 工具的「输入文字 / 返回键」，以及「不开推流页也能用」。

## 6. 风险

- **局域网明文**：`ws://` 下设备密钥可被同网段嗅探。HTTPS 部署下是 `wss://`，没有这个问题；文档里会写明。
- **手机 8080 端口**：TabbyApp 自带一个无认证的 HTTP 端口。这需要改 App 才能修，不在本次范围内。
- **工具调用时间长**：单个任务通常要 1–5 分钟。Octop harness 没有工具超时，但长时间阻塞会占住这一轮对话。
- **手机端前置条件**：
  - 必须开启无障碍；
  - 有安全锁屏时任务直接返回 `blocked`；
  - 零权限截图需要 Android 12 以上。本机 3 台手机是 Android 15/16，满足。
