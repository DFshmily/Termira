import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { SidecarManager } from "./sidecar";

app.setName("Termira");

const sidecar = new SidecarManager();
const PREFERENCES_FILE_NAME = "preferences.json";

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

type PreferencesRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is PreferencesRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function preferencesPath(): string {
  return path.join(app.getPath("userData"), PREFERENCES_FILE_NAME);
}

function readPreferences(): PreferencesRecord {
  const filePath = preferencesPath();
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    console.warn("Failed to read Termira preferences:", error);
    return {};
  }
}

function writePreferences(preferences: PreferencesRecord): PreferencesRecord {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(preferencesPath(), `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  return preferences;
}

function mergePreferences(current: PreferencesRecord, patch: PreferencesRecord): PreferencesRecord {
  const next: PreferencesRecord = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const existing = next[key];
    next[key] = isPlainObject(existing) && isPlainObject(value) ? { ...existing, ...value } : value;
  }
  return next;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    title: "Termira",
    backgroundColor: "#101112",
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (!app.isPackaged) {
    void mainWindow.loadURL(process.env.TERMIRA_RENDERER_URL ?? "http://127.0.0.1:5173");
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

function broadcastToWindows(message: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("termira:event", message);
  }
}

ipcMain.handle("termira:invoke", async (_event, request: { method?: string; params?: unknown }) => {
  const method = request?.method;

  if (typeof method !== "string" || method.length === 0) {
    throw new Error("IPC method must be a non-empty string.");
  }

  if (method === "app.getPreferences") {
    return readPreferences();
  }

  if (method === "app.updatePreferences") {
    if (!isPlainObject(request.params)) {
      throw new Error("Preferences update must be an object.");
    }
    return writePreferences(mergePreferences(readPreferences(), request.params));
  }

  if (method === "app.getBackendStatus") {
    return sidecar.getStatus();
  }

  if (method === "app.restartBackend") {
    await sidecar.restart();
    return sidecar.getStatus();
  }

  return sidecar.invoke(method, request.params ?? {});
});

app.whenReady().then(async () => {
  sidecar.onEvent(broadcastToWindows);
  await sidecar.start();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", async (event) => {
  if (!isQuitting && sidecar.isRunning()) {
    event.preventDefault();
    isQuitting = true;
    await sidecar.stop();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
