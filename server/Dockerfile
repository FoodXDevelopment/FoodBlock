# Build from the repository root: docker build -f server/Dockerfile .
# Node 24 (LTS); exactly the lockfile's dependencies, no install scripts; it runs as the unprivileged `node` user.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
# The node depends on the SDK package (file:../sdk/javascript), which loads spec/protocol.json.
COPY sdk/javascript/ ./sdk/javascript/
COPY spec/protocol.json ./spec/
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev --ignore-scripts
COPY server/index.js server/node.js server/schema.sql ./
USER node
EXPOSE 3111
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider http://localhost:3111/health || exit 1
# The owner states STRANGERS_PER_DAY, PER_STRANGER, ADMISSION, PULL_CAP, SERVES_PAIRS, TAKES_PAIRS, WAITING_PER_AUTHOR, COPY_RECIPIENTS and COPY_BYTES at run time (-e); the node refuses to start without them.
CMD ["node", "index.js"]
