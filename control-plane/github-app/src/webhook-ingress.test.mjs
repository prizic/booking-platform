import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createGitHubWebhookIngress } from "./webhook-ingress.mjs";

const secret = "test-webhook-secret";
const rawBody = Buffer.from(
  JSON.stringify({ action: "renamed", repository: { node_id: "R_kgDOrepo" } }),
);
const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

test("rejects an invalid signature before parsing an invalid body", async () => {
  const store = { record: async () => assert.fail("must not persist") };
  const ingress = createGitHubWebhookIngress({ secret, store });
  const response = await ingress.handle({
    headers: {
      "x-github-delivery": "delivery-00000001",
      "x-github-event": "repository",
      "x-hub-signature-256": "sha256=bad",
    },
    rawBody: Buffer.from("{invalid"),
  });
  assert.deepEqual(response, { status: 401, code: "github_signature_invalid" });
});

test("deduplicates a verified delivery and schedules reconciliation only once", async () => {
  const records = [];
  const reconciliation = [];
  const store = {
    record: async (delivery) => {
      records.push(delivery);
      return { duplicate: records.length > 1 };
    },
  };
  const ingress = createGitHubWebhookIngress({
    secret,
    store,
    enqueueReconciliation: async (delivery) => reconciliation.push(delivery),
  });
  const request = {
    headers: {
      "x-github-delivery": "delivery-00000001",
      "x-github-event": "repository",
      "x-hub-signature-256": signature,
    },
    rawBody,
  };
  assert.equal((await ingress.handle(request)).status, 202);
  assert.equal((await ingress.handle(request)).status, 202);
  assert.equal(reconciliation.length, 1);
  assert.deepEqual(records[0], {
    deliveryId: "delivery-00000001",
    payloadSha256: "42442ed88b2f651db91bcfd0187dc20f3f52f55fa7d8f96c42c0f1acc68a0c5b",
    eventName: "repository",
    repositoryExternalId: "R_kgDOrepo",
    action: "renamed",
  });
});
