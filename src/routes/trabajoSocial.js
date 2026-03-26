// src/routes/trabajoSocial.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query } = require('../config/db');
const { autenticar } = require('../middleware/auth');

// POST /api/v1/trabajo-social/valoracion
router.post('/valoracion', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'VALORACION_TS','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    if (d.genera_alerta || d.vulneracion_derechos === 'si_activa') {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta','Trabajo Social — Vulneración de derechos detectada. Activar ruta de protección.','pendiente',NOW())`,
        [uuidv4(), d.paciente_id]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /trabajo-social/valoracion]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/trabajo-social/control
router.post('/control', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'CONTROL_TS','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    if (d.genera_alerta) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id, `Trabajo Social — Control ${d.numero_control||''}: ${d.alerta_equipo}`]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /trabajo-social/control]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/trabajo-social/historial/:pacienteId
router.get('/historial/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, accion, detalle, created_at FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion IN ('VALORACION_TS','CONTROL_TS')
         AND registro_id = $1
       ORDER BY created_at DESC LIMIT 20`,
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
