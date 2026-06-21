# Railway / Docker build — permanent always-on container for the trading engine
# (Express API + built Vite UI + 5-min trading daemons + jup CLI for REAL perps).
FROM node:20-bookworm-slim

# bash (start script) + toolchain for any native npm deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps FRESH on Linux so platform-specific binaries (rollup, etc.) are correct.
# package-lock.json is intentionally excluded (.dockerignore) to dodge npm's optional-deps
# bug (npm/cli#4828) that omits the Linux rollup binary when a macOS lock is reused.
COPY package.json ./
RUN npm install --no-audit --no-fund

# App source (node_modules / dist / test-trade excluded via .dockerignore)
COPY . .

# Build the UI + bundle the server to dist/server.cjs
RUN npm run build

# Permanent runtime: import the jup signing key from env, then launch the long-lived server.
CMD ["npm", "run", "start:railway"]
