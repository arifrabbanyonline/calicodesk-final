# CalicoDesk for Shopify

Connect a Shopify store to [CalicoDesk](https://calicodesk.com/) and add
AI‑powered live chat, chatbots, and helpdesk support to the storefront.

This is the Shopify counterpart to the CalicoDesk WordPress plugin. Like the
plugin, it is a **connector**: the chat/AI/helpdesk features run on the
CalicoDesk platform. The app authenticates the merchant, lets them pick a
workspace, and injects the CalicoDesk live‑chat loader into the storefront.

Built on Shopify's official **React Router** app template (embedded app + App
Bridge + Polaris web components), with a **theme app extension** for the
storefront widget.

---

## How it maps to the WordPress plugin

| WordPress plugin | This Shopify app |
| --- | --- |
| Sign in with email/password → `POST /api/v1/wordpress/sign-in` → developer token | `app/routes/app.connect.tsx` → `app/services/calicodesk.server.ts` (`signIn`) |
| `GET /api/v1/me/workspaces` sync | `syncWorkspaces` in `app/services/connection.server.ts` |
| Options table (token, workspaces, active workspace) | `CalicoDeskConnection` table (one row per shop) |
| `wp_enqueue_script` of `https://<sub>.calicodesk.com/livechat-loader.js` | Theme app extension `extensions/calicodesk-widget` reads an app‑owned metafield and injects the loader |
| Admin menu pages | Embedded app pages: Home, Workspaces, Connection |

The merchant's password is only forwarded to CalicoDesk over HTTPS at sign‑in;
it is never stored.

---

## Prerequisites

- Node.js `>=20.19 <22 || >=22.12`
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- A [Shopify Partner](https://partners.shopify.com/) account and an app created
  in the Partner Dashboard
- A development store to install the app on
- A CalicoDesk account (to test sign‑in)

## Getting started

```bash
npm install

# Link this project to your app in the Partner Dashboard.
# Fills in client_id / application_url / redirect URLs in shopify.app.toml.
npm run config:link

# Run locally (creates a tunnel, sets env vars, runs migrations, starts dev).
npm run dev
```

Press `P` to open the app URL, then install it on your development store.

### Environment variables

`shopify app dev` injects `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
`SHOPIFY_APP_URL`, and `SCOPES` automatically. The CalicoDesk endpoints are
configurable (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CALICODESK_API_BASE_URL` | `https://calicodesk.com/api/v1` | CalicoDesk API base |
| `CALICODESK_SIGNIN_PATH` | `/wordpress/sign-in` | Sign‑in endpoint. Point this at a dedicated `/shopify/sign-in` if/when the backend adds one. |
| `CALICODESK_WORKSPACES_PATH` | `/me/workspaces` | Workspace list endpoint |

> The app requests **`read_products`** so merchants can copy Shopify Admin API
> credentials from the Home page for CalicoDesk product tools.

## How the storefront widget works

1. In the app, the merchant enables a workspace (**Workspaces** page).
2. The app writes the active subdomain to an app‑owned metafield on the app
   installation: namespace `calicodesk`, key `subdomain`.
3. The theme app extension app embed (`extensions/calicodesk-widget`) reads it in
   Liquid as `app.metafields.calicodesk.subdomain` and injects
   `https://<subdomain>.calicodesk.com/livechat-loader.js`.
4. The merchant enables the **CalicoDesk Live Chat** app embed once in the theme
   editor (**Online Store → Themes → Customize → App embeds**).

An optional per‑theme **subdomain override** field is available in the app embed
settings as a manual fallback.

## Project structure

```
app/
  shopify.server.ts              # Shopify app config (OAuth, sessions, webhooks)
  db.server.ts                   # Prisma client
  routes/
    app.tsx                      # Embedded layout + nav
    app._index.tsx               # Dashboard (status + API token)
    app.connect.tsx              # Sign in / disconnect
    app.workspaces.tsx           # Enable/disable a workspace
    auth.$.tsx, auth.login/      # OAuth
    webhooks.app.uninstalled.tsx
    webhooks.app.scopes_update.tsx
    webhooks.customers.data_request.tsx
    webhooks.customers.redact.tsx
    webhooks.shop.redact.tsx
  services/
    calicodesk.server.ts         # CalicoDesk API client (port of the WP Api class)
    connection.server.ts         # Per‑shop store + storefront metafield bridge
extensions/
  calicodesk-widget/             # Theme app extension (app embed widget)
prisma/schema.prisma             # Session + CalicoDeskConnection
shopify.app.toml                 # App config, scopes (none), webhooks
```

## Deployment (Render)

This app is the **Shopify React Router (Vite)** template — not Remix.

### Local development

```bash
cp .env.example .env          # DATABASE_URL="file:dev.sqlite"
npx prisma migrate deploy
npm run dev
```

No Docker/Postgres required locally (SQLite file in `prisma/`).

### Render (Docker)

1. Create a **Web Service** with **Docker** runtime (or use `render.yaml`).
2. Set env vars: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`,
   `SHOPIFY_APP_URL` (your `https://…onrender.com` URL), `NODE_ENV=production`,
   and `DATABASE_URL=file:dev.sqlite` (or a Postgres URL — see below).
   Render injects `PORT` automatically; `@react-router/serve` reads it.
3. Update `shopify.app.toml` `application_url` + `[auth].redirect_urls`, then:

```bash
npm run deploy   # pushes app config + the theme extension to Shopify
```

**Note:** SQLite on Render is wiped when the instance restarts/redeploys. For
durable sessions, switch Prisma `provider` to `postgresql`, point
`DATABASE_URL` at a Render Postgres database, and regenerate migrations.

See Shopify's [deployment docs](https://shopify.dev/docs/apps/launch/deployment)
and [Render's Shopify guide](https://render.com/docs/deploy-shopify-app).

## Shopify App Store submission checklist

- [ ] App installs and reinstalls cleanly on a fresh development store (OAuth).
- [ ] Embedded app loads with App Bridge; navigation stays inside the iframe.
- [ ] Sign in / disconnect / enable / disable all work end‑to‑end.
- [ ] The app embed injects the widget on the storefront when a workspace is on,
      and stops when it is off / disconnected.
- [ ] Mandatory compliance webhooks respond `200` (customers/data_request,
      customers/redact, shop/redact) — implemented here.
- [ ] `app/uninstalled` cleans up shop data — implemented here.
- [ ] Listing content: name, icon, screenshots, demo store, support contact.
- [ ] Pricing set to **Free** (billing is handled inside CalicoDesk).
- [ ] Privacy policy and terms URLs
      ([privacy](https://calicodesk.com/privacy-policy),
      [terms](https://calicodesk.com/terms-and-conditions)).
- [ ] Data & privacy questionnaire completed (declare CalicoDesk as a
      third‑party the app sends data to, mirroring the WP plugin's disclosures).
- [ ] Theme app extension passes the storefront performance check.
- [ ] Test instructions for the reviewer (include CalicoDesk test credentials).

See Shopify's [app requirements](https://shopify.dev/docs/apps/launch/app-requirements-checklist)
for the authoritative, up‑to‑date list.

## Notes / open items

- **Sign‑in endpoint** currently reuses the WordPress endpoint
  (`/wordpress/sign-in`). If you add a dedicated Shopify endpoint, change
  `CALICODESK_SIGNIN_PATH`.
- **Password sign‑in** mirrors the WP plugin. Some reviewers scrutinise
  third‑party credential capture; a paste‑the‑token flow is an easy alternative
  if needed.
