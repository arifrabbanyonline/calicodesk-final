import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR/compliance webhook: customers/data_request.
 *
 * CalicoDesk for Shopify stores no store-customer personal data — it only keeps
 * the merchant's own CalicoDesk connection (developer token + workspace list).
 * There is therefore nothing to return for a data request; we validate the
 * webhook and acknowledge it. Any customer chat data lives in the merchant's
 * CalicoDesk account and is handled there.
 */
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
