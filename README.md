# ChmlFrp Launcher Remote Runner

> 这是 [Alan-88](https://github.com/Alan-88) 维护的个人 fork，不是 ChmlFrp 官方发行版，也不隶属于 TechCat-Team。

本项目基于 [TechCat-Team/ChmlFrpLauncher](https://github.com/TechCat-Team/ChmlFrpLauncher) 的 `v0.7.5`。它保留原启动器的隧道管理能力，并加入以 SSH 在远程主机运行 `frpc` 的功能，方便在本机与多台服务器之间统一管理隧道。

## 与上游的主要差异

- 每条隧道可持久选择在本机或已配置的 SSH 主机运行。
- 远程运行器会管理独立的 `frpc` 进程、状态同步、日志回传和 SSH 短暂断连后的恢复。
- 使用设备码 OAuth 登录，并在 access token 刷新时避免并发请求误清除新会话。
- `frpc` 不再继承系统代理；是否绕过代理仍由原有设置控制。

完整实现与运行边界见 [FORK.md](FORK.md)。

## 使用前请注意

- 源码默认保留上游的 OAuth 公开客户端配置；本地维护者可用 `.env.local` 中的 `VITE_CHMLFRP_OAUTH_CLIENT_ID` 覆盖。它不会让本 fork 成为官方客户端，也不要向官方渠道索取该 fork 的支持。
- 为兼容现有本地数据，当前仍使用官方应用标识 `net.chmlfrp.launcher`，因此**不能与官方版并行安装**；两者会共用应用数据目录和 `frpc`。
- 已主动禁用官方更新通道，避免本 fork 被官方更新覆盖。后续版本只会通过本仓库发布；目前不提供已签名或已公证的 macOS 安装包。
- SSH 主机资料可启动远端命令。请只配置你拥有或获授权管理的主机，并妥善保护本机用户目录中的应用数据。

## 开发

```bash
pnpm install
pnpm tauri dev
```

如需用你自己的 OAuth 客户端进行本地开发：

```bash
cp .env.example .env.local
# 在 .env.local 填入 VITE_CHMLFRP_OAUTH_CLIENT_ID
```

`.env.local` 不会提交到 Git；使用它构建的安装包会包含该公开 client ID，发布前请确认这是你的预期。

构建本地测试包：

```bash
pnpm tauri build
```

本 fork 当前以 macOS Apple Silicon 为主要测试环境。远程运行器在 Linux 上优先使用 `setsid`，在 macOS 上回退到 `nohup`；其他平台请自行验证后再用于长期服务。

## 分支与同步

- `upstream/main`：官方上游。
- `main`：此 fork 的稳定代码与默认分支。
- `feature/*`：后续实验和开发分支。

同步上游时先执行 `git fetch upstream`，再有选择地把 `upstream/main` 合入新的功能分支；不要把个人 OAuth 配置或整个远程运行器直接作为上游 PR 提交。

## 上游与许可证

原项目、官方支持与通用问题请前往 [TechCat-Team/ChmlFrpLauncher](https://github.com/TechCat-Team/ChmlFrpLauncher)。

本项目沿用 [Apache-2.0](LICENSE) 许可证，并保留上游署名与版权信息。
