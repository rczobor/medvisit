# The on-prem demo's web server: the production build under `vite preview`,
# which also passes /convex through to the demo's own Convex backend. The
# image keeps the sources and dependencies, so it can also run the Convex CLI
# to deploy functions and seed synthetic data (README: On-prem demo).
FROM node:26.13.0-trixie-slim

RUN npm install --global pnpm@12.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN VITE_CONVEX_URL=/convex pnpm build

EXPOSE 3430
CMD ["pnpm", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "3430", "--strictPort"]
