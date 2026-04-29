# 阶段 2：本地配置与 Vault

完成日期：2026-04-29

## 目标

阶段 2 实现本地配置持久化和第一阶段本地加密 Vault，不接入 Keychain，不接入真实 SSH/SFTP/端口转发运行态。

本阶段已完成：

- Profile Store：SQLite `profiles.db`。
- HostProfile CRUD 与搜索、收藏、最近连接记录。
- HostGroup CRUD。
- ForwardRule 本地保存。
- QuickCommand 本地保存。
- CredentialRef 与 HostProfile 关联。
- Vault 初始化、解锁、锁定。
- Credential 保存、读取、删除、解密测试。
- UI 主机新建表单与 Vault 设置入口。
- 日志与本地文件明文凭据检查。

## 本地文件

Electron 开发/运行时通过 `TERMIRA_CONFIG_DIR` 指定 Java sidecar 配置目录。默认使用 Electron `userData` 目录。

Java sidecar 文件：

```text
profiles.db
vault.dat
vault.local.key
logs/backend.log
```

`profiles.db` 保存非敏感配置。敏感凭据只通过 `credentialRef` 关联，不写入 profile 表。

`vault.dat` 保存加密 payload、schema version、KDF 参数、salt、nonce、cipher 参数。

无主密码模式会生成 `vault.local.key`。该模式安全性低于主密码和后续 Keychain 模式，但可防止配置文件被直接误查看。

## Vault 加密

当前 Java 第一阶段采用安全设计文档允许的稳定打包方案：

- KDF：`PBKDF2WithHmacSHA256`
- 参数：`iterations=210000`，`keyBits=256`
- AEAD：`AES-256-GCM`
- schemaVersion：`1`

主密码模式：

- 不保存主密码。
- 解锁时用输入主密码派生 key。
- 错误主密码返回 `VAULT_UNLOCK_FAILED`。
- 已解锁 Vault 调用 `vault.init` 设置主密码时会重加密现有 payload，不清空凭据。

损坏文件策略：

- `vault.status` / `vault.unlock` 读取损坏 Vault 时返回错误。
- 不覆盖原 Vault 文件。
- 写入使用临时文件替换，避免半写入。

## IPC 方法

新增方法：

```text
profile.list
profile.get
profile.create
profile.update
profile.delete
profile.search
profile.markFavorite
profile.recordRecent

hostGroup.list
hostGroup.create
hostGroup.update
hostGroup.delete

forwardRule.list
forwardRule.save
forwardRule.delete

quickCommand.list
quickCommand.save
quickCommand.delete

vault.status
vault.init
vault.unlock
vault.lock

credential.save
credential.get
credential.delete
credential.testDecrypt
```

## UI 行为

- 主机列表从 `profile.list` 读取，不再使用静态 mock 主机。
- 新建主机表单支持名称、分组、地址、端口、用户名、标签、默认路径、备注、认证方式。
- 勾选“保存到 Vault”时，先写入 Vault，再将 `credentialRef` 写入 HostProfile。
- Vault 未初始化且保存凭据时，UI 会按需初始化本地密钥模式。
- Vault 已锁定时，保存凭据会提示先到设置中解锁。
- 设置页安全区域支持本地模式初始化、主密码初始化、解锁、锁定。

## 验证结果

已执行：

```bash
npm run typecheck -w apps/desktop
npm run typecheck -w packages/shared
npm run test -w apps/desktop
mvn -Dmaven.repo.local=.m2/repository -f apps/backend-java/pom.xml test
npm run test
npm run build
```

结果：

- 前端 typecheck 通过。
- shared typecheck 通过。
- 前端测试 3 个通过。
- Java 测试 10 个通过。
- 仓库级测试通过。
- 仓库级构建通过。

真实 sidecar 验收：

1. 使用临时配置目录启动 Java sidecar。
2. 调用 `vault.init` 初始化本地 Vault。
3. 调用 `credential.save` 保存测试密码。
4. 调用 `profile.create` 创建引用 `credentialRef` 的主机。
5. 重启 sidecar 后调用 `profile.list`，主机仍存在。
6. 扫描 `profiles.db`、`vault.dat`、日志目录，均未发现测试密码明文。

## 后续阶段边界

阶段 2 不实现：

- 真实 SSH 连接。
- SFTP 真实文件操作。
- 端口转发运行态。
- Keychain / Credential Manager。
- known_hosts 与指纹确认。

这些能力按开发文档进入后续阶段。
