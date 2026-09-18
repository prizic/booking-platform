import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function header(headers, name) {
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function signatureMatches({ secret, rawBody, signature }) {
  if (typeof signature !== "string" || !signature.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(signature.slice("sha256=".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function createGitHubWebhookIngress({ secret, store, enqueueReconciliation = async () => {} }) {
  return {
    async handle({ headers, rawBody }) {
      const deliveryId = header(headers, "x-github-delivery");
      const eventName = header(headers, "x-github-event");
      if (!signatureMatches({ secret, rawBody, signature: header(headers, "x-hub-signature-256") })) return { status: 401, code: "github_signature_invalid" };
      if (typeof deliveryId !== "string" || typeof eventName !== "string") return { status: 400, code: "github_delivery_invalid" };
      let payload;
      try { payload = JSON.parse(rawBody.toString("utf8")); } catch { return { status: 400, code: "github_payload_invalid" }; }
      const record = {
        deliveryId,
        payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
        eventName,
        repositoryExternalId: typeof payload?.repository?.node_id === "string" ? payload.repository.node_id : null,
        action: typeof payload?.action === "string" ? payload.action : null,
      };
      const result = await store.record(record);
      if (!result.duplicate) await enqueueReconciliation(record);
      return { status: 202, code: result.duplicate ? "github_delivery_duplicate" : "github_delivery_accepted" };
    },
  };
}
