import { describe, expect, it } from "vitest";

describe("Vitest TypeScript harness", () => {
  it("runs a TypeScript test", () => {
    const values: number[] = [1, 2, 3];

    expect(values.reduce((sum, value) => sum + value, 0)).toBe(6);
  });
});
