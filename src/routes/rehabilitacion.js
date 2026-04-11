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
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });

  try {
    const id = uuidv4();
    await query(
      `INSERT INTO sesiones_rehabilitacion
        (id, paciente_id, numero_sesion, fecha_sesion, tipo_ejercicio,
         modalidad, meta_fc, intensidad_pct_c6m, tiempo_ejercicio_min,
         o2_suplementario, o2_lpm, progresion,
         cont_tiempo, cont_inclinacion, cont_velocidad, cont_rpm,
         interv_tiempo, interv_inclinacion, interv_velocidad, interv_rpm,
         peso_mmss, peso_mmii,
         fc_pre, fc_dur, fc_post,
         ta_pre, ta_dur, ta_post,
         spo2_pre, spo2_dur, spo2_post,
         disnea_pre, disnea_dur, borg_disnea,
         fatiga_pre, fatiga_dur, borg_mmii,
         fr_pre, fr_dur, fr_post,
         incidencia, incidencia_descripcion, observaciones,
         profesional_registro, sesion_completada,
         genera_alerta, registrado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
               $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,
               $45,$46,$47,$48)`,
      [id, d.paciente_id, d.numero_sesion||null, d.fecha_sesion||null, d.tipo_ejercicio||null,
       d.modalidad||null, d.meta_fc||null, d.intensidad_pct_c6m||null, d.tiempo_ejercicio_min||null,
       d.o2_suplementario||false, d.o2_lpm||null, d.progresion||null,
       d.cont_tiempo||null, d.cont_inclinacion||null, d.cont_velocidad||null, d.cont_rpm||null,
       d.interv_tiempo||null, d.interv_inclinacion||null, d.interv_velocidad||null, d.interv_rpm||null,
       d.peso_mmss||null, d.peso_mmii||null,
       d.fc_pre||null, d.fc_dur||null, d.fc_post||null,
       d.ta_pre||null, d.ta_dur||null, d.ta_post||null,
       d.spo2_pre||null, d.spo2_dur||null, d.spo2_post||null,
       d.disnea_pre||null, d.disnea_dur||null, d.borg_disnea!=null?d.borg_disnea:null,
       d.fatiga_pre||null, d.fatiga_dur||null, d.borg_mmii!=null?d.borg_mmii:null,
       d.fr_pre||null, d.fr_dur||null, d.fr_post||null,
       d.incidencia||'no', d.incidencia_descripcion||null, d.observaciones||null,
       d.profesional_registro||null, d.sesion_completada||'si',
       d.genera_alerta||false, req.usuario.id]
    );

    // Generar alerta si hay incidencia crítica
    if (d.genera_alerta) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id,
         `Incidencia en rehabilitación — Sesión ${d.numero_sesion}: ${d.incidencia}`]
      );
    }

    await query(
      `UPDATE pacientes SET
         sesiones_rhb_completadas = COALESCE(sesiones_rhb_completadas,0) + $1
       WHERE id = $2`,
      [d.sesion_completada === 'si' ? 1 : 0, d.paciente_id]
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
