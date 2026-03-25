// src/routes/rehabilitacion.js
// Módulo de Rehabilitación Pulmonar HP — PulmoLink INO

const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query, transaction } = require('../config/db');
const { autenticar, requiereRol } = require('../middleware/auth');

// ══ POST /api/v1/rehabilitacion/sesion ════════════════════════
router.post('/sesion', autenticar, async (req, res) => {
  const { paciente_id, numero_sesion, fecha_sesion, tipo_ejercicio,
    modalidad, intensidad_pct_c6m, tiempo_ejercicio_min, o2_suplementario,
    progresion, spo2_pre, spo2_post, fc_pre, fc_post, pas_pre, pas_post,
    pad_pre, pad_post, fr_pre, fr_post, borg_disnea, borg_mmii,
    incidencia, incidencia_descripcion, observaciones,
    profesional_registro, sesion_completada, genera_alerta } = req.body;

  if (!paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });

  try {
    const id = uuidv4();
    await query(
      `INSERT INTO sesiones_rehabilitacion
        (id, paciente_id, numero_sesion, fecha_sesion, tipo_ejercicio,
         modalidad, intensidad_pct_c6m, tiempo_ejercicio_min, o2_suplementario,
         progresion, spo2_pre, spo2_post, fc_pre, fc_post,
         pas_pre, pas_post, pad_pre, pad_post, fr_pre, fr_post,
         borg_disnea, borg_mmii, incidencia, incidencia_descripcion,
         observaciones, profesional_registro, sesion_completada,
         genera_alerta, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
      [id, paciente_id, numero_sesion||null, fecha_sesion||null, tipo_ejercicio||null,
       modalidad||null, intensidad_pct_c6m||null, tiempo_ejercicio_min||null,
       o2_suplementario||0, progresion||null,
       spo2_pre||null, spo2_post||null, fc_pre||null, fc_post||null,
       pas_pre||null, pas_post||null, pad_pre||null, pad_post||null,
       fr_pre||null, fr_post||null,
       borg_disnea!=null?borg_disnea:null, borg_mmii!=null?borg_mmii:null,
       incidencia||'no', incidencia_descripcion||null,
       observaciones||null, profesional_registro||null,
       sesion_completada||'si', genera_alerta||false,
       req.usuario.id]
    );

    // Generar alerta si hay incidencia crítica
    if (genera_alerta) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), paciente_id,
         `Incidencia en rehabilitación — Sesión ${numero_sesion}: ${incidencia}`]
      );
    }

    // Actualizar conteo de sesiones en pacientes
    await query(
      `UPDATE pacientes SET
         sesiones_rhb_completadas = COALESCE(sesiones_rhb_completadas,0) + $1
       WHERE id = $2`,
      [sesion_completada === 'si' ? 1 : 0, paciente_id]
    );

    return res.status(201).json({ ok: true, id, sesion_completada });
  } catch(err) {
    console.error('[POST /rehabilitacion/sesion]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ══ POST /api/v1/rehabilitacion/evaluacion-inicial ═══════════
router.post('/evaluacion-inicial', autenticar, async (req, res) => {
  const { paciente_id, fecha_inicio, modalidad, sede, tipo_intervencion,
    fisioterapeuta, sesiones_programadas, tc6m_inicial,
    espirometria_inicial, cuestionarios_iniciales } = req.body;

  if (!paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });

  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'EVAL_INICIAL_RHB','sesiones_rehabilitacion',$2,$3)`,
      [req.usuario.id, paciente_id, JSON.stringify({
        fecha_inicio, modalidad, sede, tipo_intervencion, fisioterapeuta,
        sesiones_programadas, tc6m_inicial, espirometria_inicial, cuestionarios_iniciales
      })]
    );

    // Actualizar datos del paciente con TC6M y clase funcional
    if (tc6m_inicial?.metros) {
      await query(
        `UPDATE pacientes SET
           tc6m_inicial_metros = $1,
           tc6m_inicial_fecha = $2,
           sesiones_rhb_programadas = $3,
           fecha_inicio_rhb = $4
         WHERE id = $5`,
        [tc6m_inicial.metros, tc6m_inicial.fecha||null,
         sesiones_programadas||48, fecha_inicio||null, paciente_id]
      );
    }

    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /rehabilitacion/evaluacion-inicial]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ══ GET /api/v1/rehabilitacion/sesiones/:pacienteId ══════════
router.get('/sesiones/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM sesiones_rehabilitacion
       WHERE paciente_id = $1
       ORDER BY numero_sesion ASC, fecha_sesion ASC`,
      [req.params.pacienteId]
    );

    // Obtener sesiones programadas del paciente
    const { rows: pac } = await query(
      `SELECT sesiones_rhb_programadas FROM pacientes WHERE id = $1`,
      [req.params.pacienteId]
    );

    return res.json({
      sesiones: rows,
      sesiones_programadas: pac[0]?.sesiones_rhb_programadas || 48,
      total: rows.length,
    });
  } catch(err) {
    console.error('[GET /rehabilitacion/sesiones]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
