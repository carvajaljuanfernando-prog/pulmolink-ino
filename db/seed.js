// db/seed.js
// Datos de prueba para desarrollo — NO ejecutar en producción
// Uso: node db/seed.js
// Crea: 1 admin INO, 3 profesionales, 5 pacientes de prueba

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'pulmolink',
  user:     process.env.DB_USER     || 'pulmolink_user',
  password: process.env.DB_PASSWORD || '',
});

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🌱 Iniciando carga de datos de prueba — PulmoLink INO...');
    console.log('⚠️  SOLO para ambiente de desarrollo\n');

    await client.query('BEGIN');

    const PASS_HASH = await bcrypt.hash('PulmoLink2024!', 12);

    // ── PROFESIONALES DE PRUEBA ──────────────────────────────
    const profIds = {};

    const profesionales = [
      { nombre: 'Fabio', apellido: 'Bolívar Grimaldos',  email: 'fbolivar@ino.com.co',  rol: 'neumólogo',    especialidad: 'Neumología adultos', sede: 'principal' },
      { nombre: 'Luz Libia', apellido: 'Cala Vecino',    email: 'lcala@ino.com.co',      rol: 'neumólogo',    especialidad: 'Neumología pediátrica', sede: 'principal' },
      { nombre: 'María', apellido: 'Rodríguez Torres',   email: 'mrodriguez@ino.com.co', rol: 'enfermería',   especialidad: 'Gestora Programa HP', sede: 'principal' },
    ];

    for (const p of profesionales) {
      const id = uuidv4();
      profIds[p.email] = id;
      await client.query(
        `INSERT INTO profesionales
          (id, nombre, apellido, email, password_hash, especialidad, rol, sede_ino, mfa_secret)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (email) DO NOTHING`,
        [id, p.nombre, p.apellido, p.email, PASS_HASH,
         p.especialidad, p.rol, p.sede, 'JBSWY3DPEHPK3PXP']
      );
      console.log(`  ✓ Profesional: ${p.nombre} ${p.apellido} (${p.rol})`);
    }

    // ── PACIENTES DE PRUEBA ──────────────────────────────────
    const pacientes = [
      {
        nombre: 'Rosa Elena', apellido: 'Vargas Pérez',
        email: 'rvargas@test.com', fnac: '1966-03-20',
        diagnostico: 'HAP Idiopática — Grupo 1', grupo_hp: 1, clase_oms: 2,
        canal: 'app', profesional: 'fbolivar@ino.com.co',
      },
      {
        nombre: 'Hernán Darío', apellido: 'Cárdenas Montoya',
        email: 'hcardenas@test.com', fnac: '1979-07-14',
        diagnostico: 'HP Tromboembólica Crónica — Grupo 4', grupo_hp: 4, clase_oms: 3,
        canal: 'app', profesional: 'fbolivar@ino.com.co',
      },
      {
        nombre: 'Valentina', apellido: 'Ríos Gutiérrez',
        email: 'vrios@test.com', fnac: '2010-11-05',
        diagnostico: 'HAP asociada a cardiopatía congénita', grupo_hp: 1, clase_oms: 2,
        canal: 'app', profesional: 'lcala@ino.com.co',
      },
      {
        nombre: 'Jorge Iván', apellido: 'Medina Suárez',
        email: 'jmedina@test.com', fnac: '1957-09-30',
        diagnostico: 'HP asociada a EPOC — Grupo 3', grupo_hp: 3, clase_oms: 3,
        canal: 'sms', profesional: 'fbolivar@ino.com.co',
      },
      {
        nombre: 'Claudia Patricia', apellido: 'Niño Ramírez',
        email: 'cnino@test.com', fnac: '1985-02-18',
        diagnostico: 'HAP Idiopática — Grupo 1', grupo_hp: 1, clase_oms: 2,
        canal: 'app', profesional: 'fbolivar@ino.com.co',
      },
    ];

    const pacIds = {};
    for (const p of pacientes) {
      const id = uuidv4();
      pacIds[p.email] = id;
      const hoy = new Date();
      const fnac = new Date(p.fnac);
      const años = Math.floor((hoy - fnac) / (365.25 * 24 * 60 * 60 * 1000));
      const grupo = años < 13 ? 'pediatrico' : años < 18 ? 'adolescente' : años < 65 ? 'adulto' : 'adulto_mayor';

      await client.query(
        `INSERT INTO pacientes
          (id, nombre, apellido, email, password_hash, fecha_nacimiento,
           grupo_etario, diagnostico_hp, grupo_hp_oms, clase_funcional_oms,
           canal_preferido, profesional_id, fecha_ingreso_prog, consentimiento_at, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,NOW(),true)
         ON CONFLICT (email) DO NOTHING`,
        [id, p.nombre, p.apellido, p.email, PASS_HASH, p.fnac,
         grupo, p.diagnostico, p.grupo_hp, p.clase_oms,
         p.canal, profIds[p.profesional]]
      );
      console.log(`  ✓ Paciente: ${p.nombre} ${p.apellido} (${grupo}, Clase OMS ${p.clase_oms})`);
    }

    // ── MEDICAMENTOS DE PRUEBA ───────────────────────────────
    const meds = [
      { pac: 'rvargas@test.com', nombre: 'Sildenafilo', clase: 'inh_pde5', dosis: '25 mg', frecuencia: '3 veces/día — 8am, 2pm, 8pm', via: 'oral' },
      { pac: 'rvargas@test.com', nombre: 'Bosentán',    clase: 'antagonista_endotelina', dosis: '62.5 mg', frecuencia: '2 veces/día — 8am, 8pm', via: 'oral' },
      { pac: 'hcardenas@test.com', nombre: 'Riociguate', clase: 'otro', dosis: '1 mg', frecuencia: '3 veces/día', via: 'oral' },
      { pac: 'jmedina@test.com', nombre: 'Ambrisentán', clase: 'antagonista_endotelina', dosis: '5 mg', frecuencia: '1 vez/día — mañana', via: 'oral' },
    ];

    for (const m of meds) {
      await client.query(
        `INSERT INTO medicamentos (id, paciente_id, nombre, clase, dosis, frecuencia, via, activo, fecha_inicio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,CURRENT_DATE)`,
        [uuidv4(), pacIds[m.pac], m.nombre, m.clase, m.dosis, m.frecuencia, m.via]
      );
    }
    console.log(`  ✓ ${meds.length} medicamentos cargados`);

    await client.query('COMMIT');

    console.log('\n✅ Datos de prueba cargados exitosamente.\n');
    console.log('Credenciales de acceso (desarrollo):');
    console.log('  Contraseña universal: PulmoLink2024!');
    console.log('  MFA TOTP (usar: https://totp.app): JBSWY3DPEHPK3PXP\n');
    console.log('  Profesionales:');
    profesionales.forEach(p => console.log(`    - ${p.email} (${p.rol})`));
    console.log('  Pacientes:');
    pacientes.forEach(p => console.log(`    - ${p.email}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.env.NODE_ENV === 'production') {
  console.error('❌ NO ejecutar seed en producción.');
  process.exit(1);
}

seed();
