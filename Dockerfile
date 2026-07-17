# Shopify React Router (Vite) app — Render / Docker production image
FROM node:20-alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Defaults used at build (prisma generate) and runtime if Render omits them.
# SQLite path is absolute so migrate/start always hit the same file.
ENV DATABASE_URL="file:/app/prisma/dev.sqlite"
ENV PORT=3000

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install ALL deps for the Vite / React Router build.
# Do not use `npm ci --omit=dev` here — `vite` is required to build.
RUN npm ci

COPY . .

# NODE_ENV must not be "production" during `npm ci` (already done above).
# Build with prisma generate, then drop unused build tooling.
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

# migrate then serve; forwards SIGTERM to the Node server (Render).
CMD ["node", "scripts/docker-entrypoint.js"]
