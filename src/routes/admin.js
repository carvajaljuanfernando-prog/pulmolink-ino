// src/routes/admin.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query } = require('../config/db');
const { autenticar, requiereRol } = require('../middleware/auth');

const soloAdmin = requiereRol('admin','cardiólogo','coordinador','medico');

// GET /api/v1/admin/usuarios
router.get('/usuarios', autenticar, soloAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, apellido, email, rol, sede, especialidad,
              registro_profesional, sedes_adicionales, activo,
              ultimo_acceso, created_at
       FROM profesionales
       ORDER BY nombre, apellido`
    );
    return res.json({ usuarios: rows });
  } catch(err) {
    console.error('[GET /admin/usuarios]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/admin/usuarios — crear usuario sin MFA
router.post('/usuarios', autenticar, soloAdmin, async (req, res) => {
  const { nombre, apellido, email, password, rol, sede,
          especialidad, registro_profesional, sedes_adicionales } = req.body;
  if (!nombre || !apellido || !email || !password)
    return res.status(400).json({ error: 'nombre, apellido, email y password son requeridos' });
  if (password.length < 8)
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });
  try {
    const existe = await query('SELECT id FROM profesionales WHERE email = $1', [email]);
    if (existe.rows.length) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    await query(
      `INSERT INTO profesionales
        (id, nombre, apellido, email, password_hash, rol, sede,
         especialidad, registro_profesional, sedes_adicionales,
         mfa_habilitado, activo, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,true,NOW())`,
      [id, nombre, apellido, email, hash,
       rol || 'medico', sede || 'principal',
       especialidad || null, registro_profesional || null,
       JSON.stringify(sedes_adicionales || [])]
    );
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /admin/usuarios]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/admin/usuarios/:id — editar usuario
router.put('/usuarios/:id', autenticar, soloAdmin, async (req, res) => {
  const { nombre, apellido, rol, sede, especialidad } = req.body;
  try {
    await query(
      `UPDATE profesionales SET
         nombre=$1, apellido=$2, rol=$3, sede=$4, especialidad=$5
       WHERE id=$6`,
      [nombre, apellido, rol, sede, especialidad, req.params.id]
    );
    return res.json({ ok: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/admin/usuarios/:id/password
router.put('/usuarios/:id/password', autenticar, soloAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres' });
  try {
    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE profesionales SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    return res.json({ ok: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/admin/usuarios/:id/estado
router.put('/usuarios/:id/estado', autenticar, soloAdmin, async (req, res) => {
  const { activo } = req.body;
  try {
    await query('UPDATE profesionales SET activo=$1 WHERE id=$2', [activo, req.params.id]);
    return res.json({ ok: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
