# syntax=docker/dockerfile:1
# Production image for Cloud Run: Next.js standalone server + SQLite + Litestream.

FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm run build:seed

FROM base AS runtime
ARG LITESTREAM_VERSION=0.3.13
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz /tmp/litestream.tgz
RUN tar -xzf /tmp/litestream.tgz -C /usr/local/bin && rm /tmp/litestream.tgz

ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DB_PATH=/data/app.db \
    DATABASE_URL=file:/data/app.db \
    NEXT_TELEMETRY_DISABLED=1

# Prisma CLI for `migrate deploy` at startup (the standalone output only carries the client).
RUN npm install --no-save --no-package-lock prisma@6.19.3 && npm cache clean --force

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist/seed.js ./dist/seed.js
COPY --from=build /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data

EXPOSE 8080
CMD ["/usr/local/bin/entrypoint.sh"]
