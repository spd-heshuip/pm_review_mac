import { describe, expect, it } from "vitest";
import { validateSubmission } from "./input.js";

const empty = { requirementId: "", tapdUrl: "", notes: "" };

describe("validateSubmission", () => {
  it("accepts a requirement id alone", () => {
    expect(() => validateSubmission({ ...empty, requirementId: "112233" }, [])).not.toThrow();
  });

  it("rejects an empty form", () => {
    expect(() => validateSubmission(empty, [])).toThrow(/至少填写一项/);
  });

  it("rejects more than five images and unsupported types", () => {
    const image = { dataBase64: "aa", mimeType: "image/png", byteLength: 10 };
    expect(() => validateSubmission({ ...empty, requirementId: "1" }, Array(6).fill(image))).toThrow(/5/);
    expect(() =>
      validateSubmission({ ...empty, requirementId: "1" }, [{ ...image, mimeType: "image/svg+xml" }]),
    ).toThrow(/png/);
    expect(() =>
      validateSubmission({ ...empty, requirementId: "1" }, [{ ...image, byteLength: 15 * 1024 * 1024 + 1 }]),
    ).toThrow(/15/);
  });
});
