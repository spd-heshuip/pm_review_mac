import { describe, expect, it } from "vitest";
import { cloudCreateOptions } from "./cloudOptions.js";

describe("cloudCreateOptions", () => {
  it("locks the repo, branch, agent mode, and leaves MCP unset", () => {
    const options = cloudCreateOptions("cursor_test");
    expect(options).toEqual({
      apiKey: "cursor_test",
      model: { id: "composer-2.5" },
      mode: "agent",
      cloud: {
        repos: [{ url: "https://github.com/gzxy/lespark_android", startingRef: "hsp/v9758_new_ai_subtitle_all" }],
        autoCreatePR: false,
      },
    });
    expect(options).not.toHaveProperty("mcpServers");
    expect(options).not.toHaveProperty("local");
  });
});
