FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Montserrat ExtraBold (licencia SIL Open Font) para los subtítulos y los retos
COPY fonts/ /usr/share/fonts/truetype/montserrat/
RUN fc-cache -f && fc-list | grep -i "Montserrat ExtraBold"
WORKDIR /app
COPY package.json package-lock.json ./
# node-canvas (dibujo 2D del Motor B) trae sus binarios precompilados
RUN npm ci --omit=dev && node -e "require('canvas')"
COPY server.js render.js tools.js render-retos.js ./
COPY web/retos/ ./web/retos/
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
