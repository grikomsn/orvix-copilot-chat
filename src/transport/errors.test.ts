import assert from "node:assert/strict";
import test from "node:test";
import { apiError } from "./errors";

test("extracts bounded provider errors without echoing response headers", async () => {
  const error = await apiError(
    "Request failed",
    new Response(JSON.stringify({ error: { message: "bad model" } }), {
      status: 400,
      headers: { authorization: "secret" },
    }),
  );
  assert.equal(error.message, "Request failed (HTTP 400): bad model");
  assert.equal(error.message.includes("secret"), false);
});
