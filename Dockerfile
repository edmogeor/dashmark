FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN SKIP_INSTALL_SIMPLE_GIT_HOOKS=1 npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache jq && npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/data/icons.json ./src/data/icons.json
COPY --from=builder /app/src/data/descriptions.json ./src/data/descriptions.json
COPY --from=builder /app/metrics ./metrics
COPY --from=builder /app/THIRD_PARTY_NOTICES.md ./
COPY scripts/start.mjs ./scripts/start.mjs
ENV JQ_PATH=/usr/bin/jq
EXPOSE 4321
CMD ["node", "./scripts/start.mjs"]
