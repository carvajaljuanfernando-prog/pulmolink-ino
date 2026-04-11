require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const path         = require('path');

const alertasRouter        = require('./routes/alertas');
const contactoEnfRouter    = require('./routes/contactoEnfermeria');
const nutricionRouter      = require('./routes/nutricion');
const psicologiaRouter     = require('./routes/psicologia');
const trabajoSocialRouter  = require('./routes/trabajoSocial');
const farmaciaRouter       = require('./routes/farmacia');
const juntasRouter         = require('./routes/juntas');
const adminRouter          = require('./routes/admin');
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
app.use('/api/v1/contacto-enfermeria', contactoEnfRouter);
app.use('/api/v1/evaluaciones', evaluacionesRouter);
app.use('/api/v1/pacientes', evaluacionesRouter);
app.use('/api/v1/examenes', examenesRouter);
app.use('/api/v1/rehabilitacion', rehabilitacionRouter);
app.use('/api/v1/nutricion', nutricionRouter);
app.use('/api/v1/psicologia', psicologiaRouter);
app.use('/api/v1/trabajo-social', trabajoSocialRouter);
app.use('/api/v1/farmacia', farmaciaRouter);
app.use('/api/v1/juntas', juntasRouter);
app.use('/api/v1/admin', adminRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sistema: 'PulmoLink INO', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.post('/api/v1/pacientes/crear', async (req, res) => {
  // Creación de paciente por profesional autenticado
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No autorizado' });
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const { pool } = require('./config/db');
    const d = req.body;
    if (!d.nombre || !d.apellido || !d.numero_documento) {
      return res.status(400).json({ error: 'Nombre, apellido y documento son obligatorios' });
    }
    // Verificar si ya existe
    const existe = await pool.query('SELECT id FROM pacientes WHERE numero_documento = $1', [d.numero_documento]);
    if (existe.rows.length) return res.status(400).json({ error: 'Ya existe un paciente con ese número de documento' });
    const id = uuidv4();
    const hash = await bcrypt.hash(d.numero_documento, 10);
    const email = d.email || d.numero_documento + '@pulmolink.ino';
    // Insertar campos básicos garantizados
    await pool.query(
      `INSERT INTO pacientes (id, nombre, apellido, email, password_hash, activo, created_at)
       VALUES ($1,$2,$3,$4,$5,true,NOW())`,
      [id, d.nombre, d.apellido, email, hash]
    );
    // Actualizar columnas extendidas
    const setCols = ['tipo_documento','numero_documento','fecha_nacimiento','sexo',
      'telefono','direccion','ciudad','departamento','eps','regimen','numero_afiliacion','diagnostico_hp',
      'grupo_hp_oms','clase_funcional_oms','fecha_ingreso_programa','medico_tratante',
      'sede_ino','antecedentes','observaciones_iniciales'];
    const vals = [
      d.tipo_documento||'CC', d.numero_documento||null, d.fecha_nacimiento||null,
      d.sexo||null, d.telefono||null, d.direccion||null,
      d.ciudad||null, d.departamento||null, d.eps||null,
      d.regimen||null, d.numero_afiliacion||null, d.diagnostico_hp||null,
      d.grupo_hp_oms||null, d.clase_funcional_oms||null,
      d.fecha_ingreso_programa||null, d.medico_tratante||null,
      d.sede||'principal', d.antecedentes||null, d.observaciones_iniciales||null
    ];
    const setClause = setCols.map((col, i) => col + '=$' + (i + 1)).join(', ');
    try {
      await pool.query(
        'UPDATE pacientes SET ' + setClause + ' WHERE id=$' + (setCols.length + 1),
        [...vals, id]
      );
    } catch(e) {
      console.warn('[UPDATE extended cols]', e.message);
    }
    return res.status(201).json({ ok: true, id, mensaje: 'Paciente creado correctamente' });
  } catch(err) {
    console.error('[POST /pacientes/crear]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/fix-eco-cols', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    const cols = [
      // VI
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS espesor_septum NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS espesor_pared_posterior NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS masa_ventricular NUMERIC(7,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS masa_ventricular_indexada NUMERIC(7,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS funcion_diastolica VARCHAR(60)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS relacion_e_e NUMERIC(5,2)",
      // VD ASE 2025
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS grosor_pared_vd NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS tapse_psap NUMERIC(6,3)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS fac_vd NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS tdi_s_prime NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS rvot_vti NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS tiempo_aceleracion_pulmonar NUMERIC(6,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS indice_excentricidad NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS rv_strain NUMERIC(5,2)",
      // AD ASE 2025
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS ravi NUMERIC(6,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS rap_estimada NUMERIC(4,1)",
      // Hemodinamica ASE 2025
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS probabilidad_hp_ase2025 VARCHAR(20)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS diam_arteria_pulmonar NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS razon_ap_ao NUMERIC(5,2)"
    ];
    const results = [];
    for (const sql of cols) {
      try { await pool.query(sql); results.push('OK: '+sql.split('ADD COLUMN IF NOT EXISTS ')[1]?.split(' ')[0]); }
      catch(e) { results.push('ERR: '+e.message); }
    }
    return res.json({ ok: true, results });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/fix-examenes-adicionales', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS examenes_adicionales_hp (
        id UUID PRIMARY KEY,
        paciente_id UUID NOT NULL,
        tipo_examen VARCHAR(40) NOT NULL,
        fecha_examen DATE,
        ingresado_por UUID,
        datos JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_exam_adic_pac ON examenes_adicionales_hp(paciente_id)`);
    return res.json({ ok: true, mensaje: 'Tabla examenes_adicionales_hp creada' });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/fix-contacto-enfermeria', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contactos_enfermeria (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        paciente_id UUID NOT NULL,
        fecha_contacto DATE,
        tipo_contacto VARCHAR(20),
        contacto_exitoso VARCHAR(20),
        enfermera VARCHAR(100),
        cf_oms INTEGER,
        fc NUMERIC(5,1),
        spo2 NUMERIC(5,1),
        ta VARCHAR(20),
        peso NUMERIC(5,1),
        peso_previo NUMERIC(5,1),
        fr NUMERIC(5,1),
        signos_alarma JSONB DEFAULT '[]',
        morisky_score INTEGER,
        morisky_respuestas JSONB,
        observaciones TEXT,
        plan TEXT,
        requiere_cita VARCHAR(20),
        prox_contacto DATE,
        alerta_generada BOOLEAN DEFAULT false,
        ingresado_por UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cont_enf_pac ON contactos_enfermeria(paciente_id)');
    return res.json({ ok: true, mensaje: 'Tabla contactos_enfermeria creada' });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/fix-cat-cols', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    const cols = [
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS indice_cardiaco NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS rvp_calculada NUMERIC(6,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS gtp NUMERIC(5,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS gdp NUMERIC(5,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS qp_qs NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS diagnostico_hemodinamico VARCHAR(500)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS vaso_realizado VARCHAR(20)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS vaso_agente VARCHAR(40)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS vaso_resultado VARCHAR(20)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS vaso_pmap_pre NUMERIC(5,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS vaso_pmap_post NUMERIC(5,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS vaso_gc_post NUMERIC(5,2)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS vaso_observaciones TEXT",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS carga_vol_realizada VARCHAR(10)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS carga_vol_volumen VARCHAR(20)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS carga_vol_pcap_pre NUMERIC(5,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS carga_vol_pcap_post NUMERIC(5,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS carga_vol_pmap_post NUMERIC(5,1)",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS carga_vol_observaciones TEXT",
      "ALTER TABLE examenes_diagnosticos ADD COLUMN IF NOT EXISTS observaciones_cat TEXT"
    ];
    const results = [];
    for (const sql of cols) {
      try { await pool.query(sql); results.push('OK: '+sql.split('ADD COLUMN IF NOT EXISTS ')[1]?.split(' ')[0]); }
      catch(e) { results.push('ERR: '+e.message); }
    }
    return res.json({ ok: true, results });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/fix-pacientes-cols', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    const cols = [
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10) DEFAULT 'CC'",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(30)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo VARCHAR(15)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS telefono VARCHAR(20)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS direccion TEXT",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS departamento VARCHAR(100)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS eps VARCHAR(80)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS regimen VARCHAR(20)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero_afiliacion VARCHAR(40)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS diagnostico_hp VARCHAR(120)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS grupo_hp_oms INTEGER",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS clase_funcional_oms INTEGER",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fecha_ingreso_programa DATE",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS medico_tratante VARCHAR(100)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sede_ino VARCHAR(40) DEFAULT 'principal'",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS antecedentes TEXT",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS observaciones_iniciales TEXT",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS clasificacion_riesgo VARCHAR(20)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo'",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS motivo_egreso VARCHAR(40)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fecha_egreso DATE",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS observaciones_egreso TEXT"
    ];
    const results = [];
    for (const sql of cols) {
      try { await pool.query(sql); results.push('OK: '+sql.split('ADD COLUMN IF NOT EXISTS ')[1]?.split(' ')[0]); }
      catch(e) { results.push('ERR: '+e.message); }
    }
    return res.json({ ok: true, results });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/fix-egreso-pacientes', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    const cols = [
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo'",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS motivo_egreso VARCHAR(40)",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fecha_egreso DATE",
      "ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS observaciones_egreso TEXT",
      "CREATE INDEX IF NOT EXISTS idx_pacientes_estado ON pacientes(estado)"
    ];
    for (const sql of cols) await pool.query(sql);
    return res.json({ ok: true, mensaje: 'Campos de egreso agregados' });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.get('/fix-admin', async (req, res) => {
  if (req.query.key !== 'pulmolink-ino-setup') return res.status(403).json({ error: 'No autorizado' });
  try {
    const { pool } = require('./config/db');
    const cols = [
      "ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS sede VARCHAR(40) DEFAULT 'principal'",
      "ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS especialidad VARCHAR(120)",
      "ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS registro_profesional VARCHAR(40)",
      "ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS sedes_adicionales JSONB DEFAULT '[]'",
      "ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMPTZ",
      "ALTER TABLE profesionales ADD COLUMN IF NOT EXISTS mfa_habilitado BOOLEAN DEFAULT false"
    ];
    for (const sql of cols) await pool.query(sql);
    return res.json({ ok: true, mensaje: 'Columnas admin agregadas' });
  } catch(err) { return res.status(500).json({ error: err.message }); }
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

app.get('/paciente-search.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, '../frontend/paciente-search.js'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
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

app.get('/dashboard-coordinador', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard-coordinador/index.html'));
});

app.get('/dashboard-profesional', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard-profesional/index.html'));
});

app.get('/pacientes-gestion', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pacientes-gestion/index.html'));
});

app.get('/ruta', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/ruta/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin/index.html'));
});

app.get('/juntas', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/juntas/index.html'));
});

app.get('/transicion-treprostinil', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/transicion-treprostinil/index.html'));
});

app.get('/treprostinil', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/treprostinil/index.html'));
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

app.get('/sesion-tiempo-real', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/sesion-tiempo-real/index.html'));
});

app.get('/perfil-paciente', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/perfil-paciente/index.html'));
});

app.get('/contacto-enfermeria', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/contacto-enfermeria/index.html'));
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
