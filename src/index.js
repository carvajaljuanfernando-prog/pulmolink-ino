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
  res.json({ status: 'ok', sistema: 'PulmoLink INO', version: '0.1.0', timestamp: new Date().toISOString() });
});

app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/registro.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/setup-db-ino-hp-2026', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    const resultados = [];
    const tablas = [
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
      `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
      `CREATE TABLE IF NOT EXISTS profesionales (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), nombre VARCHAR(120) NOT NULL, apellido VARCHAR(120) NOT NULL, email VARCHAR(200) UNIQUE NOT NULL, password_hash TEXT NOT NULL, especialidad VARCHAR(100) NOT NULL, rol VARCHAR(50) NOT NULL, sede_ino VARCHAR(50) DEFAULT 'principal', mfa_secret TEXT, activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS cuidadores (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), nombre VARCHAR(120) NOT NULL, apellido VARCHAR(120) NOT NULL, email VARCHAR(200) UNIQUE NOT NULL, password_hash TEXT NOT NULL, telefono VARCHAR(20), relacion VARCHAR(60), activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS pacientes (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), consecutivo SERIAL, documento_tipo VARCHAR(20), documento_numero VARCHAR(40) UNIQUE, nombre VARCHAR(120) NOT NULL, segundo_nombre VARCHAR(120), apellido VARCHAR(120) NOT NULL, segundo_apellido VARCHAR(120), ciudad_residencia VARCHAR(100), estado_civil VARCHAR(30), ocupacion VARCHAR(100), estrato_socioeconomico SMALLINT, sexo VARCHAR(10), fecha_nacimiento DATE, edad SMALLINT, eps VARCHAR(120), comorbilidades_desc TEXT, hta BOOLEAN DEFAULT false, diabetes_mellitus BOOLEAN DEFAULT false, cancer BOOLEAN DEFAULT false, enfermedad_renal BOOLEAN DEFAULT false, epoc BOOLEAN DEFAULT false, asma BOOLEAN DEFAULT false, etv BOOLEAN DEFAULT false, enfermedad_coronaria BOOLEAN DEFAULT false, arritmia BOOLEAN DEFAULT false, insuficiencia_cardiaca BOOLEAN DEFAULT false, exposicion_biomasa BOOLEAN DEFAULT false, tabaquismo BOOLEAN DEFAULT false, grupo_hp_oms SMALLINT, clase_funcional_oms SMALLINT, riesgo_hp VARCHAR(20), cuidador_id UUID REFERENCES cuidadores(id), profesional_id UUID REFERENCES profesionales(id), canal_preferido VARCHAR(20) DEFAULT 'app', grupo_etario VARCHAR(20), email VARCHAR(200) UNIQUE, password_hash TEXT, activo BOOLEAN DEFAULT true, fecha_ingreso_prog DATE, consentimiento_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS examenes_diagnosticos (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, tipo VARCHAR(30) NOT NULL, fecha_examen DATE, ingresado_por UUID REFERENCES profesionales(id), clasif_fevi VARCHAR(30), fevi_pct NUMERIC(5,2), diam_vi_sistole NUMERIC(5,2), diam_vi_diastole NUMERIC(5,2), vol_auricula_izq NUMERIC(7,2), valvulopatia_aortica VARCHAR(40), valvulopatia_mitral VARCHAR(40), diam_vd_basal NUMERIC(5,2), diam_vd_medio NUMERIC(5,2), diam_vd_long NUMERIC(5,2), tapse NUMERIC(5,2), area_auricula_der NUMERIC(7,2), insuf_tricuspide VARCHAR(30), vel_regurg_tricusp NUMERIC(5,2), psap_eco NUMERIC(6,2), derrame_pericardico BOOLEAN DEFAULT false, defecto_interauricular BOOLEAN DEFAULT false, defecto_interventricular BOOLEAN DEFAULT false, otros_defectos_congen TEXT, presion_auricula_der NUMERIC(6,2), psap_cateterismo NUMERIC(6,2), pdap NUMERIC(6,2), pmap NUMERIC(6,2), pcap NUMERIC(6,2), pfdvd NUMERIC(6,2), sat_vena_cava_sup NUMERIC(5,2), sat_vena_cava_inf NUMERIC(5,2), sat_arteria_pulmonar NUMERIC(5,2), sat_auricula_izq NUMERIC(5,2), sat_aorta NUMERIC(5,2), sat_venosa_mixta NUMERIC(5,2), gasto_cardiaco NUMERIC(6,3), rvp NUMERIC(8,2), pa_sistolica_sist NUMERIC(6,2), pa_diastolica_sist NUMERIC(6,2), pa_media_sist NUMERIC(6,2), grupo_hp SMALLINT, clasificacion_riesgo VARCHAR(20), observaciones TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS evaluaciones (id UUID PRIMARY KEY DEFA
