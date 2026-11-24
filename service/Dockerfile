FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./package.json
COPY src/translation.ts ./src/translation.ts
COPY service/src/ ./service/src/
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "service/src/server.ts"]
