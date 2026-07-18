# --- build stage: install all deps, build the Vue SPA -----------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm ci
COPY . .
RUN npm run build --workspace=web

# --- runtime stage: server + built SPA only, prod deps only -----------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY server/ server/
COPY --from=build /app/web/dist web/dist
RUN npm ci --omit=dev --workspace=server
EXPOSE 3000
CMD ["node", "server/src/server.js"]
