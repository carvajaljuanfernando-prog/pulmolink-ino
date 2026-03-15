# PulmoLink INO — Guía de Despliegue
## Instituto Neumológico del Oriente — Programa Integral HP

---

## Resumen rápido

```
git clone <repo> && cd pulmolink
cp .env.example .env        # Editar con valores reales
docker compose up -d        # Levantar todos los servicios
```

La plataforma queda disponible en `https://pulmolink.ino.com.co`

---

## Requisitos del servidor

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco | 50 GB SSD | 100 GB SSD |
| Sistema operativo | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Docker | 24+ | 24+ |
| Docker Compose | 2.20+ | 2.20+ |

**Opciones de proveedor cloud recomendadas para Colombia:**
- AWS (São Paulo `sa-east-1`) — menor latencia desde Bucaramanga
- Google Cloud (São Paulo `southamerica-east1`)
- DigitalOcean (New York — alternativa económica)

---

## Paso 1 — Preparar el servidor

```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verificar
docker --version
docker compose version
```

---

## Paso 2 — Configurar el dominio

Apunta tu dominio `pulmolink.ino.com.co` a la IP del servidor con un registro DNS tipo A.

Verifica que el dominio resuelva antes de continuar:
```bash
nslookup pulmolink.ino.com.co
```

---

## Paso 3 — Obtener certificado SSL (Let's Encrypt)

```bash
# Instalar Certbot
sudo apt install certbot -y

# Obtener certificado (el servidor debe estar accesible en puerto 80)
sudo certbot certonly --standalone -d pulmolink.ino.com.co

# Los certificados quedan en:
# /etc/letsencrypt/live/pulmolink.ino.com.co/fullchain.pem
# /etc/letsencrypt/live/pulmolink.ino.com.co/privkey.pem

# Copiarlos al directorio del proyecto
mkdir -p ~/pulmolink/nginx/ssl
sudo cp /etc/letsencrypt/live/pulmolink.ino.com.co/fullchain.pem ~/pulmolink/nginx/ssl/
sudo cp /etc/letsencrypt/live/pulmolink.ino.com.co/privkey.pem   ~/pulmolink/nginx/ssl/
sudo chown $USER:$USER ~/pulmolink/nginx/ssl/*
```

---

## Paso 4 — Clonar el proyecto y configurar variables

```bash
# Clonar el repositorio
git clone <URL_DEL_REPOSITORIO> ~/pulmolink
cd ~/pulmolink

# Configurar variables de entorno
cp .env.example .env
nano .env   # Editar todos los valores <CAMBIAR>
```

### Variables obligatorias a configurar:

```env
DB_PASSWORD=una_contraseña_muy_segura_minimo_20_chars
JWT_SECRET=     # node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_REFRESH_SECRET=   # mismo comando
```

### Variables opcionales (para notificaciones):
- `TWILIO_*` — para SMS a pacientes sin smartphone
- `FIREBASE_*` — para notificaciones push en la app móvil
- `SMTP_*` — para envío de emails

---

## Paso 5 — Copiar las interfaces al directorio correcto

```bash
# Crear directorios de frontend
mkdir -p ~/pulmolink/frontend/paciente
mkdir -p ~/pulmolink/frontend/dashboard

# Copiar los archivos HTML de interfaz
cp pulmolink-paciente.html  frontend/paciente/index.html
cp pulmolink-dashboard.html frontend/dashboard/index.html
```

---

## Paso 6 — Levantar la plataforma

```bash
cd ~/pulmolink

# Construir y levantar todos los servicios
docker compose up -d --build

# Ver logs en tiempo real
docker compose logs -f api

# Verificar que todos los servicios están corriendo
docker compose ps
```

**Salida esperada:**
```
NAME                   STATUS
pulmolink-api          running (healthy)
pulmolink-postgres     running (healthy)
pulmolink-redis        running (healthy)
pulmolink-nginx        running (healthy)
pulmolink-backup       running
```

---

## Paso 7 — Verificar el despliegue

```bash
# Health check de la API
curl https://pulmolink.ino.com.co/health

# Respuesta esperada:
# {"status":"ok","sistema":"PulmoLink INO","version":"0.4.0"}
```

---

## Paso 8 — Crear el primer usuario administrador

```bash
# Conectar a la base de datos
docker exec -it pulmolink-postgres psql -U pulmolink_user -d pulmolink

# Dentro de psql, registrar el primer profesional administrador:
# (Usar la API de registro una vez que el sistema esté corriendo)
\q
```

O usar el endpoint de registro con Postman/curl:
```bash
curl -X POST https://pulmolink.ino.com.co/api/v1/auth/registro/profesional \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN_ADMIN_INICIAL>" \
  -d '{
    "nombre": "Fabio",
    "apellido": "Bolívar Grimaldos",
    "email": "fbolivar@ino.com.co",
    "password": "Contraseña_Segura1!",
    "especialidad": "Neumología",
    "rol": "neumólogo",
    "sede_ino": "principal"
  }'
```

