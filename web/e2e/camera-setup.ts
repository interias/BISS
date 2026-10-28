import { tmpdir } from "node:os";
import { join } from "node:path";

/** The video the fake camera shows; written by global-setup.ts. */
export const FAKE_VIDEO = join(tmpdir(), "biss-fake-camera.y4m");

/** In the OFF stub (off-stub/products.json): a hit. */
export const HIT_CODE = "2000000013015";
/** Unknown to the stub: a miss. Both are invented, prefix 2 (internal numbers). */
export const MISS_CODE = "2000000013022";
