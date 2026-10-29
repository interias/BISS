// Stand-in for Open Food Facts API v2 and its text search in the e2e stack (compose.test.yaml): the tests never
// reach the real service. The products are invented (prefix 2, internal numbers; one real
// GTIN of a repo photo with invented values, ADR-0008); no data from Open Food Facts belongs
// in the repo (ADR-0002).
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 8080;
const products = JSON.parse(readFileSync(new URL("./products.json", import.meta.url), "utf8"));

/**
 * Search-a-licious text search (ADR-0011): products whose name or brand holds every word of
 * the query; the country filter the API adds is ignored. Brands come as a list, as there.
 */
function search(query) {
  const words = query.replace(/countries_tags:"[^"]*"/, "").toLowerCase().split(/\s+/).filter(Boolean);
  const hits = Object.entries(products)
    .filter(([, p]) => words.length && words.every((w) => `${p.product_name} ${p.brands}`.toLowerCase().includes(w)))
    .map(([code, p]) => ({ ...p, code, brands: p.brands.split(",").map((b) => b.trim()) }));
  return { hits, count: hits.length, page: 1, page_size: 20 };
}

createServer((request, response) => {
  const url = new URL(request.url, "http://off-stub");
  response.writeHead(200, { "Content-Type": "application/json" });
  if (url.pathname === "/search") {
    response.end(JSON.stringify(search(url.searchParams.get("q") ?? "")));
    return;
  }
  const code = url.pathname.match(/^\/api\/v2\/product\/(\d+)$/)?.[1];
  const product = code && products[code];
  // Like the real API: an unknown product is 200 with status 0.
  const body = product ? { code, status: 1, product } : { status: 0, status_verbose: "product not found" };
  response.end(JSON.stringify(body));
}).listen(PORT, () => console.log(`off-stub on ${PORT}`));
