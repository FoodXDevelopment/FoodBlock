# Build from the repository root: docker build -f server/Dockerfile .
FROM node:20-alpine
WORKDIR /app
# The node depends on the SDK package (file:../sdk/javascript), which loads spec/protocol.json.
COPY sdk/javascript/ ./sdk/javascript/
COPY spec/protocol.json ./spec/
COPY sql/ ./sql/
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev
COPY server/index.js server/node.js ./
EXPOSE 3111
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider http://localhost:3111/health || exit 1
CMD ["node", "index.js"]
