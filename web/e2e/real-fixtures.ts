import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

// Real photo sets (ADR-0008): the repo set under api/tests/fixtures/real, freely licensed,
// and a larger local one at BISS_REAL_FIXTURES outside the repo. compose.test.yaml mounts
// both into the web container and sets the two variables to the container paths. Next to
// each photo lies its ground truth `<name>.yaml`. Photos are only read as data.

export const IMAGE = /\.(jpe?g|png|webp)$/i;

/** The two sets; a set without a root (variable unset) is skipped. */
export const realSets = () => [
  { name: "repo", root: process.env.BISS_REPO_FIXTURES ?? join(process.cwd(), "../api/tests/fixtures/real") },
  { name: "local", root: process.env.BISS_REAL_FIXTURES },
];

/** Flat `key: "value"` lines with `#` comments, the whole YAML the ground truth uses. */
export function parseTruth(text: string, file: string) {
  const truth: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(#.*)?$/.test(line)) return;
    const match = line.match(/^([A-Za-z0-9_]+):\s*"((?:[^"\\]|\\.)*)"\s*(#.*)?$/);
    if (!match) throw new Error(`${file}:${i + 1}: expected key: "value"`);
    truth[match[1]] = match[2].replace(/\\(.)/g, "$1");
  });
  return truth;
}

export type RealPhoto = { file: string; path: string; truth: Record<string, string> };

/**
 * The photos of one kind (barcodes, labels, plates) in a set, each with its ground truth.
 * `problems` lists photos without YAML, YAML without photo and unreadable YAML: each one
 * fails the test instead of being skipped. `empty` means no set at `dir`.
 */
export function photoSet(root: string | undefined, kind: "barcodes" | "labels" | "plates") {
  const dir = root ? join(root, kind) : `$BISS_REAL_FIXTURES/${kind} (unset)`;
  const files = root && existsSync(dir) ? readdirSync(dir).filter((f) => IMAGE.test(f) || f.endsWith(".yaml")) : [];
  const photos: RealPhoto[] = [];
  const problems: string[] = [];
  const base = (file: string) => file.slice(0, -extname(file).length);
  const images = files.filter((f) => IMAGE.test(f));
  const yamls = new Set(files.filter((f) => f.endsWith(".yaml")).map(base));
  for (const file of images) {
    const name = base(file);
    if (images.filter((f) => base(f) === name).length > 1) problems.push(`${file}: several photos named ${name}`);
    else if (!yamls.delete(name)) problems.push(`${file}: no ${name}.yaml`);
    else {
      try {
        photos.push({ file, path: join(dir, file), truth: parseTruth(readFileSync(join(dir, `${name}.yaml`), "utf8"), `${name}.yaml`) });
      } catch (error) {
        problems.push((error as Error).message);
      }
    }
  }
  for (const name of yamls) if (!images.some((f) => base(f) === name)) problems.push(`${name}.yaml: no photo`);
  return { dir, photos, problems, empty: files.length === 0 };
}
