// src/routes/nutricion.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query } = require('../config/db');
const { autenticar } = require('../middleware/auth');

// POST /api/v1/nutricion/valoracion
router.post('/valoracion', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'VALORACION_NUTRICIONAL','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    // Actualizar IMC en paciente si viene calculado
    if (d.imc) {
      await query(
        `UPDATE pacientes SET imc = $1 WHERE id = $2`,
        [d.imc, d.paciente_id]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /nutricion/valoracion]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/nutricion/valoraciones/:pacienteId
router.get('/valoraciones/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, detalle, created_at
       FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion = 'VALORACION_NUTRICIONAL'
         AND registro_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.params.pacienteId]
    );
    const valoraciones = rows.map(r => {
      const d = typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle;
      return { id: r.id, ...d, created_at: r.created_at };
    });
    return res.json({ valoraciones });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
