# 阶段 3：SSH 连接与交互终端

日期：2026-04-29

## 目标

按照 `docs/开发文档.md` 的 3.4 要求，本阶段实现真实 SSH 连接与交互式终端能力，完成从 React xterm 输入到 Java SSH channel，再从 Java channel 输出回 xterm 的闭环。

## 交付范围

- Java sidecar 引入 SSHJ，并新增 SSH 运行态模块。
- 支持 `ssh.connect`、`ssh.disconnect`、`ssh.getSession`。
- 支持 `terminal.openShell`、`terminal.write`、`terminal.resize`、`terminal.close`。
- 输出事件通过 `terminal.output` 推送，包含 `sessionId`、`channelId`、`data`。
- 状态事件通过 `ssh.statusChanged` 推送，覆盖连接中、认证中、已连接、断开、失败。
- 支持密码认证、私钥文件/私钥内容认证、keyboard-interactive 的密码式认证路径。
- 前端接入 `@xterm/xterm` 与 `@xterm/addon-fit`，每个终端标签独立 xterm 实例和 channel。
- 终端输入不进入 React state，完整输出不进入 React state。
- 新增共享 IPC 类型，约束 SSH session 与 terminal channel 协议。

## 后端实现

新增模块位于 `apps/backend-java/src/main/java/com/termira/ssh`：

- `SshSessionManager`：负责连接、认证、session 映射、断开、状态事件。
- `TerminalChannel`：负责 PTY shell、输入写入、stdout/stderr 读取、resize、关闭。
- `SshSessionView`、`SshConnectRequest`、`Terminal*Request`：定义 IPC 参数和返回结构。

错误码新增：

- `SSH_AUTH_FAILED`
- `SSH_CONNECT_TIMEOUT`
- `SSH_NETWORK_UNREACHABLE`
- `SSH_SESSION_NOT_FOUND`
- `SSH_TERMINAL_NOT_FOUND`
- `SSH_CHANNEL_OPEN_FAILED`
- `SSH_CHANNEL_WRITE_FAILED`
- `SSH_VALIDATION_FAILED`

安全边界：

- 第一阶段按文档限制不做 known_hosts，当前使用 SSHJ `PromiscuousVerifier`。
- 密码、passphrase、终端输入和完整终端输出不写入业务日志。
- 测试服务器密码仅通过本地环境变量注入测试进程，不写入仓库。

## 前端实现

前端工作台终端区域已从静态 `<pre>` 切换为 xterm：

- 新建终端标签时创建 SSH session 和 terminal channel。
- 主机列表支持编辑、删除和双击连接；同一主机已有已连接终端时双击会聚焦现有会话，避免重复打开多个 shell。
- xterm `onData` 调用 `terminal.write`。
- `terminal.output` 事件直接写入对应 xterm 实例。
- 窗口 resize、侧栏折叠和工具区折叠会触发 fit，并 debounce 调用 `terminal.resize`。
- 关闭标签会关闭 terminal channel、断开 SSH session，并从标签栏移除该标签；最后一个标签关闭后只显示空状态，不再保留伪标签。
- 连接失败显示在终端状态栏和标签状态中。
- 开发态热更新会清理旧 IPC 监听，防止终端输出重复渲染。

主机删除行为：

- 删除前弹出确认框。
- 删除主机配置时会同步清理关联的 Vault 凭据，避免留下孤儿凭据。
- 删除主机前会关闭该主机关联的终端 channel 和 SSH session。

工具区边界：

- SFTP、端口转发、监控和进程管理在本阶段不展示伪造数据，只显示后续阶段接入说明。
- 快捷命令面板保留发送到当前终端的能力；未连接时发送按钮禁用。

## 验证结果

已完成自动化验证：

- `npm run test -w apps/desktop`：通过。
- `npm run test -w packages/shared`：通过。
- `npm run typecheck -w apps/desktop`：通过。
- `mvn -Dmaven.repo.local=.m2/repository -f apps/backend-java/pom.xml test`：通过，E2E 在未提供环境变量时跳过。
- `npm test`：通过。
- `npm run build`：通过。

真实服务器验证：

- 服务器：`119.91.123.116`
- 用户：`ubuntu`
- 验证项：密码登录、打开交互 shell、执行 `whoami`/`pwd`/`ls` 相关命令、接收输出、PTY resize、关闭 channel、断开 session。
- 结果：通过。
- 认证失败验证：使用错误密码连接同一服务器，返回 `SSH_AUTH_FAILED`，通过。

## 当前边界

- known_hosts 校验按第一阶段限制暂不实现。
- keyboard-interactive 当前走密码式响应路径，后续可扩展为多 challenge 表单。
- 私钥 UI 当前支持密钥路径和 passphrase；私钥内容可通过 IPC/Vault 层支持，前端表单暂未暴露粘贴私钥内容入口。
- SFTP、端口转发、监控和快捷命令属于后续阶段，本阶段只预留复用 SSH session 的基础。

## 下一步建议

- 阶段 4 复用 `sessionId` 接入 SFTP。
- 为前端增加连接前未保存密码时的临时凭据输入弹窗。
- 后续阶段引入 known_hosts 管理和主机指纹确认。
