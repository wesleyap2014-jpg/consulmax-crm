FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    apache2-utils \
    fluxbox \
    gettext-base \
    nginx \
    novnc \
    websockify \
    x11vnc \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY scripts ./scripts
COPY config ./config

RUN chmod +x scripts/start-remote.sh

ENV NODE_ENV=production
ENV AREA_RESTRITA_DATA_DIR=/data
ENV DISPLAY=:99

RUN mkdir -p /data/chrome-profile /run/area-restrita

EXPOSE 3000

CMD ["npm", "start"]
