import test from "node:test";
import assert from "node:assert/strict";
import { fileIdentity, uniqueFiles } from "../lib/fileIdentity.ts";

test("gallery and WhatsApp aliases are one physical file", () => {
  const a = {
    id: "gallery",
    uri: "file:///storage/emulated/0/My%20Photos/a.jpg",
  };
  const b = { id: "whatsapp", path: "/storage/emulated/0/My Photos/a.jpg" };
  assert.equal(fileIdentity(a), fileIdentity(b));
  assert.equal(uniqueFiles([a, b]).length, 1);
});
test("different paths remain separate even when names match", () => {
  assert.equal(
    uniqueFiles([
      { id: "a", path: "/DCIM/a.jpg" },
      { id: "b", path: "/Download/a.jpg" },
    ]).length,
    2,
  );
  assert.equal(fileIdentity({ id: "no-path" }), "no-path");
});
