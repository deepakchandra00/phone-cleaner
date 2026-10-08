import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root));
const brand = JSON.parse(read("branding.json").toString());
const app = JSON.parse(read("app.json").toString()).expo;
test("production metadata and every locale use the canonical name and truthful description", () => {
  assert.equal(app.name, brand.name);
  for (const locale of ["en-US", "es-419", "pt-BR", "de-DE", "ja-JP"])
    assert.equal(
      read(`store-metadata/${locale}/title.txt`).toString().trim(),
      brand.name,
    );
  assert.doesNotMatch(app.description, /\bAI\b|boost|system data cleaner/i);
  assert.equal(app.android.adaptiveIcon.backgroundColor, brand.iconBackground);
  assert.equal(
    app.android.adaptiveIcon.backgroundImage,
    "./src/assets/adaptive-background.png",
  );
});
test("runtime icons exactly match the exported launcher layers and logo", () => {
  for (const [runtime, store] of [
    ["icon.png", "launcher.png"],
    ["adaptive-icon.png", "adaptive-foreground.png"],
    ["adaptive-background.png", "adaptive-background.png"],
    ["logo.png", "logo.png"],
  ])
    assert.deepEqual(
      read(`src/assets/${runtime}`),
      read(`store-metadata/assets/brand/${store}`),
    );
});
test("store icon and feature graphic meet size, PNG and alpha specifications", () => {
  for (const [name, w, h, colour] of [
    ["play-icon.png", 512, 512, 6],
    ["feature-graphic.png", 1024, 500, 2],
  ] as const) {
    const data = read(`store-metadata/assets/${name}`);
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.equal(data.readUInt32BE(16), w);
    assert.equal(data.readUInt32BE(20), h);
    assert.equal(data[24], 8);
    assert.equal(data[25], colour);
    if (name === "play-icon.png") assert.ok(data.length < 1024 * 1024);
  }
});
test("both theme sources match and normal text/button labels exceed 4.5:1 contrast", () => {
  const css = read("global.css").toString();
  assert.equal(css, read("src/global.css").toString());
  function luminance(rgb: number[]) {
    return rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  for (const block of css.split(/\.(?:dark)\s*\{/)) {
    const token = (name: string) => {
      const found = block.match(
        new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+)`),
      );
      assert.ok(found);
      return luminance(found.slice(1).map(Number));
    };
    for (const [fg, bg] of [
      ["foreground", "background"],
      ["muted-foreground", "background"],
      ["primary-foreground", "primary"],
      ["success-foreground", "success"],
      ["destructive-foreground", "destructive"],
    ]) {
      const a = token(fg),
        b = token(bg);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${fg} / ${bg}`,
      );
    }
  }
});
