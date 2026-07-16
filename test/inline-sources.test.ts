import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectSources } from "../scripts/inline-sources";

const root = mkdtempSync(join(tmpdir(), "motif-inline-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("collectSources", () => {
  test("reads demo.js + index.html raw bytes keyed by demo id", () => {
    const moduleText = "import { Scene } from '@vectojs/core';\n// x\n";
    const htmlText = "<!doctype html>\n<canvas id=c></canvas>\n";
    const dir = join(root, "x");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "demo.js"), moduleText);
    writeFileSync(join(dir, "index.html"), htmlText);

    const map = collectSources(root);
    expect(map.x).toEqual({
      moduleSource: moduleText,
      htmlSource: htmlText,
    });
  });

  test("ignores directories missing either file", () => {
    const dir = join(root, "incomplete");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "demo.js"), "x");
    const map = collectSources(root);
    expect(map.incomplete).toBeUndefined();
  });
});
