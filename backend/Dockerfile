# -- Base --
FROM node:22-alpine AS base

WORKDIR /app

# -- Etapa de Desarrollo --
FROM base AS development

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]

# -- Etapa de Build --
FROM base AS build

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# -- Etapa de Producción --
FROM base AS production

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
