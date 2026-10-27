FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-montserrat fontconfig ca-certificates \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY server.js render.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
