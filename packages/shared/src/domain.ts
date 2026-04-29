export type HostProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  groupId?: string;
  groupName?: string;
  tags: string[];
  note?: string;
  auth: AuthConfig;
  defaultRemotePath?: string;
  favorite: boolean;
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

export type HostGroup = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ForwardRule = {
  id: string;
  profileId: string;
  name: string;
  type: "local" | "remote" | "dynamic";
  bindHost: string;
  bindPort: number;
  targetHost?: string;
  targetPort?: number;
  createdAt: string;
  updatedAt: string;
};

export type QuickCommand = {
  id: string;
  profileId?: string;
  groupName?: string;
  name: string;
  command: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type VaultStatus = {
  initialized: boolean;
  locked: boolean;
  mode?: "local-key" | "master-password";
  schemaVersion: number;
  credentialCount: number;
  kdfName?: string;
  cipherName?: string;
  vaultPath?: string;
};

export type CredentialMetadata = {
  credentialId: string;
  type: "password" | "privateKey" | "keyboardInteractive";
  createdAt: string;
  updatedAt: string;
};
