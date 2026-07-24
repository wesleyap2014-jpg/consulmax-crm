FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    apache2-utils \
    ca-certificates \
    fluxbox \
    gettext-base \
    gnupg \
    nginx \
    novnc \
    websockify \
    wget \
    x11-utils \
    x11vnc \
    xvfb \
  && mkdir -p /usr/share/keyrings \
  && wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
    | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY scripts ./scripts
COPY config ./config

RUN chmod +x scripts/start-remote.sh

ENV NODE_ENV=production
ENV AREA_RESTRITA_DATA_DIR=/data
ENV AREA_RESTRITA_CHROME_BIN=/usr/bin/google-chrome-stable
ENV DISPLAY=:99

RUN mkdir -p /data/chrome-profile /run/area-restrita

EXPOSE 3000

CMD ["npm", "start"]