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
- 主机列表支持编辑、删除和双击连接；同一主机允许打开多个独立终端标签，每个标签使用独立 SSH session/channel。
- 软件启动默认进入主机首页，主体区域展示主机卡片网格；未选择主机时不展示隐式地址，也不会自动选中第一台主机。
- 主机首页隐藏重复的主机侧栏，只保留最左侧功能栏，避免主机列表在首页出现两次。
- 主机首页卡片支持单击选中、双击连接，连接后才进入终端工作台。
- 主机首页和终端工作台已拆分为独立视图：点击主机入口始终回到全部主机卡片页，点击终端入口回到已有终端会话。
- 已移除终端工作台左侧重复主机列表，避免主页卡片和侧栏主机列表同时出现。
- 通过主机首页双击、主机首页连接按钮或新标签页连接按钮可以为同一主机打开多个独立 SSH 会话，不再因为已有同主机会话而只聚焦旧标签。
- 主机展示区双击或点击连接时增加连接中去重锁：同一主机正在打开时会聚焦对应标签，避免并发半初始化连接影响前一个终端；连接完成后仍允许再次从主机区多开独立会话。
- 双击连接保留事件冒泡隔离，避免编辑/删除等卡片内操作误触发连接。
- 主机页和终端页切换时会保留已打开终端的 xterm DOM，不再因从主机页二次打开连接而卸载旧终端实例，避免第一个终端标签恢复后黑屏或空白。
- 切换多个同主机终端标签时会保持非活动 xterm 仍在绘制树中，并重新 fit/refresh 当前 xterm，避免隐藏标签恢复后出现黑屏或内容未重绘。
- SSH session 创建成功后会同步绑定到前端标签映射，再打开 shell，避免远端 MOTD 输出过快时无法映射到对应标签。
- 终端输出路由优先按 `channelId` 精确匹配标签，只在 shell channel 尚未绑定时用 `sessionId` 兜底，避免多个同主机会话输出归属不稳定。
- shell 打开失败时会主动关闭已创建的 terminal channel 和 SSH session，避免失败标签遗留后台连接。
- 终端标签栏 `+` 改为创建“新标签页”主机选择页：用户可先浏览/搜索主机，再把该标签页转换为真实 SSH 终端，不会直接复用当前主机发起连接。
- 新标签页内单击主机只更新选中状态，不会跳回全局主机页或隐藏上方标签栏；连接动作仍由双击主机或点击连接按钮触发。
- 默认桌面窗口调整为更适合终端和右侧工具区并排使用的尺寸，工具区只在窄屏下折到底部。
- 连接时不再向 xterm 写入本地伪造的 `$ ssh ...` 提示行，终端只展示远端 shell 返回的真实欢迎信息、MOTD、提示符和命令输出。
- 右侧工具区新增终端主题面板，内置 Pro、Ocean、Dracula、Monokai、Solarized 等主题，默认使用 Pro 并本地持久化。
- 主题面板补充终端字体设置，支持字体族选择和字号步进/输入调整，字号默认 14 并本地持久化。
- 主题面板改为设置型布局，不再显示“会话工具 / 主题 / 已连接”头部，避免主题配置区混入连接状态。
- xterm 滚动条改为细窄深色样式，避免出现系统默认亮色大滚动条。
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
- 右侧会话工具区默认折叠，进入终端后用户可按需展开。

## 验证结果

已完成自动化验证：

- `npm run test -w apps/desktop`：通过。
- `npm run test -w packages/shared`：通过。
- `npm run typecheck -w apps/desktop`：通过。
- `mvn -Dmaven.repo.local=.m2/repository -f apps/backend-java/pom.xml test`：通过，E2E 在未提供环境变量时跳过。
- `TERMIRA_E2E_SSH_*` 注入真实服务器参数后运行 `SshSessionManagerE2ETest`：通过。
- `npm test`：通过。
- `npm run build`：通过。
- 2026-04-30 回归：`npm run test -w apps/desktop`、`npm run typecheck`、`npm run build` 均通过；真实服务器 E2E 再次通过。
- 2026-04-30 界面复测：从主机页连续打开同一主机两次，切回第一个终端内容保持正常；终端标签栏 `+` 打开新标签页主机列表，通过。
- 2026-04-30 界面复测：新标签页内单击主机后标签栏保持可见，通过。

真实服务器验证：

- 服务器：通过 `TERMIRA_E2E_SSH_HOST` 注入，不在文档中记录真实地址。
- 用户：通过 `TERMIRA_E2E_SSH_USER` 注入，不在文档中记录真实账号。
- 验证项：密码登录、打开交互 shell、执行 `whoami`/`pwd`/`ls` 相关命令、接收输出、PTY resize、关闭 channel、断开 session。
- 结果：通过。
- 认证失败验证：使用错误密码连接同一服务器，返回 `SSH_AUTH_FAILED`，通过。
- 回归修复：SSHJ 将错误密码包装为认证相关 `TransportException` 时，也会稳定映射为 `SSH_AUTH_FAILED`。

## 当前边界

- known_hosts 校验按第一阶段限制暂不实现。
- keyboard-interactive 当前走密码式响应路径，后续可扩展为多 challenge 表单。
- 私钥 UI 当前支持密钥路径和 passphrase；私钥内容可通过 IPC/Vault 层支持，前端表单暂未暴露粘贴私钥内容入口。
- SFTP、端口转发、监控和快捷命令属于后续阶段，本阶段只预留复用 SSH session 的基础。

## 下一步建议

- 阶段 4 复用 `sessionId` 接入 SFTP。
- 为前端增加连接前未保存密码时的临时凭据输入弹窗。
- 后续阶段引入 known_hosts 管理和主机指纹确认。
