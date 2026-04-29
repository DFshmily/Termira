import { describe, expect, it } from "vitest";
import { formatBackendState, getBackendStateTone } from "../utils/backendStatus";

describe("backend status formatting", () => {
  it("maps backend states to compact labels", () => {
    expect(formatBackendState("starting")).toBe("Starting");
    expect(formatBackendState("online")).toBe("Online");
    expect(formatBackendState("offline")).toBe("Offline");
    expect(formatBackendState("error")).toBe("Error");
  });

  it("maps backend states to visual tones", () => {
    expect(getBackendStateTone("online")).toBe("good");
    expect(getBackendStateTone("starting")).toBe("warn");
    expect(getBackendStateTone("offline")).toBe("muted");
    expect(getBackendStateTone("error")).toBe("bad");
  });
});
