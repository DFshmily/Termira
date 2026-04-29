export type HostProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  groupId?: string;
  tags: string[];
  note?: string;
  auth: AuthConfig;
  defaultRemotePath?: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
};

export type AuthConfig = {
  type: "password" | "privateKey" | "keyboardInteractive";
  credentialRef?: string;
  privateKeyPath?: string;
  saveCredential: boolean;
};

export type Session = {
  id: string;
  profileId: string;
  status: "connecting" | "connected" | "disconnected" | "failed";
  openedAt: string;
  closedAt?: string;
  errorCode?: string;
};

export type TerminalChannel = {
  id: string;
  sessionId: string;
  cols: number;
  rows: number;
  status: "opening" | "open" | "closed" | "failed";
};
