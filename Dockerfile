# ============================================================
# PulmoLink INO — Dockerfile multi-stage
# Etapa build: instala dependencias
# Etapa production: imagen mínima y segura
# ============================================================

# ── ETAPA 1: Dependencias ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Solo copiar package.json primero (cache de capas)
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# ── ETAPA 2: Producción ──────────────────────────────────────
FROM node:20-alpine AS production

# Metadatos
LABEL maintainer="PulmoLink INO <tech@ino.com.co>"
LABEL description="API Backend - Programa HP - Instituto Neumológico del Oriente"
LABEL version="0.4.0"

# Usuario no-root por seguridad
RUN addgroup -g 1001 -S pulmolink && \
    adduser -S -u 1001 -G pulmolink pulmolink

WORKDIR /app

# Copiar dependencias desde etapa anterior
COPY --from=deps --chown=pulmolink:pulmolink /app/node_modules ./node_modules

# Copiar código fuente
COPY --chown=pulmolink:pulmolink src/ ./src/
COPY --chown=pulmolink:pulmolink package.json ./

# Directorio de logs
RUN mkdir -p /app/logs && chown pulmolink:pulmolink /app/logs

# Cambiar a usuario no-root
USER pulmolink

# Puerto expuesto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Variables de entorno por defecto (se sobreescriben con .env)
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "src/index.js"]
