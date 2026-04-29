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
      backend: "后端",
      activity: "活动",
      settings: "设置"
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
      favorites: "收藏",
      allHosts: "全部主机",
      empty: "没有匹配的主机",
      detailsEyebrow: "连接信息",
      address: "地址",
      group: "分组",
      port: "端口",
      identity: "密钥",
      sessionEyebrow: "会话",
      sessionTitle: "准备连接",
      lastConnected: "最近连接",
      auth: "认证",
      keyAuth: "密钥认证"
    },
    terminal: {
      title: "终端预览",
      mockBadge: "静态终端壳",
      connected: (hostName: string) => `已选择 ${hostName}`,
      ready: "连接能力将在后续阶段接入真实 SSH。",
      placeholder: "Termira 工作台已就绪。"
    },
    status: {
      online: "在线",
      starting: "启动中",
      error: "错误",
      offline: "离线"
    },
    backend: {
      eyebrow: "Java 后端进程",
      online: "后端在线",
      offline: "后端离线",
      process: "进程",
      notRunning: "未运行",
      version: "版本",
      protocolPending: "协议待就绪",
      versionText: (protocolVersion: string, backendVersion: string) =>
        `协议 ${protocolVersion} / 后端 ${backendVersion}`,
      lastPing: "最近 Ping",
      noPing: "尚未 Ping",
      logs: "日志",
      pending: "待就绪"
    },
    actions: {
      ping: "Ping",
      pinging: "Ping 中",
      restart: "重启",
      restarting: "重启中",
      stop: "停止",
      stopping: "停止中"
    },
    timeline: {
      eyebrow: "IPC 时间线",
      title: "运行事件",
      waiting: "等待中",
      empty: "暂无事件",
      received: "已接收",
      accepted: "已接受",
      starting: "启动中",
      backendVersion: (version: string) => `后端 ${version}`
    },
    settings: {
      sidebarTitle: "设置",
      preferences: "偏好设置",
      runtime: "运行状态",
      eyebrow: "偏好设置",
      title: "语言",
      description: "Termira 默认使用中文界面，同时保留英文界面用于后续国际化。",
      currentLanguage: "当前语言"
    },
    errors: {
      unhandledBackendState: (state: never) => `未处理的后端状态: ${state}`
    }
  },
  "en-US": {
    navigation: {
      workspace: "Termira workspace navigation",
      hosts: "Hosts",
      backend: "Backend",
      activity: "Activity",
      settings: "Settings"
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
      favorites: "Favorites",
      allHosts: "All hosts",
      empty: "No matching hosts",
      detailsEyebrow: "Connection",
      address: "Address",
      group: "Group",
      port: "Port",
      identity: "Identity",
      sessionEyebrow: "Session",
      sessionTitle: "Ready to connect",
      lastConnected: "Last connected",
      auth: "Auth",
      keyAuth: "Key auth"
    },
    terminal: {
      title: "Terminal preview",
      mockBadge: "Static shell",
      connected: (hostName: string) => `Selected ${hostName}`,
      ready: "Real SSH connections will be wired in a later stage.",
      placeholder: "Termira workspace is ready."
    },
    status: {
      online: "Online",
      starting: "Starting",
      error: "Error",
      offline: "Offline"
    },
    backend: {
      eyebrow: "Java sidecar",
      online: "Backend online",
      offline: "Backend offline",
      process: "Process",
      notRunning: "Not running",
      version: "Version",
      protocolPending: "Protocol pending",
      versionText: (protocolVersion: string, backendVersion: string) =>
        `Protocol ${protocolVersion} / Backend ${backendVersion}`,
      lastPing: "Last ping",
      noPing: "No ping yet",
      logs: "Logs",
      pending: "Pending"
    },
    actions: {
      ping: "Ping",
      pinging: "Pinging",
      restart: "Restart",
      restarting: "Restarting",
      stop: "Stop",
      stopping: "Stopping"
    },
    timeline: {
      eyebrow: "IPC timeline",
      title: "Runtime events",
      waiting: "Waiting",
      empty: "No events yet",
      received: "received",
      accepted: "accepted",
      starting: "starting",
      backendVersion: (version: string) => `backend ${version}`
    },
    settings: {
      sidebarTitle: "Settings",
      preferences: "Preferences",
      runtime: "Runtime",
      eyebrow: "Preferences",
      title: "Language",
      description: "Termira uses Chinese by default while keeping English available for future localization.",
      currentLanguage: "Current language"
    },
    errors: {
      unhandledBackendState: (state: never) => `Unhandled backend state: ${state}`
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
