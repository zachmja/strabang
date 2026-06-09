# ---- builder ---------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (incl. dev) for the TypeScript build.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV TOKEN_STORE_PATH=/data/tokens.json

# Production deps only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# The token store lives on a mounted volume; create the mount point so the
# directory exists even before the volume is attached (e.g. local docker run).
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "dist/index.js"]
