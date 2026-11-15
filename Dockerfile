# Purpose: Package the one-shot sync with locked production dependencies.
# Operational notes: CSVs and credentials are mounted/provided only at runtime.
FROM node:22-bookworm-slim AS dependencies
WORKDIR /usr/app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
FROM node:22-bookworm-slim
WORKDIR /usr/app
ENV NODE_ENV=production
COPY --from=dependencies --chown=node:node /usr/app/node_modules ./node_modules
COPY --chown=node:node package.json index.js start-service ./
COPY --chown=node:node lib ./lib
RUN mkdir -p /usr/app/auth && chown node:node /usr/app/auth && chmod 700 /usr/app/auth
USER node
CMD ["bash", "./start-service"]
