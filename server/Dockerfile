FROM node:18-alpine

WORKDIR /app

# Copy SDK (server depends on it)
COPY sdk/javascript/ ./sdk/javascript/
COPY sql/ ./sql/

# Copy server
COPY server/package*.json ./server/
COPY server/index.js ./server/
COPY server/public/ ./server/public/

# Install dependencies
WORKDIR /app/server
RUN npm install --production

EXPOSE 3111

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3111/health || exit 1

CMD ["node", "index.js"]
