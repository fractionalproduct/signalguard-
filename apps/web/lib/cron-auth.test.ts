import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthorizedCronRequest } from "./cron-auth";

test("allows requests whose Bearer matches CRON_SECRET exactly", () => {
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: "Bearer s3cret",
      expectedSecret: "s3cret",
    }),
    true,
  );
});

test("rejects when CRON_SECRET is not set (fail closed)", () => {
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: "Bearer anything",
      expectedSecret: undefined,
    }),
    false,
  );
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: "Bearer anything",
      expectedSecret: "",
    }),
    false,
  );
});

test("rejects missing Authorization header", () => {
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: null,
      expectedSecret: "s3cret",
    }),
    false,
  );
});

test("rejects wrong scheme even with right token", () => {
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: "Basic s3cret",
      expectedSecret: "s3cret",
    }),
    false,
  );
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: "s3cret",
      expectedSecret: "s3cret",
    }),
    false,
  );
});

test("rejects partial / prefix matches", () => {
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: "Bearer s3cretwithextra",
      expectedSecret: "s3cret",
    }),
    false,
  );
  assert.equal(
    isAuthorizedCronRequest({
      authHeader: "Bearer s3cre",
      expectedSecret: "s3cret",
    }),
    false,
  );
});
