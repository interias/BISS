# Playwright image: Node plus the browsers for the e2e suite. Keep the tag in step
# with @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && pnpm install --frozen-lockfile
COPY . .

EXPOSE 2477
# compose bind-mounts the source over /app, so the build runs on start.
CMD ["sh", "-c", "pnpm build && exec pnpm start --hostname 0.0.0.0 --port 2477"]
