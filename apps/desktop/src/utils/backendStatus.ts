import type { BackendState } from "@termira/shared";
import { DEFAULT_LANGUAGE, getMessages, type AppLanguage } from "../i18n/messages";

export function formatBackendState(
  state: BackendState,
  language: AppLanguage = DEFAULT_LANGUAGE
): string {
  const text = getMessages(language);

  switch (state) {
    case "online":
      return text.status.online;
    case "starting":
      return text.status.starting;
    case "error":
      return text.status.error;
    case "offline":
      return text.status.offline;
    default:
      return assertNever(state, language);
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

function assertNever(value: never, language: AppLanguage = DEFAULT_LANGUAGE): never {
  throw new Error(getMessages(language).errors.unhandledBackendState(value));
}
