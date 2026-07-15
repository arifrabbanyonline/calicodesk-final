import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory GDPR/compliance webhook: shop/redact.
 *
 * Sent 48 hours after a store uninstalls the app. Remove everything we hold for
 * the shop: the CalicoDesk connection and any leftover sessions.
 */
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  await db.calicoDeskConnection.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });

  return new Response();
};
