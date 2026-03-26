// src/routes/farmacia.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query } = require('../config/db');
const { autenticar } = require('../middleware/auth');

// POST /api/v1/farmacia/perfil
router.post('/perfil', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'PERFIL_FARMACO','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    if (d.genera_alerta && d.interacciones_criticas?.length) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id,
         `Farmacia — Interacción crítica detectada: ${d.interacciones_criticas.join(', ')}`]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /farmacia/perfil]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/farmacia/dispensacion
router.post('/dispensacion', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'DISPENSACION','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    if (d.genera_alerta) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'media',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id,
         `Farmacia — Alerta suministro: ${d.alerta_suministro}`]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /farmacia/dispensacion]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/farmacia/control
router.post('/control', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'CONTROL_FARMACO','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    if (d.genera_alerta) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id,
         `Farmacia — Control: ${d.alerta_medico}`]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /farmacia/control]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/farmacia/historial/:pacienteId
router.get('/historial/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, accion, detalle, created_at FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion IN ('PERFIL_FARMACO','DISPENSACION','CONTROL_FARMACO')
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

// POST /api/v1/farmacia/treprostinil
router.post('/treprostinil', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'AJUSTE_TREPROSTINIL','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );
    if (d.genera_alerta) {
      const motivo = d.dosis_nueva > 40
        ? `Treprostinil SC — Dosis alta: ${d.dosis_nueva} ng/kg/min. Verificar con cardiólogo.`
        : `Treprostinil SC — Mala tolerancia al último incremento. Evaluar reducción.`;
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id, motivo]
      );
    }
    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /farmacia/treprostinil]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/farmacia/treprostinil/:pacienteId
router.get('/treprostinil/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, accion, detalle, created_at FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion = 'AJUSTE_TREPROSTINIL'
         AND registro_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.pacienteId]
    );
    const ajustes = rows.map(r => ({
      id: r.id,
      detalle: typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle,
      created_at: r.created_at,
    }));
    return res.json({ ajustes });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
