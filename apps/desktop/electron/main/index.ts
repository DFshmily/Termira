import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { SidecarManager } from "./sidecar";

const sidecar = new SidecarManager();

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

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
