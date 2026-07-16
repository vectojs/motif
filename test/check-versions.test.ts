import { test, expect } from "bun:test";
import {
  extractImportmapVersions,
  checkDemoVersions,
} from "../scripts/check-versions";

const deps = { "@vectojs/core": "1.9.2", "@vectojs/ui": "1.9.3" };

const matching = `<!doctype html><script type="importmap">
{ "imports": {
  "@vectojs/core": "https://esm.sh/@vectojs/core@1.9.2",
  "@vectojs/ui": "https://esm.sh/@vectojs/ui@1.9.3?bundle"
} }</script>`;

const drifted = `<script type="importmap">
{ "imports": { "@vectojs/core": "https://esm.sh/@vectojs/core@1.9.0" } }</script>`;

const pinsCoreOnly = `<script type="importmap">
{ "imports": { "@vectojs/core": "https://esm.sh/@vectojs/core@1.9.2" } }</script>`;

test("extractImportmapVersions pulls @vectojs pins from esm.sh URLs", () => {
  expect(extractImportmapVersions(matching)).toEqual({
    "@vectojs/core": "1.9.2",
    "@vectojs/ui": "1.9.3",
  });
});

test("matching importmap + packages passes clean", () => {
  expect(
    checkDemoVersions("d", matching, ["@vectojs/core", "@vectojs/ui"], deps),
  ).toEqual([]);
});

test("drifted version is reported", () => {
  const errs = checkDemoVersions("d", drifted, ["@vectojs/core"], deps);
  expect(errs.length).toBeGreaterThan(0);
  expect(errs.some((e) => e.includes("1.9.0"))).toBe(true);
});

test("packages listing a pkg the importmap does not pin is reported", () => {
  const errs = checkDemoVersions(
    "d",
    pinsCoreOnly,
    ["@vectojs/core", "@vectojs/ui"],
    deps,
  );
  expect(errs.some((e) => e.includes("@vectojs/ui"))).toBe(true);
});
