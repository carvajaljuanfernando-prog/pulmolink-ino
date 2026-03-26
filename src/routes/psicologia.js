// src/routes/psicologia.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query } = require('../config/db');
const { autenticar } = require('../middleware/auth');

// POST /api/v1/psicologia/valoracion
router.post('/valoracion', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'VALORACION_PSICOLOGICA','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    // Alerta si ideación suicida
    if (d.alerta_suicidio) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta','Ideación suicida detectada en IDB ítem 9 — Evaluación psicológica urgente requerida','pendiente',NOW())`,
        [uuidv4(), d.paciente_id]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /psicologia/valoracion]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/psicologia/sesion
router.post('/sesion', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'SESION_PSICOLOGICA','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    if (d.genera_alerta) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id, `Psicología — ${d.alerta_equipo}: sesión ${d.numero_sesion||''}`]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /psicologia/sesion]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/psicologia/historial/:pacienteId
router.get('/historial/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, accion, detalle, created_at FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion IN ('VALORACION_PSICOLOGICA','SESION_PSICOLOGICA')
         AND registro_id = $1
       ORDER BY created_at DESC LIMIT 30`,
      [req.params.pacienteId]
    );
    const registros = rows.map(r => ({
      id: r.id, accion: r.accion,
      detalle: typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle,
      created_at: r.created_at,
    }));
    return res.json({ registros });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