---

## Renovación automática del certificado SSL

```bash
# Agregar al crontab
(crontab -l 2>/dev/null; echo "0 3 * * 0 certbot renew --quiet && docker compose -f ~/pulmolink/docker-compose.yml restart nginx") | crontab -
```

---

## Monitoreo y mantenimiento

### Ver logs
```bash
docker compose logs api          # Logs de la API
docker compose logs postgres     # Logs de base de datos
docker compose logs nginx        # Logs de nginx (accesos y errores)
```

### Actualizar la aplicación
```bash
cd ~/pulmolink
git pull origin main
docker compose up -d --build api
```

### Backup manual
```bash
docker exec pulmolink-backup sh /backup.sh
```

### Restaurar backup
```bash
# Listar backups disponibles
ls ~/pulmolink/db/backup/

# Restaurar
gunzip < ~/pulmolink/db/backup/pulmolink_20240314_020000.sql.gz | \
  docker exec -i pulmolink-postgres psql -U pulmolink_user -d pulmolink
```

### Escalar la API (si aumenta la carga)
```bash
docker compose up -d --scale api=3
```

---

## Estructura de archivos del proyecto

```
pulmolink/
├── src/
│   ├── index.js                 # Servidor Express principal
│   ├── config/
│   │   └── db.js               # Conexión PostgreSQL
│   ├── middleware/
│   │   └── auth.js             # JWT + MFA
│   ├── routes/
│   │   ├── auth.js             # Login, registro, tokens
│   │   ├── alertas.js          # Reportes y alertas
│   │   └── evaluaciones.js     # SF-12, Morisky, OMS
│   └── services/
│       ├── alertEngine.js      # Motor de reglas clínicas
│       ├── authService.js      # Lógica de autenticación
│       └── evaluacionService.js # Cálculo SF-12, Morisky, OMS
├── db/
│   ├── schema.sql              # Esquema completo de BD
│   ├── migrate.js              # Ejecutar migraciones
│   └── seed.js                 # Datos de prueba (solo dev)
├── tests/
│   ├── alertEngine.test.js     # 29 tests del motor de alertas
│   ├── auth.test.js            # 22 tests de autenticación
│   └── evaluaciones.test.js    # 31 tests de evaluaciones
├── nginx/
│   └── nginx.conf              # Reverse proxy + SSL
├── scripts/
│   └── backup.sh               # Backup automático diario
├── frontend/
│   ├── paciente/               # App del paciente
│   └── dashboard/              # Dashboard equipo INO
├── .env.example                # Variables de entorno (plantilla)
├── .gitignore
├── docker-compose.yml          # Orquestación de servicios
├── Dockerfile                  # Imagen de la API
└── package.json
```

---

## Endpoints disponibles

| Método | Endpoint | Descripción | Autenticación |
|--------|----------|-------------|---------------|
| GET | `/health` | Estado del sistema | Pública |
| POST | `/api/v1/auth/registro/paciente` | Registrar paciente | Pública |
| POST | `/api/v1/auth/registro/profesional` | Registrar profesional | Admin |
| POST | `/api/v1/auth/login` | Login paso 1 | Pública |
| POST | `/api/v1/auth/login/mfa` | Login paso 2 (MFA) | Token temporal |
| POST | `/api/v1/auth/refresh` | Renovar token | Refresh token |
| POST | `/api/v1/auth/cambiar-password` | Cambiar contraseña | JWT |
| GET | `/api/v1/auth/me` | Perfil del usuario | JWT |
| POST | `/api/v1/reportes` | Reportar síntomas | JWT |
| GET | `/api/v1/alertas` | Panel de alertas | JWT + Rol |
| PATCH | `/api/v1/alertas/:id` | Actualizar alerta | JWT + Rol |
| GET | `/api/v1/alertas/:id` | Detalle de alerta | JWT + Rol |
| GET | `/api/v1/evaluaciones/sf12/preguntas` | Cuestionario SF-12 | JWT |
| POST | `/api/v1/evaluaciones/sf12/:pacienteId` | Guardar SF-12 | JWT |
| GET | `/api/v1/evaluaciones/morisky8/preguntas` | Cuestionario Morisky | JWT |
| POST | `/api/v1/evaluaciones/morisky8/:pacienteId` | Guardar Morisky | JWT |
| GET | `/api/v1/evaluaciones/clase-oms/preguntas` | Cuestionario OMS | JWT |
| POST | `/api/v1/evaluaciones/clase-oms/:pacienteId` | Guardar clase OMS | JWT |
| GET | `/api/v1/pacientes/:id/evaluaciones` | Historial | JWT |
| GET | `/api/v1/pacientes/:id` | Perfil completo | JWT |

---

## Soporte técnico

Para dudas sobre el despliegue o configuración del sistema,
contactar al equipo técnico del proyecto PulmoLink INO.

**Instituto Neumológico del Oriente**
Cll 53 # 31-30, Bucaramanga, Santander
PBX: 607 697 2473 | www.ino.com.co
