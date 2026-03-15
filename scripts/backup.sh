#!/bin/sh
# ============================================================
# PulmoLink INO — Backup automático de PostgreSQL
# Se ejecuta diariamente a las 2am (configurado en Docker)
# Los backups se retienen por 30 días
# ============================================================

set -e

FECHA=$(date +"%Y%m%d_%H%M%S")
ARCHIVO="/backup/pulmolink_${FECHA}.sql.gz"
RETENCION_DIAS=30

echo "[$(date)] Iniciando backup de PulmoLink INO..."

# Crear backup comprimido
pg_dump \
  -h postgres \
  -U pulmolink_user \
  -d pulmolink \
  --no-password \
  --format=plain \
  --clean \
  --if-exists \
  | gzip > "$ARCHIVO"

TAMANO=$(du -sh "$ARCHIVO" | cut -f1)
echo "[$(date)] Backup completado: $ARCHIVO ($TAMANO)"

# Eliminar backups más antiguos que RETENCION_DIAS días
find /backup -name "pulmolink_*.sql.gz" -mtime +${RETENCION_DIAS} -delete
echo "[$(date)] Backups antiguos eliminados (retención: ${RETENCION_DIAS} días)"

# Listar backups disponibles
echo "[$(date)] Backups disponibles:"
ls -lh /backup/pulmolink_*.sql.gz 2>/dev/null || echo "  (ninguno)"

echo "[$(date)] Proceso completado exitosamente."
