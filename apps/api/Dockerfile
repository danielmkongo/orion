FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter=@orion/shared build
RUN pnpm --filter=@orion/api build

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@9
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN mkdir -p uploads firmware
EXPOSE 3001
CMD ["node", "dist/index.js"]
