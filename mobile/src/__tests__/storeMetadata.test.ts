import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const locale of ["en-US", "es-419", "pt-BR", "de-DE", "ja-JP"]) {
  test(`${locale} listing respects Play limits and removes unverified promotional claims`, () => {
    for (const [field, limit] of [
      ["title", 30],
      ["short_description", 80],
      ["full_description", 4000],
    ] as const) {
      const copy = readFileSync(
        new URL(`../../store-metadata/${locale}/${field}.txt`, import.meta.url),
        "utf8",
      ).trim();
      assert.ok(
        copy.length > 0 && [...copy].length <= limit,
        `${field} exceeds limit`,
      );
      assert.doesNotMatch(
        copy,
        /AI Storage Cleaner|Boost Mobile|System Data Cleaner|zero risk|under 25\s?MB|100% PRIVATE/i,
      );
    }
  });
}
