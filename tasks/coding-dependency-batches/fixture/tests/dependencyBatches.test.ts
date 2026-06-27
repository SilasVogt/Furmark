import { describe, expect, it } from "vitest";
import { DependencyCycleError, dependencyBatches } from "../src/dependencyBatches";

describe("dependencyBatches", () => {
  it("batches a diamond graph", () => {
    expect(
      dependencyBatches({
        app: ["api", "ui"],
        api: ["core"],
        ui: ["core"],
        core: [],
      }),
    ).toEqual([["core"], ["api", "ui"], ["app"]]);
  });

  it("includes dependencies that are only referenced", () => {
    expect(dependencyBatches({ app: ["runtime"] })).toEqual([["runtime"], ["app"]]);
  });

  it("keeps disconnected nodes deterministic", () => {
    expect(dependencyBatches({ zebra: [], alpha: [], app: ["alpha"] })).toEqual([["alpha", "zebra"], ["app"]]);
  });

  it("throws cycle diagnostics", () => {
    expect(() => dependencyBatches({ a: ["b"], b: ["a"] })).toThrow(DependencyCycleError);
    try {
      dependencyBatches({ a: ["b"], b: ["a"] });
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyCycleError);
      expect((error as DependencyCycleError).cycle).toEqual(["a", "b"]);
    }
  });
});

