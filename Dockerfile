FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install production deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app source
COPY server.js index.html styles.css app.js ads.txt ./
COPY assets ./assets

# Cloud Run provides PORT; default is fine for local
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
