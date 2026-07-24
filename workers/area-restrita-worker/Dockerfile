FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
ENV AREA_RESTRITA_DATA_DIR=/data

RUN mkdir -p /data/chrome-profile

EXPOSE 3000

CMD ["npm", "start"]
