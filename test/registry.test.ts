import { describe, expect, test } from "bun:test";
import { DEMOS, CATEGORIES } from "../src/registry";

const VALID = new Set<string>(CATEGORIES.map((c) => c.category));

describe("DEMOS registry", () => {
  test("is non-empty", () => {
    expect(DEMOS.length).toBeGreaterThan(0);
  });

  test("every id is unique", () => {
    const ids = DEMOS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every entry is well-formed", () => {
    for (const d of DEMOS) {
      expect(d.id.length).toBeGreaterThan(0);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(VALID.has(d.category)).toBe(true);
      expect(Array.isArray(d.tags)).toBe(true);
      expect(d.packages.length).toBeGreaterThan(0);
    }
  });
});
