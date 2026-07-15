/**
 * CalicoDesk API client.
 *
 * This is a TypeScript port of the WordPress plugin's `CalicoDesk\Api` class
 * (includes/class-calicodesk-api.php). It talks to the CalicoDesk SaaS to:
 *   1. sign a merchant in (email + password -> developer token), and
 *   2. list the workspaces available to that account.
 *
 * The workspace-normalisation and subdomain-extraction helpers are kept
 * faithful to the PHP original so the same variety of API response shapes are
 * tolerated. The merchant's password is only ever forwarded to CalicoDesk over
 * HTTPS; it is never stored.
 */

const BASE_URL = (
  process.env.CALICODESK_API_BASE_URL || "https://calicodesk.com/api/v1"
).replace(/\/+$/, "");
const SIGNIN_PATH = process.env.CALICODESK_SIGNIN_PATH || "/wordpress/sign-in";
const WORKSPACES_PATH =
  process.env.CALICODESK_WORKSPACES_PATH || "/me/workspaces";



/** Error thrown for any CalicoDesk API failure. `message` is user-safe. */
export class CalicoDeskError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalicoDeskError";
  }
}


/**
 * Authenticate with CalicoDesk and return the developer token + workspaces.
 * Mirrors Api::sign_in().
 */
export async function signIn(
  email,
  password,
) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${SIGNIN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new CalicoDeskError(
      "Could not reach CalicoDesk. Please check your connection and try again.",
    );
  }

  const data = await readJson(response);

  if (!response.ok) {
    throw new CalicoDeskError(extractErrorMessage(data, response.status));
  }

  if (!isObject(data) && !Array.isArray(data)) {
    throw new CalicoDeskError(
      "Received an unexpected response from CalicoDesk.",
    );
  }

  const parsed = parseSignInResponse(data);

  if (!parsed.developerToken) {
    throw new CalicoDeskError(
      "Sign in succeeded but no developer token was returned.",
    );
  }

  return parsed;
}

/**
 * Fetch the workspaces available to a developer token.
 * Mirrors the network portion of Api::sync_workspaces().
 */
export async function fetchWorkspaces(token) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${WORKSPACES_PATH}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new CalicoDeskError("Could not refresh workspaces from CalicoDesk.");
  }

  const data = await readJson(response);

  if (!response.ok) {
    throw new CalicoDeskError(extractErrorMessage(data, response.status));
  }

  return collectWorkspacesFromResponse(data);
}

/** Build the storefront loader URL for a workspace subdomain. */
export function livechatLoaderUrl(subdomain) {
  const value = (subdomain || "").trim();
  if (value === "") {
    return "";
  }
  return `https://${value}.calicodesk.com/livechat-loader.js`;
}

/**
 * Merge two workspace lists, de-duplicating by id and preserving a subdomain
 * or source that was discovered on a previous sync. Mirrors
 * Api::merge_workspace_lists().
 */
export function mergeWorkspaces(
  existing,
  incoming,
) {
  const merged = [];
  const index = {};

  for (const workspace of [...existing, ...incoming]) {
    const id = String(workspace.id ?? "");
    if (id === "") {
      continue;
    }
    if (index[id] !== undefined) {
      merged[index[id]] = mergeWorkspaceRecord(merged[index[id]], workspace);
      continue;
    }
    index[id] = merged.length;
    merged.push(workspace);
  }

  return merged;
}

