# Shopify React Router (Vite) — production image for Render
FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Build + runtime defaults (Render injects PORT; override DATABASE_URL if needed)
ENV DATABASE_URL="file:/app/prisma/dev.sqlite"
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json* .npmrc ./
COPY prisma ./prisma/

# Full install — Vite / React Router build needs devDependencies + peers.
RUN npm ci

COPY . .

RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev \
  && test -f build/server/index.js \
  && test -f scripts/docker-entrypoint.js \
  && test -f node_modules/@react-router/serve/bin.js \
  && test -f node_modules/prisma/build/index.js

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "scripts/docker-entrypoint.js"]
