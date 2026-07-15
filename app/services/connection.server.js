/**
 * Per-shop CalicoDesk connection store.
 *
 * This is the Shopify equivalent of the WordPress plugin's use of the options
 * table (calicodesk_developer_token, calicodesk_workspaces, etc.). Instead of a
 * single site there is one row per shop in the CalicoDeskConnection table.
 *
 * It also owns the bridge to the storefront: when a workspace is enabled we
 * write the active subdomain to an app-owned metafield on the app installation
 * (namespace "calicodesk", key "subdomain"). The theme app extension reads it in
 * Liquid via `app.metafields.calicodesk.subdomain`. App-owned metafields require
 * no access scopes because the app owns the data.
 */

import prisma from "../db.server";
import { fetchWorkspaces, mergeWorkspaces } from "./calicodesk.server";

export const APP_METAFIELD_NAMESPACE = "calicodesk";
export const APP_METAFIELD_KEY = "subdomain";

function parseWorkspaces(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toConnection(row) {
  return {
    shop: row.shop,
    email: row.email,
    developerToken: row.developerToken,
    workspaces: parseWorkspaces(row.workspaces),
    activeWorkspaceId: row.activeWorkspaceId,
    activeSubdomain: row.activeSubdomain,
    shopifySyncedAt: row.shopifySyncedAt,
  };
}

export async function getConnection(shop) {
  const row = await prisma.calicoDeskConnection.findUnique({ where: { shop } });
  return row ? toConnection(row) : null;
}

export async function isConnected(shop) {
  const row = await prisma.calicoDeskConnection.findUnique({ where: { shop } });
  return row !== null;
}

/** Store (or update) the connection after a successful sign-in. */
export async function saveConnection(shop, data) {
  const existing = await getConnection(shop);
  const merged = mergeWorkspaces(existing?.workspaces ?? [], data.workspaces);

  let activeWorkspaceId = existing?.activeWorkspaceId ?? null;
  let activeSubdomain = existing?.activeSubdomain ?? null;

  if (
    activeWorkspaceId &&
    !merged.some((w) => String(w.id) === activeWorkspaceId)
  ) {
    activeWorkspaceId = null;
    activeSubdomain = null;
  }

  const row = await prisma.calicoDeskConnection.upsert({
    where: { shop },
    create: {
      shop,
      email: data.email || null,
      developerToken: data.developerToken,
      workspaces: JSON.stringify(merged),
      activeWorkspaceId,
      activeSubdomain,
    },
    update: {
      email: data.email || null,
      developerToken: data.developerToken,
      workspaces: JSON.stringify(merged),
      activeWorkspaceId,
      activeSubdomain,
    },
  });

  return toConnection(row);
}

/** Re-fetch workspaces from CalicoDesk and persist the merged list. */
export async function syncWorkspaces(shop) {
  const connection = await getConnection(shop);
  if (!connection) {
    throw new Error("CalicoDesk is not connected. Please sign in first.");
  }

  const fetched = await fetchWorkspaces(connection.developerToken);
  const merged = mergeWorkspaces(connection.workspaces, fetched);

  let activeWorkspaceId = connection.activeWorkspaceId;
  let activeSubdomain = connection.activeSubdomain;

  if (
    activeWorkspaceId &&
    !merged.some((w) => String(w.id) === activeWorkspaceId)
  ) {
    activeWorkspaceId = null;
    activeSubdomain = null;
  }

  const row = await prisma.calicoDeskConnection.update({
    where: { shop },
    data: {
      workspaces: JSON.stringify(merged),
      activeWorkspaceId,
      activeSubdomain,
    },
  });

  return toConnection(row);
}

export async function disconnect(shop) {
  await prisma.calicoDeskConnection.deleteMany({ where: { shop } });
}

/**
 * Mark a workspace active. Returns the resolved subdomain (may be empty if the
 * workspace has no live chat subdomain yet).
 */
export async function setActiveWorkspace(shop, workspaceId) {
  const connection = await getConnection(shop);
  if (!connection) {
    throw new Error("CalicoDesk is not connected. Please sign in first.");
  }

  const workspace = connection.workspaces.find(
    (w) => String(w.id) === String(workspaceId),
  );
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const subdomain = workspace.subdomain || "";

  const row = await prisma.calicoDeskConnection.update({
    where: { shop },
    data: {
      activeWorkspaceId: String(workspaceId),
      activeSubdomain: subdomain || null,
    },
  });

  return { connection: toConnection(row), subdomain };
}

export async function clearActiveWorkspace(shop) {
  await prisma.calicoDeskConnection
    .update({
      where: { shop },
      data: { activeWorkspaceId: null, activeSubdomain: null },
    })
    .catch(() => {
      // No connection row — nothing to clear.
    });
}

// ---------------------------------------------------------------------------
// Storefront bridge: app-owned metafield on the app installation.
// ---------------------------------------------------------------------------

async function getAppInstallationId(admin) {
  const response = await admin.graphql(
    `#graphql
      query CalicoDeskAppInstallation {
        currentAppInstallation { id }
      }`,
  );
  const body = await response.json();
  const id = body?.data?.currentAppInstallation?.id;
  if (!id) {
    throw new Error("Could not resolve the app installation id.");
  }
  return id;
}

/** Publish the active subdomain so the theme app embed can render the widget. */
export async function writeSubdomainMetafield(admin, subdomain) {
  const ownerId = await getAppInstallationId(admin);

  await admin.graphql(
    `#graphql
      mutation CalicoDeskSetSubdomain($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message code }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: APP_METAFIELD_NAMESPACE,
            key: APP_METAFIELD_KEY,
            type: "single_line_text_field",
            value: subdomain,
          },
        ],
      },
    },
  );
}

/** Remove the subdomain metafield so the widget stops loading. */
export async function clearSubdomainMetafield(admin) {
  const ownerId = await getAppInstallationId(admin);

  await admin.graphql(
    `#graphql
      mutation CalicoDeskDeleteSubdomain(
        $metafields: [MetafieldIdentifierInput!]!
      ) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields { key namespace ownerId }
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: APP_METAFIELD_NAMESPACE,
            key: APP_METAFIELD_KEY,
          },
        ],
      },
    },
  );
}
