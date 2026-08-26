import { queueDeferredMutation } from "./offline-deferred";
import type { Merchant } from "./types";
import type { OfflineScope } from "./offline-db";

export async function queueMerchantUpdate(
  scope: OfflineScope,
  merchant: Merchant,
  body: Record<string, unknown>,
) {
  return queueDeferredMutation(
    scope,
    {
      entityType: "MERCHANT",
      entityId: merchant.id,
      operationType: "UPDATE",
      request: { path: "/merchant", method: "PATCH", body },
    },
    { ...merchant, ...body },
  );
}
