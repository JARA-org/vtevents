FROM node:22.22.3-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22.22.3-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace=@gobbler/backend --include-workspace-root && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/apps/frontend/dist ./apps/frontend/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD node -e "fetch('http://localhost:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(async r=>{const h=await r.json();if(!r.ok||h.ok!==true||h.database!==true||h.accounts!==true)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/apps/backend/src/server.js"]
