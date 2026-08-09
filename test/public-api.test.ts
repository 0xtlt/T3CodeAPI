import { describe, expect, it } from "vitest";

import { T3CodeError } from "../src/index.js";
import * as publicApi from "../src/index.js";

describe("public API", () => {
  it("exports only the stable runtime surface", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "T3CodeError",
      "connectT3Code",
      "createFileCredentialStore",
    ]);
  });

  it("preserves the public error constructor contract", () => {
    expect(
      new T3CodeError("REQUEST_FAILED", "Request failed.", 500),
    ).toMatchObject({
      code: "REQUEST_FAILED",
      message: "Request failed.",
      status: 500,
    });
  });
});
