FROM node:22-alpine AS build
WORKDIR /app
ENV NPM_CONFIG_FETCH_TIMEOUT=60000 NPM_CONFIG_FETCH_RETRIES=1 NPM_CONFIG_AUDIT=false NPM_CONFIG_FUND=false
COPY package.json package-lock.json ./
COPY extensions/members-shopify-link/package.json ./extensions/members-shopify-link/package.json
COPY extensions/members-order-link/package.json ./extensions/members-order-link/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000
COPY package.json package-lock.json ./
COPY extensions/members-shopify-link/package.json ./extensions/members-shopify-link/package.json
COPY extensions/members-order-link/package.json ./extensions/members-order-link/package.json
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
CMD ["npm", "run", "start"]
