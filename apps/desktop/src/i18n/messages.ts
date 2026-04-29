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
      connect: "连接",
      disconnect: "断开",
      favorites: "收藏",
      recent: "最近连接",
      allHosts: "全部主机",
      empty: "没有匹配的主机",
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
      statusLabels: {
        connected: "已连接",
        connecting: "连接中",
        disconnected: "未连接",
        failed: "失败",
        timeout: "超时"
      }
    },
    terminal: {
      title: "终端预览",
      tabLabel: "终端",
      mockBadge: "预览会话",
      newTab: "新建终端标签",
      closeTab: "关闭终端标签",
      connected: (hostName: string) => `已选择 ${hostName}`,
      ready: "连接能力将在后续阶段接入真实 SSH。",
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
      maximize: "最大化"
    },
    tools: {
      title: "工具区",
      eyebrow: "会话工具",
      collapsePanel: "折叠工具面板",
      expandPanel: "展开工具面板",
      files: {
        toolbar: "文件工具栏",
        list: "远程文件",
        upload: "上传",
        download: "下载",
        moreDisabled: "选择文件后可用",
        name: "名称",
        size: "大小",
        modified: "修改时间",
        queue: "传输队列",
        queueCount: (count: number) => `${count} 个任务`
      },
      forwards: {
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
        uptime: "运行时间",
        refresh: "采集",
        refreshing: "3 秒刷新中",
        partialError: "磁盘 inode 采集暂不可用"
      },
      processes: {
        title: "进程列表",
        searchPlaceholder: "搜索 PID、用户或命令",
        command: "命令",
        kill: "结束进程",
        loaded: (count: number) => `已载入 ${count} 个进程`
      },
      commands: {
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
      connect: "Connect",
      disconnect: "Disconnect",
      favorites: "Favorites",
      recent: "Recent",
      allHosts: "All hosts",
      empty: "No matching hosts",
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
      statusLabels: {
        connected: "Connected",
        connecting: "Connecting",
        disconnected: "Disconnected",
        failed: "Failed",
        timeout: "Timed out"
      }
    },
    terminal: {
      title: "Terminal preview",
      tabLabel: "Terminal",
      mockBadge: "Preview session",
      newTab: "New terminal tab",
      closeTab: "Close terminal tab",
      connected: (hostName: string) => `Selected ${hostName}`,
      ready: "Real SSH connections will be wired in a later stage.",
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
      maximize: "Maximize"
    },
    tools: {
      title: "Tool area",
      eyebrow: "Session tools",
      collapsePanel: "Collapse tool panel",
      expandPanel: "Expand tool panel",
      files: {
        toolbar: "File toolbar",
        list: "Remote files",
        upload: "Upload",
        download: "Download",
        moreDisabled: "Available after selecting a file",
        name: "Name",
        size: "Size",
        modified: "Modified",
        queue: "Transfer queue",
        queueCount: (count: number) => `${count} tasks`
      },
      forwards: {
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
        uptime: "Uptime",
        refresh: "Collect",
        refreshing: "Refreshing every 3s",
        partialError: "Disk inode collection is unavailable"
      },
      processes: {
        title: "Process list",
        searchPlaceholder: "Search PID, user, or command",
        command: "Command",
        kill: "Kill process",
        loaded: (count: number) => `${count} processes loaded`
      },
      commands: {
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
