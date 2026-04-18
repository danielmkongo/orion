FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ARG VITE_API_URL=/api/v1
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN pnpm install --frozen-lockfile
RUN pnpm --filter=@orion/shared build
RUN pnpm --filter=@orion/web build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
