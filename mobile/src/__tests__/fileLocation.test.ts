import test from "node:test";
import assert from "node:assert/strict";
import { containingFolder } from "../lib/fileLocation.ts";
test("location preserves real folder paths and decodes file URIs", () => {
  assert.equal(
    containingFolder("/storage/emulated/0/DCIM/Camera/a.jpg"),
    "/storage/emulated/0/DCIM/Camera",
  );
  assert.equal(
    containingFolder("file:///storage/1234-5678/My%20Photos/a.jpg"),
    "/storage/1234-5678/My Photos",
  );
  assert.equal(containingFolder("/a.jpg"), "/");
});
test("content IDs and unavailable paths are never presented as folders", () => {
  assert.equal(
    containingFolder("content://media/external/images/media/123"),
    null,
  );
  assert.equal(containingFolder(null), null);
  assert.equal(containingFolder("file:///bad%path/a"), null);
});
