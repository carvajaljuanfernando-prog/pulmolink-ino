// db/migrate.js
// Ejecutar el schema SQL en la base de datos
// Uso: node db/migrate.js
// En producción esto lo hace Docker automáticamente

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME     || 'pulmolink',
    user:     process.env.DB_USER     || 'pulmolink_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔄 Conectando a la base de datos...');
    const client = await pool.connect();

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📋 Aplicando schema de PulmoLink INO...');
    await client.query(schema);

    console.log('✅ Migración completada exitosamente.');
    console.log('   Tablas creadas:');

    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    rows.forEach(r => console.log(`   - ${r.tablename}`));

    client.release();
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
