FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

ENV PLAYWRIGHT_HEADLESS=true
ENV EMBRACON_ROBOT_PORTAL_URL=https://www.convertmais.com.br/AdminConvertMais/ConvertMaisWeb/login/

CMD ["node", "scripts/run-access-check.mjs"]
