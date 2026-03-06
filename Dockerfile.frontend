# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY index.html           ./
COPY tsconfig.json         ./
COPY tsconfig.node.json    ./
COPY vite.config.ts        ./
COPY tailwind.config.ts    ./
COPY eslint.config.js      ./
COPY src/                  ./src/

RUN npm run build

# ─── Stage 2: Serve with nginx ───────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Remove default nginx site
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script that generates /env-config.js from env vars at startup
COPY env.sh /docker-entrypoint.d/90-env-config.sh
RUN chmod +x /docker-entrypoint.d/90-env-config.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.d/90-env-config.sh"]
CMD ["nginx", "-g", "daemon off;"]
