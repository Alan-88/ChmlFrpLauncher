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

## 后续扩展约定

远程运行功能作为本地扩展实现：新增代码放在独立的扩展边界中，
上游现有文件只保留必要的接入点；不为了满足文件大小规则而重构
与功能无关的上游实现。

## Git 工作流

- `main`：保持上游基线，便于同步和对比。
- `alan/base`：本地自定义的稳定基线。
- 新功能从 `alan/base` 建立 `feature/<name>` 分支，验证后合并回 `alan/base`。
- 若未来建立个人 GitHub fork，再将其添加为独立 remote；当前 `origin` 保持上游仓库。
