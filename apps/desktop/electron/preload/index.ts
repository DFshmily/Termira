import { contextBridge, ipcRenderer } from "electron";

type EventHandler = (payload: unknown, event: string) => void;

const listeners = new Map<string, Set<EventHandler>>();

ipcRenderer.on(
  "termira:event",
  (_electronEvent, message: { event?: string; payload?: unknown }) => {
    if (typeof message?.event !== "string") {
      return;
    }

    for (const handler of listeners.get(message.event) ?? []) {
      handler(message.payload, message.event);
    }

    for (const handler of listeners.get("*") ?? []) {
      handler(message.payload, message.event);
    }
  }
);

contextBridge.exposeInMainWorld("termira", {
  invoke(method: string, params?: unknown) {
    return ipcRenderer.invoke("termira:invoke", { method, params });
  },
  on(event: string, handler: EventHandler) {
    const eventListeners = listeners.get(event) ?? new Set<EventHandler>();
    eventListeners.add(handler);
    listeners.set(event, eventListeners);
  },
  off(event: string, handler: EventHandler) {
    const eventListeners = listeners.get(event);
    eventListeners?.delete(handler);
    if (eventListeners?.size === 0) {
      listeners.delete(event);
    }
  }
});
