FROM node:20-alpine

LABEL description="PulmoLink INO - Programa HP"

RUN addgroup -g 1001 -S pulmolink && \
    adduser -S -u 1001 -G pulmolink pulmolink

WORKDIR /app

COPY package.json ./

RUN npm install --only=production && npm cache clean --force

COPY --chown=pulmolink:pulmolink src/ ./src/

RUN mkdir -p /app/logs && chown pulmolink:pulmolink /app/logs

USER pulmolink

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/index.js"]
