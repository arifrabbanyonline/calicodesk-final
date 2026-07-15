import { useEffect } from "react";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  clearActiveWorkspace,
  clearSubdomainMetafield,
  getConnection,
  setActiveWorkspace,
  syncWorkspaces,
  writeSubdomainMetafield,
} from "../services/connection.server";
import "../styles/workspaces.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  let connection = await getConnection(session.shop);

  if (!connection) {
    return {
      connected: false,
      workspaces: [],
      activeWorkspaceId: null,
    };
  }

  // Best-effort refresh so the list is up to date. Keep the stored list on error.
  try {
    connection = await syncWorkspaces(session.shop);
  } catch {
    // Ignore — render whatever is stored.
  }

  return {
    connected: true,
    workspaces: connection.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      subdomain: w.subdomain,
    })),
    activeWorkspaceId: connection.activeWorkspaceId,
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  const connection = await getConnection(session.shop);
  if (!connection) {
    return { ok: false, message: "CalicoDesk is not connected." };
  }

  if (intent === "refresh") {
    try {
      await syncWorkspaces(session.shop);
      return { ok: true, message: "Workspaces refreshed." };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not refresh workspaces.",
      };
    }
  }

  if (intent === "toggle") {
    const workspaceId = String(formData.get("workspace_id") || "");
    const enabled = String(formData.get("enabled") || "") === "true";

    if (!workspaceId) {
      return { ok: false, message: "Workspace id is required." };
    }

    if (!enabled) {
      await clearActiveWorkspace(session.shop);
      try {
        await clearSubdomainMetafield(admin);
      } catch {
        // ignore
      }
      return { ok: true, message: "Live chat disabled for this workspace." };
    }

    let subdomain = "";
    try {
      const result = await setActiveWorkspace(session.shop, workspaceId);
      subdomain = result.subdomain;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Workspace not found.",
      };
    }

    // The subdomain may not have synced yet — try one refresh before giving up.
    if (!subdomain) {
      try {
        await syncWorkspaces(session.shop);
        const result = await setActiveWorkspace(session.shop, workspaceId);
        subdomain = result.subdomain;
      } catch {
        // ignore
      }
    }

    if (!subdomain) {
      await clearActiveWorkspace(session.shop);
      return {
        ok: false,
        message:
          "This workspace does not have a live chat subdomain yet. Try Refresh.",
      };
    }

    try {
      await writeSubdomainMetafield(admin, subdomain);
    } catch {
      return {
        ok: false,
        message:
          "Enabled, but the storefront could not be updated. Please try again.",
      };
    }

    return { ok: true, message: "Live chat enabled for this workspace." };
  }

  return { ok: false, message: "Unknown action." };
};

function RefreshIcon({ spinning }) {
  return (
    <svg
      className={`workspaces-refresh-btn__icon${spinning ? " workspaces-refresh-btn__icon--spin" : ""}`}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10 3.5a6.5 6.5 0 1 1-4.6 1.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M3.5 6.5V3.5h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorkspaceRow({ workspace, active }) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message, {
        isError: !fetcher.data.ok,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const toggle = () => {
    if (busy) return;
    fetcher.submit(
      {
        intent: "toggle",
        workspace_id: workspace.id,
        enabled: (!active).toString(),
      },
      { method: "POST" },
    );
  };

  return (
    <div
      className={`workspace-card${active ? " workspace-card--active" : ""}`}
    >
      <div className="workspace-card__accent" aria-hidden="true" />
      <div className="workspace-card__body">
        <div className="workspace-card__info">
          <span className="workspace-card__name">{workspace.name}</span>
          {workspace.subdomain ? (
            <span className="workspace-card__url">
              {workspace.subdomain}.calicodesk.com
            </span>
          ) : (
            <span className="workspace-card__url workspace-card__url--missing">
              No live chat subdomain yet
            </span>
          )}
          {active ? (
            <span className="workspace-card__badge">Active</span>
          ) : null}
        </div>

        <label className="workspace-toggle">
          <input
            type="checkbox"
            className="workspace-toggle__input"
            checked={active}
            disabled={busy}
            onChange={toggle}
            aria-label={`${active ? "Disable" : "Enable"} ${workspace.name}`}
          />
          <span className="workspace-toggle__track">
            <span className="workspace-toggle__thumb" />
          </span>
        </label>
      </div>
    </div>
  );
}

export default function Workspaces() {
  const data = useLoaderData();
  const refresh = useFetcher();
  const shopify = useAppBridge();
  const refreshing = refresh.state !== "idle";

  useEffect(() => {
    if (refresh.state === "idle" && refresh.data?.message) {
      shopify.toast.show(refresh.data.message, {
        isError: !refresh.data.ok,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh.state, refresh.data]);

  if (!data.connected) {
    return (
      <div className="workspaces-page">
        <div className="workspaces-not-connected">
          <h2 className="workspaces-not-connected__title">Not connected</h2>
          <p className="workspaces-not-connected__text">
            Connect your CalicoDesk account to view and enable workspaces.
          </p>
          <Link to="/app/connect" className="workspaces-not-connected__link">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const count = data.workspaces.length;
  const countLabel = `${count} workspace${count === 1 ? "" : "s"}`;

  return (
    <div className="workspaces-page">
      <div className="workspaces-toolbar">
        <span className="workspaces-count">{countLabel}</span>
        <button
          type="button"
          className="workspaces-refresh-btn"
          onClick={() => refresh.submit({ intent: "refresh" }, { method: "POST" })}
          disabled={refreshing}
        >
          <RefreshIcon spinning={refreshing} />
          {refreshing ? "Refreshing…" : "Refresh workspaces"}
        </button>
      </div>

      {count === 0 ? (
        <div className="workspaces-empty">
          <p className="workspaces-empty__title">No workspaces found</p>
          <p>
            Create one in your CalicoDesk dashboard, then tap Refresh workspaces.
          </p>
        </div>
      ) : (
        <div className="workspaces-list">
          {data.workspaces.map((workspace) => (
            <WorkspaceRow
              key={workspace.id}
              workspace={workspace}
              active={String(workspace.id) === data.activeWorkspaceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
