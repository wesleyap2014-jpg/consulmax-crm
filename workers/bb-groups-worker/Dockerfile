FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PLAYWRIGHT_HEADLESS=true

EXPOSE 3000

CMD ["npm", "start"]
