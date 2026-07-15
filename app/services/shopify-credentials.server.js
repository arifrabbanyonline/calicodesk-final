/**
 * Reads Shopify Admin API credentials from the installed app's OAuth session.
 * Merchants do not need to copy tokens from the Shopify admin — the app already
 * has them after install.
 */

import prisma from "../db.server";
import { apiVersion, sessionStorage } from "../shopify.server";

export async function getShopifyCredentials(shop) {
  const offlineId = `offline_${shop}`;
  const fromStorage = await sessionStorage.loadSession(offlineId);

  if (fromStorage?.accessToken) {
    return {
      storeHostname: shop,
      accessToken: fromStorage.accessToken,
      apiVersion,
    };
  }

  const row = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });

  if (!row?.accessToken) {
    return null;
  }

  return {
    storeHostname: shop,
    accessToken: row.accessToken,
    apiVersion,
  };
}
