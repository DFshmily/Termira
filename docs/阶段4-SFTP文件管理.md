# 阶段 4：SFTP 文件管理

按照 `docs/开发文档.md` 的 3.5 要求，本阶段接入真实 SFTP 文件管理能力。SFTP 基于已连接 SSH session 创建 client，和终端 channel 共享 SSH 连接但独立失败处理。

## 本阶段交付

- 后端新增 `SftpManager`，支持目录打开、列表、上传、下载、删除、重命名、新建目录和取消传输。
- IPC 新增 `sftp.open`、`sftp.list`、`sftp.upload`、`sftp.download`、`sftp.remove`、`sftp.rename`、`sftp.mkdir`、`sftp.cancelTransfer`。
- 事件新增并接入 `sftp.listUpdated`、`transfer.progress`、`transfer.completed`、`transfer.failed`。
- 前端右侧 SFTP 面板接入真实远程文件列表，显示名称、大小、修改时间、权限。
- 前端支持上级目录、刷新、上传、下载、新建目录、重命名、删除确认、传输取消和失败重试。
- `packages/shared` 补充 SFTP IPC 和传输队列类型。
- 后端会把 `~` 和 `~/...` 规范化为当前 SFTP 会话的 home 路径，兼容不在 SFTP 层展开 `~` 的服务器。
- 终端顶部标签栏调整为接近 Termius 的深色胶囊式布局，保留主机库、SFTP、会话标签和新标签入口。
- 终端标签支持右键菜单，提供复制、重连、断开、重命名、关闭等会话管理入口；暂未实现的新窗口复制、协作、水平拆分以禁用态展示。
- 终端断开按钮改为立即更新本地状态，并分别关闭 terminal channel 和 SSH session，避免其中一步失败导致按钮看似无效；断开后的标签可用同一按钮关闭。
- SFTP 文件列表改为紧凑文件管理器布局：路径和工具栏固定，文件列表独立纵向滚动，传输队列固定在底部，长文件名保留可读空间。

## 后端实现

新增模块位于 `apps/backend-java/src/main/java/com/termira/sftp`：

- `SftpManager`：按需从 `SshSessionManager` 获取 SFTP client，执行文件操作。
- 请求/响应 record：`SftpOpenRequest`、`SftpListRequest`、`SftpUploadRequest`、`SftpDownloadRequest`、`SftpRemoveRequest`、`SftpRenameRequest`、`SftpMkdirRequest`、`SftpCancelTransferRequest`、`SftpOpenResult`、`SftpListResult`、`SftpFileEntry`、`TransferView`。

传输队列使用单线程 executor：

- 上传/下载 IPC 立即返回 `transferId`。
- 传输过程通过 SSHJ `TransferListener` 周期性推送进度。
- 取消时标记任务并让进度回调中断传输。
- 单个传输失败只发送 `transfer.failed`，不关闭 SSH session 或终端 channel。

新增错误码：

- `SFTP_NOT_CONNECTED`
- `SFTP_PERMISSION_DENIED`
- `SFTP_PATH_NOT_FOUND`
- `SFTP_OPERATION_FAILED`
- `SFTP_TRANSFER_FAILED`
- `SFTP_TRANSFER_CANCELLED`
- `SFTP_TRANSFER_NOT_FOUND`
- `SFTP_VALIDATION_FAILED`

## 前端实现

右侧工具区的 SFTP 面板从占位态切换为真实文件管理：

- 已连接终端时自动打开当前会话默认路径。
- 双击目录进入目录，工具栏可返回上级和刷新。
- 新建目录使用列表内联输入，避免系统 prompt 被遮挡或焦点不明显。
- 上传使用 Electron preload 暴露的 `webUtils.getPathForFile` 获取本地路径。
- 下载使用用户输入的本地目标路径，默认提示 `~/Downloads/<文件名>`。
- 删除前使用确认框。
- 传输队列展示 queued、running、completed、failed、cancelled 状态，失败或取消后可重试。

## 验证记录

本地验证：

- `npm run typecheck -w apps/desktop`：通过。
- `npm run test -w apps/desktop`：通过。
- `npm run typecheck -w packages/shared`：通过。
- `mvn -Dmaven.repo.local=.m2/repository -f apps/backend-java/pom.xml test`：通过，未配置真实服务器环境变量时 E2E 自动跳过。

桌面端实机验收：

- 使用开发模式启动 Termira，连接真实服务器后，右键终端标签可以打开类 Termius 菜单。
- 点击终端工具栏方形断开按钮后，状态立即从已连接切换到未连接，SFTP 面板同步进入未连接态。
- 打开 SFTP 面板后，远程 `/home/ubuntu` 下的 `.bash_history`、`.sudo_as_admin_successful` 等长名称能完整显示，列表区域可以单独纵向滚动且不出现横向滚动条。
- 点击 SFTP 新建目录按钮后出现内联输入，创建 `termira-ui-mkdir-check-20260430` 成功并自动刷新列表。

真实服务器验证：

- 使用测试服务器执行 `SftpManagerE2ETest` 和 `SshSessionManagerE2ETest`：通过。
- 覆盖 SSH 登录、交互终端命令、SFTP 建目录、上传、下载内容校验、重命名、删除。
- 测试创建的远程临时目录在 finally 清理，不保留测试文件。

## 当前限制

- 本阶段不实现本地双栏文件管理器。
- 本阶段不实现远程文件在线编辑。
- 本阶段不实现断点续传。
- 下载目标路径先使用轻量 prompt，后续可接入 Electron 原生保存对话框。
