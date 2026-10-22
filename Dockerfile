FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production PORT=5000
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/generated ./generated
# Prisma CLI and tsx are retained for migrations and optional explicit seeding.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/scripts ./scripts
USER node
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health/db').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "scripts/docker-entrypoint.sh"]
