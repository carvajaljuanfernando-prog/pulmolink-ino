require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const alertasRouter      = require('./routes/alertas');
const authRouter         = require('./routes/auth');
const evaluacionesRouter = require('./routes/evaluaciones');
const examenesRouter     = require('./routes/examenes');

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sistema: 'PulmoLink INO', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.get('/fix-tabla-pacientes', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    const fixes = [
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS telefono VARCHAR(30)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo VARCHAR(10)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS eps VARCHAR(120)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ciudad_residencia VARCHAR(100)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS segundo_nombre VARCHAR(120)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS segundo_apellido VARCHAR(120)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estrato_socioeconomico SMALLINT',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estado_civil VARCHAR(30)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ocupacion VARCHAR(100)',
      'ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS diagnostico_hp VARCHAR(200)',
    ];
    const resultados = [];
    for (const sql of fixes) {
      try {
        await pool.query(sql);
        resultados.push({ ok: true, col: sql.split('EXISTS ')[1].split(' ')[0] });
      } catch(e) {
        resultados.push({ ok: false, col: sql.split('EXISTS ')[1].split(' ')[0], error: e.message });
      }
    }
    return res.json({ status: 'ok', columnas_agregadas: resultados.filter(r=>r.ok).length, resultados });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/registro.html'));
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
