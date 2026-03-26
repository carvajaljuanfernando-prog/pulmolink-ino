// src/routes/juntas.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query } = require('../config/db');
const { autenticar } = require('../middleware/auth');

// POST /api/v1/juntas
router.post('/', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'JUNTA_MEDICA','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify({ ...d, id })]
    );
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /juntas]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/juntas — todas las juntas (últimas 100)
router.get('/', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, registro_id as paciente_id, detalle, created_at
       FROM auditoria
       WHERE accion = 'JUNTA_MEDICA'
       ORDER BY created_at DESC
       LIMIT 100`
    );
    const juntas = rows.map(r => ({
      id: r.id,
      paciente_id: r.paciente_id,
      paciente_nombre: (typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle)?.paciente_nombre,
      detalle: typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle,
      created_at: r.created_at,
    }));
    return res.json({ juntas });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/juntas/:pacienteId
router.get('/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, detalle, created_at FROM auditoria
       WHERE accion = 'JUNTA_MEDICA' AND registro_id = $1
       ORDER BY created_at DESC`,
      [req.params.pacienteId]
    );
    const juntas = rows.map(r => ({
      id: r.id,
      detalle: typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle,
      created_at: r.created_at,
    }));
    return res.json({ juntas });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
