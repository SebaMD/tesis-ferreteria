# -- Etapa de Desarrollo --
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "start"]

# -- Etapa de Producción --
FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./

# Define entorno de producción
ENV NODE_ENV=production

# Instala dependencias ignorando devDependencies
RUN npm ci --omit=dev

COPY . .

USER node

EXPOSE 3000
CMD ["node", "src/index.js"]