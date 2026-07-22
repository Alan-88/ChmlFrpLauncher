# Alan 的 ChmlFrp Launcher 扩展说明

这份文档只记录此本地 fork 相对
[TechCat-Team/ChmlFrpLauncher](https://github.com/TechCat-Team/ChmlFrpLauncher)
的改动；上游 README 与功能说明保持原样。

## 上游基线

- 上游提交：`f2633b0`（2026-05-21）
- 本地自定义基线分支：`alan/base`

## frpc 核心程序位置

启动器只会使用自己的应用数据目录中的 `frpc`，不会扫描系统 PATH
或复用其他目录中的 `frpc`。

- macOS：`~/Library/Application Support/net.chmlfrp.launcher/frpc`
- 若该文件不存在，启动器会尝试从应用内置资源复制；“下载 frpc”也会写入同一路径。
- 使用相同 `net.chmlfrp.launcher` 标识的旧版和新版会共用这个目录。

## 当前本地改动

### 第三方 OAuth 登录

- OAuth 公开客户端配置位于 `src/services/oauthConfig.ts`。
- `src/services/api.ts` 仅引用该配置，仍使用设备码授权。
- 请求权限域：`profile email offline_access chmlfrp_api`。
- 不在代码、日志或文档中记录 access token、refresh token 或 client secret。
- 本地会话只接受 OAuth access token；旧版仅保存 `usertoken` 的缓存会被清除，需重新授权一次。

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
  运行有 10 分钟可续期租约，应用每 45 秒同步状态、续租并增量读取日志。
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

## 后续扩展约定

远程运行功能作为本地扩展实现：新增代码放在独立的扩展边界中，
上游现有文件只保留必要的接入点；不为了满足文件大小规则而重构
与功能无关的上游实现。

## Git 工作流

- `main`：保持上游基线，便于同步和对比。
- `alan/base`：本地自定义的稳定基线。
- 新功能从 `alan/base` 建立 `feature/<name>` 分支，验证后合并回 `alan/base`。
- 若未来建立个人 GitHub fork，再将其添加为独立 remote；当前 `origin` 保持上游仓库。