function mergeWorkspaceRecord(
  existing,
  incoming,
) {
  const merged = { ...existing, ...incoming };

  if (!merged.subdomain && existing.subdomain) {
    merged.subdomain = existing.subdomain;
  }
  if (!merged.subdomain && incoming.subdomain) {
    merged.subdomain = incoming.subdomain;
  }

  merged.source = { ...(existing.source ?? {}), ...(incoming.source ?? {}) };

  if (!merged.subdomain && isObject(merged.source)) {
    const fromSource = extractSubdomainFromPayload(merged.source);
    if (fromSource) {
      merged.subdomain = fromSource;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Response parsing / normalisation (ported from class-calicodesk-api.php)
// ---------------------------------------------------------------------------

function parseSignInResponse(data) {
  let payload = data;
  if (isObject(data) && isObject(data.data)) {
    payload = data.data;
  }

  let token = "";
  if (payload?.developer_token) {
    token = String(payload.developer_token);
  } else if (payload?.developerToken) {
    token = String(payload.developerToken);
  } else if (data?.developer_token) {
    token = String(data.developer_token);
  }

  let workspaces = collectWorkspacesFromResponse(data);
  if (workspaces.length === 0) {
    workspaces = collectWorkspacesFromResponse(payload);
  }

  return { developerToken: token, workspaces };
}

function collectWorkspacesFromResponse(data) {
  if (!isObject(data) && !Array.isArray(data)) {
    return [];
  }

  let items = [];

  if (Array.isArray(data)) {
    items = items.concat(flattenWorkspaceRoot(data));
  }

  let payload = data;

  if (isObject(data) && data.data && typeof data.data === "object") {
    if (Array.isArray(data.data)) {
      items = items.concat(flattenWorkspaceRoot(data.data));
    } else {
      payload = data.data;
    }
  }

  const workspaceKeys = [
    "workspaces",
    "accessible_workspaces",
    "workspace_list",
    "user_workspaces",
    "items",
    "results",
  ];

  for (const key of workspaceKeys) {
    if (!payload || !payload[key] || typeof payload[key] !== "object") {
      continue;
    }
    items = items.concat(flattenWorkspaceRoot(payload[key]));
  }

  return normalizeWorkspaceCollection(items);
}

function flattenWorkspaceRoot(root) {
  if (!root || typeof root !== "object") {
    return [];
  }

  if (!Array.isArray(root) && root.data && typeof root.data === "object") {
    return flattenWorkspaceRoot(root.data);
  }

  if (!Array.isArray(root)) {
    let items = [];
    for (const value of Object.values(root)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      if (looksLikeWorkspace(value)) {
        items.push(value);
        continue;
      }
      items = items.concat(flattenWorkspaceRoot(value));
    }
    return items;
  }

  const items = [];
  for (const item of root) {
    if (item && typeof item === "object") {
      items.push(item);
    }
  }
  return items;
}

function normalizeWorkspaceCollection(items) {
  const workspaces = [];
  const seen = {};

  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const item = normalizeWorkspaceItem(raw);
    const id = extractWorkspaceId(item);

    if (id === "" || seen[id]) {
      continue;
    }

    seen[id] = true;

    workspaces.push({
      id,
      name: extractWorkspaceName(item, id),
      subdomain: extractSubdomainFromPayload(item),
      source: compactWorkspaceSource(item),
    });
  }

  return workspaces;
}

function normalizeWorkspaceItem(item) {
  let result = { ...item };

  if (isObject(item.attributes)) {
    result = { ...result, ...item.attributes };
  }

  if (isObject(item.workspace)) {
    const nested = normalizeWorkspaceItem(item.workspace);
    result = { ...result, ...nested };
  }

  return result;
}

function extractWorkspaceId(workspace) {
  for (const key of ["id", "workspace_id", "workspaceId", "uuid", "uid"]) {
    const value = workspace[key];
    if (value !== undefined && value !== "" && value !== null) {
      return String(value);
    }
  }

  for (const key of ["subdomain", "slug", "workspace_slug", "handle"]) {
    if (!workspace[key]) {
      continue;
    }
    const subdomain = normalizeSubdomain(String(workspace[key]));
    if (subdomain !== "") {
      return subdomain;
    }
  }

  return "";
}

function extractWorkspaceName(workspace, id) {
  for (const key of ["name", "title", "workspace_name", "label", "display_name"]) {
    const value = workspace[key];
    if (value && (typeof value !== "object")) {
      return String(value);
    }
  }
  return `Workspace ${id}`;
}

function extractSubdomainFromPayload(workspace) {
  const keys = [
    "subdomain",
    "sub_domain",
    "workspace_subdomain",
    "slug",
    "workspace_slug",
    "handle",
    "tenant",
    "workspace_key",
    "key",
    "code",
    "identifier",
    "livechat_subdomain",
  ];

  for (const key of keys) {
    const value = workspace[key];
    if (value === undefined || value === null || typeof value === "object") {
      continue;
    }
    const subdomain = normalizeSubdomain(String(value));
    if (subdomain !== "") {
      return subdomain;
    }
  }

  const urlKeys = [
    "url",
    "host",
    "domain",
    "hostname",
    "livechat_url",
    "base_url",
    "workspace_url",
    "site_url",
    "website",
    "custom_domain",
  ];

  for (const key of urlKeys) {
    const value = workspace[key];
    if (!value || typeof value === "object") {
      continue;
    }
    const subdomain = subdomainFromHost(String(value));
    if (subdomain !== "") {
      return subdomain;
    }
  }

  return findSubdomainRecursively(workspace);
}

function findSubdomainRecursively(data, depth = 0) {
  if (depth > 6 || !data || typeof data !== "object") {
    return "";
  }

  for (const value of Object.values(data)) {
    if (value !== null && typeof value !== "object") {
      const subdomain = subdomainFromHost(String(value));
      if (subdomain !== "") {
        return subdomain;
      }
      continue;
    }
    if (value && typeof value === "object") {
      const subdomain = findSubdomainRecursively(value, depth + 1);
      if (subdomain !== "") {
        return subdomain;
      }
    }
  }

  return "";
}

function compactWorkspaceSource(workspace) {
  const source = {};

  for (const [key, value] of Object.entries(workspace)) {
    if (value !== null && typeof value !== "object") {
      source[key] = value;
      continue;
    }

    if (!value || typeof value !== "object") {
      continue;
    }

    const nested = {};
    for (const [subKey, subValue] of Object.entries(value)) {
      if (subValue !== null && typeof subValue !== "object") {
        nested[subKey] = subValue;
      }
    }

    if (Object.keys(nested).length > 0) {
      source[key] = nested;
    }
  }

  return source;
}

function looksLikeWorkspace(item) {
  if (!item || typeof item !== "object") {
    return false;
  }

  if (item.attributes !== undefined || item.workspace !== undefined) {
    return true;
  }

  for (const key of [
    "id",
    "workspace_id",
    "workspaceId",
    "uuid",
    "subdomain",
    "slug",
    "name",
  ]) {
    if (item[key] !== undefined && item[key] !== "" && item[key] !== null) {
      return true;
    }
  }

  return false;
}

function normalizeSubdomain(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return "";
  }
  return subdomainFromHost(normalized);
}

function subdomainFromHost(value) {
  let host = value.trim();
  if (host === "") {
    return "";
  }

  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return "";
    }
    if (!host) {
      return "";
    }
  }

  const match = host.match(/^([a-z0-9-]+)\.calicodesk\.com$/i);
  if (match) {
    return match[1].toLowerCase();
  }

  if (/^[a-z0-9-]+$/i.test(host)) {
    return host.toLowerCase();
  }

  return "";
}

function extractErrorMessage(data, statusCode) {
  if (isObject(data)) {
    if (typeof data.message === "string" && data.message) {
      return data.message;
    }
    if (typeof data.error === "string" && data.error) {
      return data.error;
    }
    if (data.errors && typeof data.errors === "object") {
      const messages = [];
      for (const fieldErrors of Object.values(data.errors)) {
        if (Array.isArray(fieldErrors)) {
          for (const message of fieldErrors) {
            if (typeof message === "string") {
              messages.push(message);
            }
          }
        } else if (typeof fieldErrors === "string") {
          messages.push(fieldErrors);
        }
      }
      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return "Invalid email or password.";
  }

  return "Sign in failed. Please try again.";
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
