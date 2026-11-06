# Stage 1: install everything and compile TypeScript to JavaScript.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: a small image with only what is needed to run.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Photos and private documents live on shared volumes mounted here; the app runs as "node", so it must own them
RUN mkdir -p /app/uploads /app/documents && chown node:node /app/uploads /app/documents
USER node
EXPOSE 4000
CMD ["node", "dist/api.js"]
