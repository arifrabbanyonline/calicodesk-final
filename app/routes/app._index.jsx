import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getConnection } from "../services/connection.server";
import { getShopifyCredentials } from "../services/shopify-credentials.server";
import "../styles/home.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const connection = await getConnection(session.shop);
  const shopify = await getShopifyCredentials(session.shop);

  const activeWorkspace = connection?.workspaces.find(
    (w) => String(w.id) === connection?.activeWorkspaceId,
  );

  return {
    connected: Boolean(connection),
    email: connection?.email ?? null,
    workspaceCount: connection?.workspaces.length ?? 0,
    activeWorkspaceName: activeWorkspace?.name ?? null,
    activeSubdomain: connection?.activeSubdomain ?? null,
    accessToken: shopify?.accessToken ?? null,
    apiVersion: shopify?.apiVersion ?? null,
  };
};

function maskToken(token) {
  if (token.length <= 8) {
    return "••••••••";
  }
  return `${token.slice(0, 4)}${"•".repeat(Math.max(token.length - 8, 4))}${token.slice(-4)}`;
}

function CopyIcon() {
  return (
    <svg className="home-credential-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ hidden }) {
  if (hidden) {
    return (
      <svg className="home-credential-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2 12.5C3.73 8.11 8 5 13 5s9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S3.73 16.89 2 12.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
        <circle cx="13" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.75" />
      </svg>
    );
  }

  return (
    <svg className="home-credential-field__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-.58" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M6.12 6.12A11.55 11.55 0 0 0 1 12.5C2.73 16.89 7 20 12 20a10.9 10.9 0 0 0 4.12-.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Index() {
  const data = useLoaderData();
  const shopify = useAppBridge();
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const liveChatOn = Boolean(data.activeSubdomain);

  const copy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      shopify.toast.show(`${label} copied`);
    } catch {
      shopify.toast.show(`Could not copy ${label}`, { isError: true });
    }
  };

  if (!data.connected) {
    return (
      <div className="home-page home-page--centered">
        <div className="home-card home-card--welcome">
          <span className="home-card__badge home-card__badge--neutral">Not connected</span>
          <h1 className="home-card__title">Connect CalicoDesk</h1>
          <p className="home-card__text">
            Add AI-powered live chat, chatbots, and helpdesk support to your
            storefront. Sign in with your CalicoDesk account to sync workspaces
            and enable the widget.
          </p>
          <Link to="/app/connect" className="home-btn home-btn--primary home-btn--block">
            Sign in to CalicoDesk
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-grid">
        <div className="home-main">
          <div className={`home-card${liveChatOn ? " home-card--active" : ""}`}>
            <span className="home-card__badge home-card__badge--success">Connected</span>
            <h1 className="home-card__title">Account status</h1>

            <div className="home-status-list">
              <div className="home-status-item">
                <span className="home-status-item__label">Account</span>
                <span className="home-status-item__value">
                  {data.email ?? "—"}
                </span>
              </div>
              <div className="home-status-item">
                <span className="home-status-item__label">Workspaces</span>
                <span className="home-status-item__value">
                  {data.workspaceCount} available
                </span>
              </div>
              <div className="home-status-item">
                <span className="home-status-item__label">Live chat widget</span>
                <span className="home-status-item__value">
                  <span className={`home-pill${liveChatOn ? " home-pill--on" : " home-pill--off"}`}>
                    {liveChatOn ? "On" : "Off"}
                  </span>
                </span>
              </div>
            </div>

            {liveChatOn ? (
              <p className="home-workspace-info">
                Active workspace: <strong>{data.activeWorkspaceName}</strong>
                <br />
                {data.activeSubdomain}.calicodesk.com
              </p>
            ) : (
              <p className="home-workspace-info home-workspace-info--muted">
                No workspace is enabled yet. Go to Workspaces to turn on live chat.
              </p>
            )}

            <div className="home-actions home-actions--row">
              <Link to="/app/workspaces" className="home-btn home-btn--primary">
                Manage workspaces
              </Link>
              <Link to="/app/connect" className="home-btn home-btn--outline">
                Connection settings
              </Link>
            </div>
          </div>

          <div className="home-card">
            <h2 className="home-card__title">Turn on the storefront widget</h2>
            <p className="home-card__text">
              Follow these steps to show the chat widget on your store.
            </p>
            <ol className="home-guide">
              <li className="home-guide__item">
                <span className="home-guide__step">1</span>
                <span>Enable a workspace from the Workspaces page.</span>
              </li>
              <li className="home-guide__item">
                <span className="home-guide__step">2</span>
                <span>
                  Go to <strong>Online Store → Themes → Customize → App embeds</strong>.
                </span>
              </li>
              <li className="home-guide__item">
                <span className="home-guide__step">3</span>
                <span>
                  Toggle on <strong>CalicoDesk Live Chat</strong> and save.
                </span>
              </li>
            </ol>
          </div>
        </div>

        <aside className="home-side">
          <div className="home-card home-credential-card">
            <h2 className="home-credential-card__title">Admin API access token</h2>
            <p className="home-credential-card__text">
              Copy this into CalicoDesk when setting up Shopify product tools.
            </p>
            {data.accessToken ? (
              <div className="home-credential-field home-credential-field--textarea">
                <textarea
                  className="home-credential-field__textarea"
                  value={tokenRevealed ? data.accessToken : maskToken(data.accessToken)}
                  readOnly
                  rows={3}
                  aria-label="Admin API access token"
                />
                <div className="home-credential-field__actions">
                  <button
                    type="button"
                    className="home-credential-field__btn"
                    onClick={() => setTokenRevealed((value) => !value)}
                    aria-label={tokenRevealed ? "Hide token" : "Show token"}
                  >
                    <EyeIcon hidden={!tokenRevealed} />
                  </button>
                  <button
                    type="button"
                    className="home-credential-field__btn"
                    onClick={() => copy("Admin API access token", data.accessToken)}
                    aria-label="Copy token"
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
            ) : (
              <input
                className="home-credential-field__input"
                value="—"
                readOnly
                disabled
                aria-label="Admin API access token"
              />
            )}
          </div>

          <div className="home-card home-credential-card">
            <h2 className="home-credential-card__title">Admin API version</h2>
            <p className="home-credential-card__text">
              Use this API version in CalicoDesk when connecting your store.
            </p>
            {data.apiVersion ? (
              <div className="home-credential-field">
                <input
                  className="home-credential-field__input"
                  value={data.apiVersion}
                  readOnly
                  aria-label="Admin API version"
                />
                <div className="home-credential-field__actions">
                  <button
                    type="button"
                    className="home-credential-field__btn"
                    onClick={() => copy("Admin API version", data.apiVersion)}
                    aria-label="Copy version"
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
            ) : (
              <input
                className="home-credential-field__input"
                value="—"
                readOnly
                disabled
                aria-label="Admin API version"
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
