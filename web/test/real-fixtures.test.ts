// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { parseTruth, photoSet } from "@/e2e/real-fixtures";

// The ground-truth reader of the real photo sets (ADR-0008); vitest leaves out e2e/**, so
// its tests live here (#25).

test("parseTruth reads flat quoted values with comments, UTF-8, # and escapes", () => {
  const text = [
    "# Values read off the photo",
    'code: "4012346278001"',
    "",
    'source: "https://example.org/File:a.jpg#frag"  # trailing comment',
    'author: "Donald Trung Quoc Don (Chữ Hán: 徵國單)"',
    'note: "a \\"quoted\\" word"\r',
  ].join("\n");
  expect(parseTruth(text, "a.yaml")).toEqual({
    code: "4012346278001",
    source: "https://example.org/File:a.jpg#frag",
    author: "Donald Trung Quoc Don (Chữ Hán: 徵國單)",
    note: 'a "quoted" word',
  });
});

test.each([
  ["an unquoted value", "code: 4012346278001", "a.yaml:1"],
  ["a list", 'name: "x"\ncode:\n  - "1"', "a.yaml:2"],
  ["a byte order mark", '﻿code: "1"', "a.yaml:1"],
])("parseTruth rejects %s with file and line", (_, text, where) => {
  expect(() => parseTruth(text, "a.yaml")).toThrow(where);
});

let roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

/** A set root with `labels/` holding the given files. */
function set(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "biss-real-"));
  roots.push(root);
  mkdirSync(join(root, "labels"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, "labels", name), text);
  return root;
}

test("photoSet pairs each photo with its YAML and reports every mismatch", () => {
  const root = set({
    "a.jpg": "",
    "a.yaml": 'energy_kcal: "445"',
    "b.png": "",
    "c.yaml": 'energy_kcal: "1"',
    "d.jpg": "",
    "d.webp": "",
    "d.yaml": 'energy_kcal: "2"',
    "e.jpeg": "",
    "e.yaml": "energy_kcal: 3",
    "notes.txt": "ignored",
  });
  const { photos, problems, empty } = photoSet(root, "labels");
  expect(empty).toBe(false);
  expect(photos).toEqual([{ file: "a.jpg", path: join(root, "labels", "a.jpg"), truth: { energy_kcal: "445" } }]);
  expect(problems.sort()).toEqual([
    "b.png: no b.yaml",
    "c.yaml: no photo",
    "d.jpg: several photos named d",
    "d.webp: several photos named d",
    'e.yaml:1: expected key: "value"',
  ]);
});

test("photoSet calls a missing, empty or unset set empty, so the test skips it", () => {
  expect(photoSet(set({}), "labels").empty).toBe(true);
  expect(photoSet(set({ "notes.txt": "" }), "labels").empty).toBe(true);
  expect(photoSet(set({}), "barcodes").empty).toBe(true);
  const unset = photoSet(undefined, "labels");
  expect(unset).toMatchObject({ empty: true, photos: [], problems: [] });
  expect(unset.dir).toContain("(unset)");
});
