import { describe, expect, it } from "vitest";
import { formatBackendState, getBackendStateTone } from "../utils/backendStatus";

describe("backend status formatting", () => {
  it("maps backend states to compact labels", () => {
    expect(formatBackendState("starting")).toBe("启动中");
    expect(formatBackendState("online")).toBe("在线");
    expect(formatBackendState("offline")).toBe("离线");
    expect(formatBackendState("error")).toBe("错误");
  });

  it("keeps English labels available", () => {
    expect(formatBackendState("starting", "en-US")).toBe("Starting");
    expect(formatBackendState("online", "en-US")).toBe("Online");
    expect(formatBackendState("offline", "en-US")).toBe("Offline");
    expect(formatBackendState("error", "en-US")).toBe("Error");
  });

  it("maps backend states to visual tones", () => {
    expect(getBackendStateTone("online")).toBe("good");
    expect(getBackendStateTone("starting")).toBe("warn");
    expect(getBackendStateTone("offline")).toBe("muted");
    expect(getBackendStateTone("error")).toBe("bad");
  });
});
