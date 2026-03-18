// src/index.js
// Servidor principal — PulmoLink INO API

require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');

const alertasRouter      = require('./routes/alertas');
const authRouter         = require('./routes/auth');
const evaluacionesRouter = require('./routes/evaluaciones');
const examenesRouter     = require('./routes/examenes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Seguridad ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
  credentials: true,
}));

// Rate limiting global: 100 req/min por IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  message: { error: 'Demasiadas solicitudes. Intenta en un momento.' },
}));

// Rate limiting estricto para reportes de síntomas: 30 req/min
const limiteReportes = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Límite de reportes alcanzado. Espera un momento.' },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rutas ────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/evaluaciones', evaluacionesRouter);
app.use('/api/v1/pacientes', evaluacionesRouter);
app.use('/api/v1/examenes', examenesRouter);
app.use('/api/v1', limiteReportes, alertasRouter);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sistema: 'PulmoLink INO',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});
app.get('/setup-db-ino-hp-2026', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const fs = require('fs'); const path = require('path');
    const { pool } = require('./config/db');
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(schema);
    return res.json({ status: 'ok', mensaje: 'Base de datos PulmoLink INO creada', tablas_creadas: 14 });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── Error handler global ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   PulmoLink INO — API v0.1.0                     ║
║   Programa Integral de Hipertensión Pulmonar      ║
║   Instituto Neumológico del Oriente               ║
╠══════════════════════════════════════════════════╣
║   Puerto: ${PORT}                                      ║
║   Entorno: ${(process.env.NODE_ENV || 'development').padEnd(38)}║
╚══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
