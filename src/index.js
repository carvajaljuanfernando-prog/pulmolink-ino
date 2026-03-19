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
const path2 = require('path');
app.get('/registro', (req, res) => {
  res.sendFile(path2.join(__dirname, '../frontend/registro.html'));
});
app.use(express.static(path2.join(__dirname, '../frontend')));
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
    const { pool } = require('./config/db');
    const resultados = [];
    const tablas = [
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
      `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
      `CREATE TABLE IF NOT EXISTS profesionales (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), nombre VARCHAR(120) NOT NULL, apellido VARCHAR(120) NOT NULL, email VARCHAR(200) UNIQUE NOT NULL, password_hash TEXT NOT NULL, especialidad VARCHAR(100) NOT NULL, rol VARCHAR(50) NOT NULL, sede_ino VARCHAR(50) DEFAULT 'principal', mfa_secret TEXT, activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS cuidadores (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), nombre VARCHAR(120) NOT NULL, apellido VARCHAR(120) NOT NULL, email VARCHAR(200) UNIQUE NOT NULL, password_hash TEXT NOT NULL, telefono VARCHAR(20), relacion VARCHAR(60), activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS pacientes (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), consecutivo SERIAL, documento_tipo VARCHAR(20), documento_numero VARCHAR(40) UNIQUE, nombre VARCHAR(120) NOT NULL, segundo_nombre VARCHAR(120), apellido VARCHAR(120) NOT NULL, segundo_apellido VARCHAR(120), ciudad_residencia VARCHAR(100), estado_civil VARCHAR(30), ocupacion VARCHAR(100), estrato_socioeconomico SMALLINT, sexo VARCHAR(10), fecha_nacimiento DATE, edad SMALLINT, eps VARCHAR(120), comorbilidades_desc TEXT, hta BOOLEAN DEFAULT false, diabetes_mellitus BOOLEAN DEFAULT false, cancer BOOLEAN DEFAULT false, enfermedad_renal BOOLEAN DEFAULT false, epoc BOOLEAN DEFAULT false, asma BOOLEAN DEFAULT false, etv BOOLEAN DEFAULT false, enfermedad_coronaria BOOLEAN DEFAULT false, arritmia BOOLEAN DEFAULT false, insuficiencia_cardiaca BOOLEAN DEFAULT false, exposicion_biomasa BOOLEAN DEFAULT false, tabaquismo BOOLEAN DEFAULT false, grupo_hp_oms SMALLINT, clase_funcional_oms SMALLINT, riesgo_hp VARCHAR(20), cuidador_id UUID REFERENCES cuidadores(id), profesional_id UUID REFERENCES profesionales(id), canal_preferido VARCHAR(20) DEFAULT 'app', grupo_etario VARCHAR(20), email VARCHAR(200) UNIQUE, password_hash TEXT, activo BOOLEAN DEFAULT true, fecha_ingreso_prog DATE, consentimiento_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS examenes_diagnosticos (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, tipo VARCHAR(30) NOT NULL, fecha_examen DATE, ingresado_por UUID REFERENCES profesionales(id), clasif_fevi VARCHAR(30), fevi_pct NUMERIC(5,2), diam_vi_sistole NUMERIC(5,2), diam_vi_diastole NUMERIC(5,2), vol_auricula_izq NUMERIC(7,2), valvulopatia_aortica VARCHAR(40), valvulopatia_mitral VARCHAR(40), diam_vd_basal NUMERIC(5,2), diam_vd_medio NUMERIC(5,2), diam_vd_long NUMERIC(5,2), tapse NUMERIC(5,2), area_auricula_der NUMERIC(7,2), insuf_tricuspide VARCHAR(30), vel_regurg_tricusp NUMERIC(5,2), psap_eco NUMERIC(6,2), derrame_pericardico BOOLEAN DEFAULT false, defecto_interauricular BOOLEAN DEFAULT false, defecto_interventricular BOOLEAN DEFAULT false, otros_defectos_congen TEXT, presion_auricula_der NUMERIC(6,2), psap_cateterismo NUMERIC(6,2), pdap NUMERIC(6,2), pmap NUMERIC(6,2), pcap NUMERIC(6,2), pfdvd NUMERIC(6,2), sat_vena_cava_sup NUMERIC(5,2), sat_vena_cava_inf NUMERIC(5,2), sat_arteria_pulmonar NUMERIC(5,2), sat_auricula_izq NUMERIC(5,2), sat_aorta NUMERIC(5,2), sat_venosa_mixta NUMERIC(5,2), gasto_cardiaco NUMERIC(6,3), rvp NUMERIC(8,2), pa_sistolica_sist NUMERIC(6,2), pa_diastolica_sist NUMERIC(6,2), pa_media_sist NUMERIC(6,2), grupo_hp SMALLINT, clasificacion_riesgo VARCHAR(20), observaciones TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS evaluaciones (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, tipo VARCHAR(30) NOT NULL, momento VARCHAR(10) DEFAULT 'seguimiento', respuestas JSONB NOT NULL, pct_salud_fisica NUMERIC(5,2), puntaje_pcs NUMERIC(5,2), pct_salud_mental NUMERIC(5,2), puntaje_mcs NUMERIC(5,2), pct_salud_total NUMERIC(5,2), puntaje_total NUMERIC(5,2), clase_funcional SMALLINT, puntaje_morisky SMALLINT, clasificacion VARCHAR(40), cambio_pcs NUMERIC(5,2), cambio_cualit_pcs VARCHAR(20), cambio_mcs NUMERIC(5,2), cambio_cualit_mcs VARCHAR(20), cambio_cv_total NUMERIC(5,2), cambio_cualit_total VARCHAR(20), cambio_clase_funcional SMALLINT, cambio_cualit_cf VARCHAR(20), aplicada_at TIMESTAMPTZ DEFAULT NOW(), aplicada_por VARCHAR(20) DEFAULT 'paciente', observaciones TEXT)`,
      `CREATE TABLE IF NOT EXISTS medicamentos (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, nombre VARCHAR(150) NOT NULL, es_ipde5 BOOLEAN DEFAULT false, es_era BOOLEAN DEFAULT false, es_riociguat BOOLEAN DEFAULT false, es_prostaciclina BOOLEAN DEFAULT false, es_anticoagulante BOOLEAN DEFAULT false, es_broncodilatador BOOLEAN DEFAULT false, es_diuretico BOOLEAN DEFAULT false, es_oxigeno BOOLEAN DEFAULT false, clase VARCHAR(100), dosis VARCHAR(80), frecuencia VARCHAR(80), via VARCHAR(40), activo BOOLEAN DEFAULT true, fecha_inicio DATE, fecha_fin DATE, prescrito_por UUID REFERENCES profesionales(id), notas TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS sesiones_rehabilitacion (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, profesional_id UUID REFERENCES profesionales(id), modalidad VARCHAR(20) NOT NULL, numero_sesion SMALLINT, total_sesiones SMALLINT, porcentaje_trpe NUMERIC(5,2), completitud NUMERIC(5,2), fecha DATE NOT NULL, duracion_min SMALLINT, borg_score SMALLINT, asistio BOOLEAN DEFAULT true, incidencias TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS reportes_sintomas (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, disnea_escala SMALLINT, edema VARCHAR(20), sincope BOOLEAN DEFAULT false, hemoptisis BOOLEAN DEFAULT false, dolor_toracico BOOLEAN DEFAULT false, spo2 SMALLINT, efecto_adverso BOOLEAN DEFAULT false, efecto_adverso_desc TEXT, notas TEXT, foto_url TEXT, reportado_por VARCHAR(20) DEFAULT 'paciente', created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS alertas (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, reporte_id UUID REFERENCES reportes_sintomas(id), nivel VARCHAR(10) NOT NULL, motivo VARCHAR(300) NOT NULL, profesional_notif_id UUID REFERENCES profesionales(id), estado VARCHAR(20) DEFAULT 'pendiente', notificado_at TIMESTAMPTZ, vista_at TIMESTAMPTZ, respondida_at TIMESTAMPTZ, resuelta_at TIMESTAMPTZ, resolucion TEXT, escalada_at TIMESTAMPTZ, escalada_a UUID REFERENCES profesionales(id), created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS recordatorios (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, tipo VARCHAR(30) NOT NULL, descripcion VARCHAR(200), cron_expr VARCHAR(60), fecha_puntual TIMESTAMPTZ, canal VARCHAR(20) DEFAULT 'app', activo BOOLEAN DEFAULT true, ultima_env_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS mensajes (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), alerta_id UUID REFERENCES alertas(id), de_tipo VARCHAR(20) NOT NULL, de_id UUID NOT NULL, para_tipo VARCHAR(20) NOT NULL, para_id UUID NOT NULL, contenido TEXT NOT NULL, leido BOOLEAN DEFAULT false, leido_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS contenido_educativo (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), modulo VARCHAR(5) NOT NULL, unidad VARCHAR(10) NOT NULL, titulo VARCHAR(200) NOT NULL, grupo_etario VARCHAR(20) NOT NULL, formato VARCHAR(30), url_recurso TEXT, obligatorio BOOLEAN DEFAULT false, validado BOOLEAN DEFAULT false, validado_por UUID REFERENCES profesionales(id), validado_at TIMESTAMPTZ, version SMALLINT DEFAULT 1, activo BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS consumo_educativo (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE, contenido_id UUID NOT NULL REFERENCES contenido_educativo(id), completitud NUMERIC(5,2) DEFAULT 0, primer_acceso TIMESTAMPTZ DEFAULT NOW(), ultimo_acceso TIMESTAMPTZ DEFAULT NOW(), UNIQUE(paciente_id, contenido_id))`,
      `CREATE TABLE IF NOT EXISTS auditoria (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), usuario_tipo VARCHAR(20), usuario_id UUID, accion VARCHAR(100), tabla VARCHAR(60), registro_id UUID, ip_origen INET, detalle JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`
    ];
    for (const sql of tablas) {
      try {
        await pool.query(sql);
        const nombre = sql.includes('CREATE TABLE') ? sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] : sql.match(/CREATE EXTENSION.*"(\w+)"/)?.[1];
        resultados.push({ ok: true, tabla: nombre });
      } catch(e) {
        resultados.push({ ok: false, tabla: sql.substring(0,60), error: e.message });
      }
    }
    const errores = resultados.filter(r => !r.ok);
    return res.json({ status: errores.length === 0 ? 'ok' : 'parcial', tablas_creadas: resultados.filter(r=>r.ok).length, errores, detalle: resultados });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.get('/crear-admin-ino-2026', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { registrarProfesional } = require('./services/authService');
    const resultado = await registrarProfesional({
      nombre:       req.query.nombre      || 'Juan Fernando',
      apellido:     req.query.apellido    || 'Carvajal',
      email:        req.query.email       || 'jcarvajal@ino.com.co',
      password:     req.query.password    || 'PulmoLink2026!',
      especialidad: req.query.especialidad|| 'Cardiología',
      rol:          req.query.rol         || 'cardiólogo',
      sede_ino:     'principal',
    });
    return res.json({ ok: true, profesional: resultado.profesional, mfa_secret: resultado.mfa });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
```

Commit → espera redeploy → abre esta URL con tus datos reales:
```
https://pulmolink-ino-production.up.railway.app/crear-admin-ino-2026?key=pulmolink-ino-setup&nombre=Juan Fernando&apellido=Carvajal&email=tucorreo@ino.com.co&password=TuClave2026!&especialidad=Cardiología&rol=cardiólogo
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
