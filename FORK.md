# Fork 说明

这份文档记录此个人 fork 相对
[TechCat-Team/ChmlFrpLauncher](https://github.com/TechCat-Team/ChmlFrpLauncher)
的改动与运行边界。它不是官方功能承诺，也不是面向上游 PR 的设计文档。

## 上游基线

- 上游提交：`f2633b0`（`v0.7.5`，2026-05-21）
- 当前 fork 首个稳定提交：`5db06b3`

## frpc 核心程序位置

启动器只会使用自己的应用数据目录中的 `frpc`，不会扫描系统 PATH
或复用其他目录中的 `frpc`。

- macOS：`~/Library/Application Support/net.chmlfrp.launcher/frpc`
- 若该文件不存在，启动器会尝试从应用内置资源复制；“下载 frpc”也会写入同一路径。
- 使用相同 `net.chmlfrp.launcher` 标识的旧版和新版会共用这个目录。

## 当前本地改动

### 第三方 OAuth 登录

- OAuth 公开客户端配置位于 `src/services/oauthConfig.ts`。
- 使用设备码授权；客户端没有、也不应包含 client secret。
- 请求权限域：`profile email offline_access chmlfrp_api`。
- 不在代码、日志或文档中记录 access token、refresh token 或 client secret。
- 本地会话只接受 OAuth access token；旧版仅保存 `usertoken` 的缓存会被清除，需重新授权一次。
- 此客户端登记在个人 fork 名下，不能随上游 PR 一同提交；上游应维护自己的 OAuth 客户端身份。

### SSH 远程运行器

每个隧道都有一个持久化的运行主机选择：`本机` 或一个已配置的 SSH
主机。这个选择会被自动启动复用；远程主机不可用时绝不静默回退到本机，
避免意外把只应在服务器监听的本地地址带到当前电脑。

- 主机资料、选择和运行记录分别保存在应用数据目录的
  `remote_hosts.json`、`remote_runner_preferences.json` 和
  `remote_runner_runs.json`。
- 本机仍只使用本节顶部所述的应用数据目录 `frpc`；远端则只使用主机资料中
  明确填写的绝对 `frpc` 路径。一个隧道对应一个独立的远端 `frpc` 进程，
  不与其他节点共享进程。
- 启动器会在远端 `<工作目录>/chmlfrp-launcher-runs/<run-id>/` 写入临时
  配置和包装器：目录权限为 `0700`，配置权限为 `0600`。包装器优先用
  `setsid` 脱离 SSH；没有 `setsid` 的系统使用 `nohup`。
- 远端 `frpc` 本身不具备“租约自停”功能。这是启动器注入的包装器行为：每次
  运行有 10 分钟可续期租约，Rust 后端每 30 秒同步状态、续租并增量读取日志，
  不依赖前端窗口是否在前台。
  SSH 短暂失败显示为重连中；长期失败显示为状态未知。恢复连接后会按
  `run-id` 和 PID 再次确认运行状态。
- 正常停止或退出会先经 SSH 停止包装器和 `frpc`；若当时无法连接，启动器会
  移除本地续租记录，远端包装器将在租约到期后自行结束，下一次启动也不会误续租。
  托盘退出同样执行本地与远端清理。
- 启用原有“进程守护”时，远端包装器仅在 `frpc` 意外退出后最多重启三次；
  不启用时不会重启。远端日志以隧道 ID 进入既有日志系统，并附加主机与运行
  标识，不与别的节点混淆。

远程运行实现位于 `src-tauri/src/extensions/remote_runner/`；前端只通过
`remoteRunnerService` 和 `tunnelRunnerService` 接入，尽量不改变上游隧道
管理代码。

## 更新与发布

本 fork 暂未设置独立更新源。运行时会拒绝访问官方更新器，避免安装官方版本后覆盖远程运行功能。公开发布前仍需要完成相应平台的签名与公证。

## 对上游贡献的边界

当前实现以个人使用和可维护性为目标，文件组织不代表上游风格。若未来需要贡献上游，应从最新 `upstream/main` 新开分支，按单一、经维护者确认的主题重新实现最小改动；不要直接把本 fork 的 OAuth 配置、文档或完整远程运行器作为一个 PR 提交。

## Git 工作流

- `origin`：个人 fork `Alan-88/ChmlFrpLauncher`。
- `upstream`：官方仓库 `TechCat-Team/ChmlFrpLauncher`。
- `main`：个人 fork 的稳定分支。
- 新功能从 `main` 建立 `feature/<name>` 分支，验证后再合并回 `main`。
