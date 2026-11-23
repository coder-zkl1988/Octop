# XHS 真机与许可证验收手册

当前代码、插件包和本地隔离验收已经完成；2026-11-17 又补齐了项目深层响应默认值、schedule 结果兼容和历史空事件响应。租户管理员已确认登录并开通小红书插件，控制面只读读回也已确认当前许可证和成员功能；三台实体设备已完成 Octop 配对并同步到目标技能版本。此手册仍只覆盖需要视觉模型、真实设备和小红书账号的最后一段验收。不要把设备握手、技能 ACK 或手机任务成功回执当作平台发布成功。

## 当前已验证

- Octop：`127.0.0.1:8090/api/health` 返回 200。
- 企业控制面：`127.0.0.1:18000/readyz` 返回 ready。
- 本轮先将三台实体设备覆盖安装为 TabbyApp `1.1.0 (versionCode=29)`，再通过 ADB reverse 和 Octop pairing API 重新配对。Octop 读回 3 台在线设备，均为 `policy_mode=enforce`、`skill_bundle_version=66`、`skill_sync_status=current`，并上报完整动作词表；其中两台 `24094RAD4C` 支持并安装 `com.xingin.xhs`，`2312DRAABC` 未安装 XHS，不作为 XHS 目标设备。Android 端同步文件也读回 bundle/version 66 和 `xhs-v1`。
- 控制面 `18000` 的只读数据库读回显示：`xhs-ops` 为 `active`、版本 1，购买能力和当前成员分配均为 `xhs.analytics`、`xhs.comment`、`xhs.content`、`xhs.ops`、`xhs.publish`、`xhs.takeover`，账号/设备额度均为 10；最近一条审计动作是 `member.assign`。没有读取浏览器 Cookie 或密码。
- 企业登录、策略、设备契约、插件授权门禁和审计 outbox 已有隔离回归。
- 迁移命令已通过隔离 HTTP 验收：源哈希 dry-run、确认导入、活动运行转 `unknown`、设备解绑待重绑、历史评论重新进入待审核以及重复哈希拒绝。
- 插件包：`artifacts/plugins/xhs-ops-0.9.0-preview.zip`，19 个文件，SHA-256 为 `f884404a5632106acd554e6038fca2d7df566fc1d977dd3870fc48be2aaaa1fc`。
- 当前源快照 `/Volumes/CloneData/workspace/tabby/.tmp/dev/nexu-home/xhs-ops.json` 的 SHA-256 为 `1a339d8f04fad1970077ad8b214bde317ce4d11ed63b99c7b1ade9b8b69ec8be`；dry-run 识别 7 个项目、10 个账号、19 个运行、4 个评论，3 个冲突均为 `device_rebind_required`，且不会派发手机任务或修改平台。
- 最近一次隔离企业会话在租户许可证为 `inactive` 时实测插件 snapshot、项目 facade 和 playbook 均返回 `403 license_required`；那是旧隔离夹具状态，不代表本次真实控制面的当前状态。当前 live grant 已由控制面数据库只读读回确认，Octop 仍会在每次插件请求和手机任务前重新向控制面校验。

## 已完成的管理员操作

用户已确认以租户管理员身份登录并开通小红书插件；控制面记录与该操作一致。当前不需要把密码、MFA 验证码或 Cookie 交给自动化脚本。

许可证仍以企业控制面为权威；不要用请求体伪造 tenant/member，也不要把许可证写入 Octop 本地 SQLite 绕过控制面。

## 设备准备

每台目标手机都要满足：

- ADB 在线且已完成 CompanionHub 配对。
- 安装 TabbyApp，并上报 `policy_mode=enforce`。
- `skill_bundle_version >= 66`，`skill_sync_status=current`。
- 支持动作词表和 `com.xingin.xhs` 已安装。
- 小红书测试账号由用户在手机上完成登录；验证码、Cookie 和密码不交给自动化脚本。

当前设备已完成 Octop CompanionHub 正式配对和技能同步 ACK，设备策略与目标应用能力门槛已满足。手机控制页仍提示未配置视觉模型；配置模型并由用户在两台 XHS 手机上完成账号登录后，才能开始真实页面动作验收。

设备能力现场读回：3 台实体设备在线；2 台 XHS 目标设备均为 `policy_mode=enforce`、bundle `66/current`、支持 `com.xingin.xhs`，第 3 台仅作为已配对的非 XHS 设备保留。企业登录 API 返回 `authenticated`，主体为租户管理员；没有读取或保存密码、验证码、Cookie。

设备可用性检查：

```bash
adb devices -l
adb -s <serial> shell pm list packages | rg 'com\.xingin\.xhs|com\.tabby\.agent'
```

## 验收顺序

1. 打开 Octop/iCat 的“小红书运营”插件，确认界面读到的许可证和成员功能与控制面一致。
2. 建立项目，确认目标画像，生成并审核人设。
3. 创建新号账号，读取资料草稿，逐字段预检、确认、应用，再执行独立资料回读。
4. 创建内容草稿和批次，预检后逐篇派发；每篇都记录 task id、截图、作品 URL/平台标识和人工核验结果。
5. 从有效浏览回执生成评论候选，人工审核后单独发送；未审核候选不得发送。
6. 对 existing 账号执行授权、身份锁定、只读盘点、基线确认、诊断、逐项采纳和变更单观察/回滚。
7. 断网、重启、取消未确认和权限撤销后，确认状态进入 `unknown`/`deviceHold`，不会自动重发公开动作。
8. 在企业后台审计列表核对 `desktop.plugin_event`，再检查本机 outbox 是否变为 `acked`。

## 证据要求

每个公开动作至少保留：账号/设备、task id、内容或字段版本、派发时间、手机回执、私有截图、平台回读和人工确认。平台无法读取的指标写 `unknown`，不能用模型文本、截图 marker 或“任务完成”代替平台证据。

当前未完成项是手机视觉模型配置、用户在 XHS 手机上完成账号登录、真实发布/评论/资料回读、非 owner PostgreSQL RLS smoke 和解锁 Mac 后的 iCat 原生窗口验收。设备配对、技能同步 ACK、策略模式和目标 App 能力已完成。
