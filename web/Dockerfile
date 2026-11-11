# The Feasto web app for deployment (see DEPLOY.md). Built once, then run as a small Node server.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked into the build: where /api and /uploads are forwarded (Nginx inside Docker), and the map key
ARG API_URL=http://nginx
ARG NEXT_PUBLIC_MAPBOX_TOKEN=""
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 API_URL=$API_URL NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
