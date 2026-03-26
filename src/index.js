require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const alertasRouter        = require('./routes/alertas');
const nutricionRouter      = require('./routes/nutricion');
const psicologiaRouter     = require('./routes/psicologia');
const trabajoSocialRouter  = require('./routes/trabajoSocial');
const farmaciaRouter       = require('./routes/farmacia');
const rehabilitacionRouter = require('./routes/rehabilitacion');
const authRouter           = require('./routes/auth');
const evaluacionesRouter   = require('./routes/evaluaciones');
const examenesRouter       = require('./routes/examenes');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(rateLimit({ windowMs: 60*1000, max: 200, standardHeaders: true, message: { error: 'Demasiadas solicitudes.' } }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1', alertasRouter);
app.use('/api/v1/evaluaciones', evaluacionesRouter);
app.use('/api/v1/pacientes', evaluacionesRouter);
app.use('/api/v1/examenes', examenesRouter);
app.use('/api/v1/rehabilitacion', rehabilitacionRouter);
app.use('/api/v1/nutricion', nutricionRouter);
app.use('/api/v1/psicologia', psicologiaRouter);
app.use('/api/v1/trabajo-social', trabajoSocialRouter);
app.use('/api/v1/farmacia', farmaciaRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sistema: 'PulmoLink INO', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.get('/fix-rehabilitacion', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    await pool.query('DROP TABLE IF EXISTS sesiones_rehabilitacion');
    await pool.query(`CREATE TABLE sesiones_rehabilitacion (
      id UUID PRIMARY KEY,
      paciente_id UUID NOT NULL,
      numero_sesion SMALLINT,
      fecha_sesion DATE,
      tipo_ejercicio VARCHAR(30),
      modalidad VARCHAR(40),
      intensidad_pct_c6m NUMERIC(5,1),
      tiempo_ejercicio_min SMALLINT,
      o2_suplementario NUMERIC(4,1) DEFAULT 0,
      progresion VARCHAR(30),
      spo2_pre NUMERIC(4,1), spo2_post NUMERIC(4,1),
      fc_pre SMALLINT, fc_post SMALLINT,
      pas_pre SMALLINT, pas_post SMALLINT,
      pad_pre SMALLINT, pad_post SMALLINT,
      fr_pre SMALLINT, fr_post SMALLINT,
      borg_disnea SMALLINT, borg_mmii SMALLINT,
      incidencia VARCHAR(40) DEFAULT 'no',
      incidencia_descripcion TEXT,
      observaciones TEXT,
      profesional_registro VARCHAR(120),
      sesion_completada VARCHAR(10) DEFAULT 'si',
      genera_alerta BOOLEAN DEFAULT FALSE,
      registrado_por UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sesiones_rhb_programadas SMALLINT DEFAULT 48');
    await pool.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sesiones_rhb_completadas SMALLINT DEFAULT 0');
    await pool.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fecha_inicio_rhb DATE');
    await pool.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tc6m_inicial_metros NUMERIC(5,1)');
    await pool.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tc6m_inicial_fecha DATE');
    return res.json({ ok: true, mensaje: 'Tabla recreada con todas las columnas' });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/registro.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard/index.html'));
});

app.get('/educacion', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/educacion/index.html'));
});

app.get('/farmacia', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/farmacia/index.html'));
});

app.get('/trabajo-social', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/trabajo-social/index.html'));
});

app.get('/psicologia', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/psicologia/index.html'));
});

app.get('/nutricion', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/nutricion/index.html'));
});

app.get('/rehabilitacion', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/rehabilitacion/index.html'));
});

app.get('/examenes', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/examenes/index.html'));
});

app.get('/riesgo', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/riesgo/index.html'));
});

app.get('/paciente', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/paciente/index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log('PulmoLink INO - API v1.0.0 - Puerto: ' + PORT);
});

module.exports = app;
