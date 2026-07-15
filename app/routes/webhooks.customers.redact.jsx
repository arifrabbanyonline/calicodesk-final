import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR/compliance webhook: customers/redact.
 *
 * The app stores no store-customer personal data, so there is nothing to
 * redact. We validate the webhook and acknowledge it.
 */
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  return new Response();
};
