import type { BackendState } from "@termira/shared";

export function formatBackendState(state: BackendState): string {
  switch (state) {
    case "online":
      return "Online";
    case "starting":
      return "Starting";
    case "error":
      return "Error";
    case "offline":
      return "Offline";
    default:
      return assertNever(state);
  }
}

export function getBackendStateTone(state: BackendState): "good" | "warn" | "bad" | "muted" {
  switch (state) {
    case "online":
      return "good";
    case "starting":
      return "warn";
    case "error":
      return "bad";
    case "offline":
      return "muted";
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled backend state: ${value}`);
}
