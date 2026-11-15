import { expect, test } from "vitest";
import { transcript } from "./dictation";

const event = (resultIndex: number, ...parts: [string, boolean][]) => ({
  resultIndex,
  results: parts.map(([text, isFinal]) => ({ isFinal, 0: { transcript: text } })),
});

test("final parts add up, the part still heard is replaced, blanks are joined", () => {
  const heard = transcript();
  expect(heard.hear(event(0, ["zwei Scheiben Brot", true], ["mit Kä", false]))).toBe("zwei Scheiben Brot mit Kä");
  // Only the results from resultIndex on are new; the first one stays as it was.
  expect(heard.hear(event(1, ["zwei Scheiben Brot", true], ["mit Käse  und Kaffee", true]))).toBe(
    "zwei Scheiben Brot mit Käse und Kaffee",
  );
  expect(heard.sentence()).toBe("zwei Scheiben Brot mit Käse und Kaffee");
});
