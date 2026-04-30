export type AppLanguage = "zh-CN" | "en-US";

export const DEFAULT_LANGUAGE: AppLanguage = "zh-CN";

export const LANGUAGE_OPTIONS: Array<{
  value: AppLanguage;
  label: string;
  title: string;
}> = [
  { value: "zh-CN", label: "中文", title: "切换到中文" },
  { value: "en-US", label: "EN", title: "Switch to English" }
];

export const messages = {
  "zh-CN": {
    navigation: {
      workspace: "Termira 工作台导航",
      hosts: "主机",
      settings: "设置",
      collapseSidebar: "折叠侧栏",
      expandSidebar: "展开侧栏"
    },
    language: {
      label: "语言"
    },
    hosts: {
      sidebarTitle: "主机",
      workspaceEyebrow: "本地工作区",
      workspaceTitle: "主机",
      searchPlaceholder: "搜索主机、分组或账号",
      newHost: "新建主机",
      editHost: "编辑主机",
      deleteHost: "删除主机",
      confirmDeleteHost: (hostName: string, hasCredential: boolean) =>
        hasCredential
          ? `删除主机「${hostName}」？这会同时删除本地主机配置和关联的 Vault 凭据。`
          : `删除主机「${hostName}」？这会移除本地主机配置。`,
      doubleClickConnect: "双击连接",
      connect: "连接",
      disconnect: "断开",
      favorites: "收藏",
      recent: "最近连接",
      allHosts: "全部主机",
      empty: "没有匹配的主机",
      loading: "正在读取本地配置",
      detailsEyebrow: "连接信息",
      address: "地址",
      group: "分组",
      port: "端口",
      identity: "密钥",
      currentPath: "路径",
      sessionEyebrow: "会话",
      sessionTitle: "准备连接",
      lastConnected: "最近连接",
      auth: "认证",
      keyAuth: "密钥认证",
      homeTitle: "主机",
      hostCount: (count: number) => `${count} 台主机`,
      connectSelected: "连接所选主机",
      statusLabels: {
        connected: "已连接",
        connecting: "连接中",
        disconnected: "未连接",
        failed: "失败",
        timeout: "超时"
      }
    },
    terminal: {
      title: "终端",
      tabLabel: "终端",
      mockBadge: "SSH 会话",
      newTab: "新建标签页",
      newTabTitle: "新标签页",
      closeTab: "关闭终端标签",
      tabMenu: {
        duplicate: "复制",
        reconnect: "重连",
        disconnect: "断开连接",
        duplicateWindow: "在新窗口复制",
        multiplayer: "开始协作",
        rename: "重命名",
        renamePrompt: "标签名称",
        splitHorizontal: "水平拆分",
        close: "关闭"
      },
      connected: (hostName: string) => `已选择 ${hostName}`,
      noHost: "未选择主机",
      ready: "选择主机后可打开 SSH 终端。",
      placeholder: "Termira 工作台已就绪。",
      errorLine: "Last command failed: permission denied while reading /var/log/secure",
      cursor: "▌"
    },
    status: {
      online: "在线",
      starting: "启动中",
      error: "错误",
      offline: "离线"
    },
    actions: {
      ping: "Ping",
      pinging: "Ping 中",
      restart: "重启",
      restarting: "重启中",
      stop: "停止",
      stopping: "停止中",
      start: "启动",
      refresh: "刷新",
      copy: "复制",
      maximize: "最大化",
      restore: "还原"
    },
    tools: {
      title: "工具区",
      eyebrow: "会话工具",
      collapsePanel: "折叠工具面板",
      expandPanel: "展开工具面板",
      themes: {
        title: "终端主题",
        active: "当前主题",
        apply: "应用"
      },
      terminalSettings: {
        font: "字体",
        fontFamily: "字体",
        textSize: "字号",
        decreaseTextSize: "减小字号",
        increaseTextSize: "增大字号",
        sizeInput: "终端字号"
      },
      files: {
        toolbar: "文件工具栏",
        list: "远程文件",
        upload: "上传",
        download: "下载",
        up: "返回上级",
        mkdir: "新建目录",
        rename: "重命名",
        delete: "删除",
        cancel: "取消传输",
        retry: "重试",
        pathInput: "远程路径",
        followTerminalCwd: "跳到终端当前目录",
        dropUploadHere: "拖放上传到当前目录",
        dropUploadIntoFolder: "拖放上传到此文件夹",
        name: "名称",
        size: "大小",
        modified: "修改时间",
        permissions: "权限",
        folderType: "目录",
        create: "创建",
        newFolderPlaceholder: "新建文件夹",
        folderNameRequired: "请输入不包含 / 的文件夹名称。",
        loading: "正在读取远程目录",
        empty: "目录为空",
        noSession: "连接终端后可使用 SFTP。",
        queue: "传输队列",
        queueIdle: "空闲",
        queueEmpty: "暂无传输",
        queueCount: (count: number) => `${count} 个任务`,
        mkdirPrompt: "目录名称",
        renamePrompt: "新名称",
        downloadPrompt: "下载到本地路径",
        confirmDelete: (name: string) => `删除「${name}」？`,
        localPathUnavailable: "无法读取本地文件路径。",
        transferStatus: {
          queued: "排队中",
          running: "传输中",
          completed: "已完成",
          failed: "失败",
          cancelled: "已取消"
        }
      },
      forwards: {
        unavailable: "端口转发将在阶段 5 接入真实 SSH tunnel。",
        newRule: "新建规则",
        typeLabels: {
          local: "本地",
          remote: "远程",
          dynamic: "动态"
        },
        statusLabels: {
          running: "运行中",
          starting: "启动中",
          failed: "失败",
          stopped: "已停止"
        }
      },
      monitor: {
        unavailable: "监控将在阶段 6 通过 SSH exec 采集真实指标。",
        uptime: "运行时间",
        refresh: "采集",
        refreshing: "3 秒刷新中",
        partialError: "磁盘 inode 采集暂不可用"
      },
      processes: {
        unavailable: "进程管理将在阶段 7 通过 SSH exec 接入真实列表。",
        title: "进程列表",
        searchPlaceholder: "搜索 PID、用户或命令",
        command: "命令",
        kill: "结束进程",
        loaded: (count: number) => `已载入 ${count} 个进程`
      },
      commands: {
        unavailable: "已连接终端后，快捷命令可发送到当前会话。",
        newCommand: "新建命令",
        groups: "分组",
        send: "发送"
      }
    },
    settings: {
      sidebarTitle: "设置",
      preferences: "偏好设置",
      general: "通用",
      appearance: "外观",
      security: "安全",
      eyebrow: "偏好设置",
      title: "语言",
      description: "Termira 默认使用中文界面，同时保留英文界面用于后续国际化。",
      currentLanguage: "当前语言"
    },
    hostEditor: {
      eyebrow: "本地配置",
      title: "新建主机",
      editTitle: "编辑主机",
      close: "关闭",
      name: "名称",
      group: "分组",
      host: "主机",
      port: "端口",
      username: "用户名",
      path: "默认路径",
      tags: "标签",
      note: "备注",
      authType: "认证方式",
      authTypes: {
        password: "密码",
        privateKey: "密钥",
        keyboardInteractive: "交互"
      },
      privateKeyPath: "密钥路径",
      password: "密码",
      passphrase: "密钥口令",
      saveCredential: "保存到 Vault",
      favorite: "收藏",
      cancel: "取消",
      save: "保存主机",
      saving: "保存中",
      validation: "请填写名称、主机、用户名和有效端口。",
      vaultLocked: "Vault 已锁定，先在设置中解锁。"
    },
    vault: {
      title: "Vault",
      notInitialized: "未初始化",
      locked: "已锁定",
      unlocked: "已解锁",
      mode: "模式",
      localMode: "本地密钥",
      masterMode: "主密码",
      credentialCount: "凭据",
      cipher: "加密",
      initLocal: "本地模式",
      initMaster: "设置主密码",
      masterPassword: "主密码",
      unlock: "解锁",
      lock: "锁定"
    }
  },
  "en-US": {
    navigation: {
      workspace: "Termira workspace navigation",
      hosts: "Hosts",
      settings: "Settings",
      collapseSidebar: "Collapse sidebar",
      expandSidebar: "Expand sidebar"
    },
    language: {
      label: "Language"
    },
    hosts: {
      sidebarTitle: "Hosts",
      workspaceEyebrow: "Local workspace",
      workspaceTitle: "Hosts",
      searchPlaceholder: "Search hosts, groups, or users",
      newHost: "New host",
      editHost: "Edit host",
      deleteHost: "Delete host",
      confirmDeleteHost: (hostName: string, hasCredential: boolean) =>
        hasCredential
          ? `Delete "${hostName}"? This also deletes the local host profile and its linked Vault credential.`
          : `Delete "${hostName}"? This removes the local host profile.`,
      doubleClickConnect: "Double-click to connect",
      connect: "Connect",
      disconnect: "Disconnect",
      favorites: "Favorites",
      recent: "Recent",
      allHosts: "All hosts",
      empty: "No matching hosts",
      loading: "Loading local profiles",
      detailsEyebrow: "Connection",
      address: "Address",
      group: "Group",
      port: "Port",
      identity: "Identity",
      currentPath: "Path",
      sessionEyebrow: "Session",
      sessionTitle: "Ready to connect",
      lastConnected: "Last connected",
      auth: "Auth",
      keyAuth: "Key auth",
      homeTitle: "Hosts",
      hostCount: (count: number) => `${count} hosts`,
      connectSelected: "Connect selected host",
      statusLabels: {
        connected: "Connected",
        connecting: "Connecting",
        disconnected: "Disconnected",
        failed: "Failed",
        timeout: "Timed out"
      }
    },
    terminal: {
      title: "Terminal",
      tabLabel: "Terminal",
      mockBadge: "SSH session",
      newTab: "New tab",
      newTabTitle: "New Tab",
      closeTab: "Close terminal tab",
      tabMenu: {
        duplicate: "Duplicate",
        reconnect: "Reconnect",
        disconnect: "Disconnect",
        duplicateWindow: "Duplicate in a new window",
        multiplayer: "Start multiplayer",
        rename: "Rename",
        renamePrompt: "Tab name",
        splitHorizontal: "Split horizontally",
        close: "Close"
      },
      connected: (hostName: string) => `Selected ${hostName}`,
      noHost: "No host selected",
      ready: "Select a host to open an SSH terminal.",
      placeholder: "Termira workspace is ready.",
      errorLine: "Last command failed: permission denied while reading /var/log/secure",
      cursor: "▌"
    },
    status: {
      online: "Online",
      starting: "Starting",
      error: "Error",
      offline: "Offline"
    },
    actions: {
      ping: "Ping",
      pinging: "Pinging",
      restart: "Restart",
      restarting: "Restarting",
      stop: "Stop",
      stopping: "Stopping",
      start: "Start",
      refresh: "Refresh",
      copy: "Copy",
      maximize: "Maximize",
      restore: "Restore"
    },
    tools: {
      title: "Tool area",
      eyebrow: "Session tools",
      collapsePanel: "Collapse tool panel",
      expandPanel: "Expand tool panel",
      themes: {
        title: "Terminal themes",
        active: "Active",
        apply: "Apply"
      },
      terminalSettings: {
        font: "Font",
        fontFamily: "Font",
        textSize: "Text size",
        decreaseTextSize: "Decrease text size",
        increaseTextSize: "Increase text size",
        sizeInput: "Terminal text size"
      },
      files: {
        toolbar: "File toolbar",
        list: "Remote files",
        upload: "Upload",
        download: "Download",
        up: "Go up",
        mkdir: "New folder",
        rename: "Rename",
        delete: "Delete",
        cancel: "Cancel transfer",
        retry: "Retry",
        pathInput: "Remote path",
        followTerminalCwd: "Go to terminal current directory",
        dropUploadHere: "Drop to upload here",
        dropUploadIntoFolder: "Drop to upload into this folder",
        name: "Name",
        size: "Size",
        modified: "Modified",
        permissions: "Perms",
        folderType: "Folder",
        create: "Create",
        newFolderPlaceholder: "New folder",
        folderNameRequired: "Enter a folder name without /.",
        loading: "Loading remote directory",
        empty: "Directory is empty",
        noSession: "Connect a terminal to use SFTP.",
        queue: "Transfer queue",
        queueIdle: "Idle",
        queueEmpty: "No transfers",
        queueCount: (count: number) => `${count} tasks`,
        mkdirPrompt: "Folder name",
        renamePrompt: "New name",
        downloadPrompt: "Download to local path",
        confirmDelete: (name: string) => `Delete "${name}"?`,
        localPathUnavailable: "Unable to read the local file path.",
        transferStatus: {
          queued: "Queued",
          running: "Transferring",
          completed: "Completed",
          failed: "Failed",
          cancelled: "Cancelled"
        }
      },
      forwards: {
        unavailable: "Port forwarding will be wired to real SSH tunnels in stage 5.",
        newRule: "New rule",
        typeLabels: {
          local: "Local",
          remote: "Remote",
          dynamic: "Dynamic"
        },
        statusLabels: {
          running: "Running",
          starting: "Starting",
          failed: "Failed",
          stopped: "Stopped"
        }
      },
      monitor: {
        unavailable: "Monitor metrics will be collected through SSH exec in stage 6.",
        uptime: "Uptime",
        refresh: "Collect",
        refreshing: "Refreshing every 3s",
        partialError: "Disk inode collection is unavailable"
      },
      processes: {
        unavailable: "Process management will be wired through SSH exec in stage 7.",
        title: "Process list",
        searchPlaceholder: "Search PID, user, or command",
        command: "Command",
        kill: "Kill process",
        loaded: (count: number) => `${count} processes loaded`
      },
      commands: {
        unavailable: "After connecting a terminal, quick commands can be sent to the current session.",
        newCommand: "New command",
        groups: "Groups",
        send: "Send"
      }
    },
    settings: {
      sidebarTitle: "Settings",
      preferences: "Preferences",
      general: "General",
      appearance: "Appearance",
      security: "Security",
      eyebrow: "Preferences",
      title: "Language",
      description: "Termira uses Chinese by default while keeping English available for future localization.",
      currentLanguage: "Current language"
    },
    hostEditor: {
      eyebrow: "Local profile",
      title: "New host",
      editTitle: "Edit host",
      close: "Close",
      name: "Name",
      group: "Group",
      host: "Host",
      port: "Port",
      username: "Username",
      path: "Default path",
      tags: "Tags",
      note: "Note",
      authType: "Auth type",
      authTypes: {
        password: "Password",
        privateKey: "Key",
        keyboardInteractive: "Interactive"
      },
      privateKeyPath: "Key path",
      password: "Password",
      passphrase: "Passphrase",
      saveCredential: "Save to Vault",
      favorite: "Favorite",
      cancel: "Cancel",
      save: "Save host",
      saving: "Saving",
      validation: "Fill name, host, username, and a valid port.",
      vaultLocked: "Vault is locked. Unlock it in Settings first."
    },
    vault: {
      title: "Vault",
      notInitialized: "Not initialized",
      locked: "Locked",
      unlocked: "Unlocked",
      mode: "Mode",
      localMode: "Local key",
      masterMode: "Master password",
      credentialCount: "Credentials",
      cipher: "Cipher",
      initLocal: "Local mode",
      initMaster: "Set master",
      masterPassword: "Master password",
      unlock: "Unlock",
      lock: "Lock"
    }
  }
};

export type AppMessages = (typeof messages)[AppLanguage];

export function getMessages(language: AppLanguage): AppMessages {
  return messages[language] ?? messages[DEFAULT_LANGUAGE];
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "zh-CN" || value === "en-US";
}
