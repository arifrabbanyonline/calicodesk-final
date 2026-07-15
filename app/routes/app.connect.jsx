import { useState } from "react";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  clearSubdomainMetafield,
  disconnect,
  getConnection,
  saveConnection,
} from "../services/connection.server";
import { CalicoDeskError, signIn } from "../services/calicodesk.server";
import "../styles/connect.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const connection = await getConnection(session.shop);

  return {
    connected: Boolean(connection),
    email: connection?.email ?? null,
    workspaceCount: connection?.workspaces.length ?? 0,
  };
};

export const action = async ({ request }) => {
  const { session, admin, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "disconnect") {
    await disconnect(session.shop);
    try {
      await clearSubdomainMetafield(admin);
    } catch {
      // The metafield may not exist; ignore.
    }
    return redirect("/app/connect");
  }

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email) {
    return { error: "Please enter your email address." };
  }
  if (!password) {
    return { error: "Please enter your password." };
  }

  try {
    const result = await signIn(email, password);
    await saveConnection(session.shop, {
      email,
      developerToken: result.developerToken,
      workspaces: result.workspaces,
    });
  } catch (error) {
    const message =
      error instanceof CalicoDeskError
        ? error.message
        : "Sign in failed. Please try again.";
    return { error: message };
  }

  return redirect("/app/workspaces");
};

export default function Connect() {
  const data = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const [showPassword, setShowPassword] = useState(false);
  const submitting = navigation.state === "submitting";

  if (data.connected) {
    return (
      <div className="connect-page">
        <div className="connect-card">
          <span className="connect-card__badge">Connected</span>

          <h1 className="connect-card__title">Account connected</h1>

          {data.email ? (
            <p className="connect-card__email">
              Signed in as {data.email}
            </p>
          ) : null}

          <p className="connect-card__workspaces">
            {data.workspaceCount} workspace
            {data.workspaceCount === 1 ? "" : "s"} available
          </p>

          <div className="connect-card__actions">
            <Link
              to="/app/workspaces"
              className="connect-card__btn connect-card__btn--primary"
            >
              Manage workspaces
            </Link>

            <Form method="post" className="connect-card__form">
              <input type="hidden" name="intent" value="disconnect" />
              <button
                type="submit"
                className="connect-card__btn connect-card__btn--outline"
                disabled={submitting}
              >
                {submitting ? "Disconnecting…" : "Disconnect"}
              </button>
            </Form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="connect-page">
      <div className="connect-card connect-card--signin">
        <h1 className="connect-card__title">Sign in to CalicoDesk</h1>
        <p className="connect-card__subtitle">
          Connect your CalicoDesk account to sync workspaces and receive your
          developer API token. Your password is sent securely to CalicoDesk and
          is never stored.
        </p>

        {actionData?.error ? (
          <div className="connect-banner">{actionData.error}</div>
        ) : null}

        <Form method="post" className="connect-form">
          <div className="connect-form__field">
            <label className="connect-form__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="connect-form__input"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="connect-form__field">
            <label className="connect-form__label" htmlFor="password">
              Password
            </label>
            <div className="connect-form__password">
              <input
                id="password"
                className="connect-form__input connect-form__input--password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="connect-form__password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    className="connect-form__password-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 3l18 18"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                    <path
                      d="M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-.58"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                    <path
                      d="M9.88 5.1A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7.5a11.6 11.6 0 0 1-2.12 3.17M6.12 6.12A11.55 11.55 0 0 0 1 12.5C2.73 16.89 7 20 12 20a10.9 10.9 0 0 0 4.12-.8"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    className="connect-form__password-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12.5C3.73 8.11 8 5 13 5s9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S3.73 16.89 2 12.5Z"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="13"
                      cy="12.5"
                      r="3"
                      stroke="currentColor"
                      strokeWidth="1.75"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="connect-form__submit"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </Form>

        <p className="connect-signup">
          Don&apos;t have an account?{" "}
          <a href="https://calicodesk.com" target="_blank" rel="noreferrer">
            Sign up at CalicoDesk
          </a>
        </p>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
