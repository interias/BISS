// Stand-in for Open Food Facts API v2 in the e2e stack (compose.test.yaml): the tests never
// reach the real service. The products are invented (prefix 2, internal numbers; one real
// GTIN of a repo photo with invented values, ADR-0008); no data from Open Food Facts belongs
// in the repo (ADR-0002).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 8080;
const products = JSON.parse(readFileSync(new URL("./products.json", import.meta.url), "utf8"));

createServer((request, response) => {
  const code = new URL(request.url, "http://off-stub").pathname.match(/^\/api\/v2\/product\/(\d+)$/)?.[1];
  const product = code && products[code];
  // Like the real API: an unknown product is 200 with status 0.
  const body = product ? { code, status: 1, product } : { status: 0, status_verbose: "product not found" };
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`off-stub on ${PORT}`));
