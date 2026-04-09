// src/routes/contactoEnfermeria.js
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { autenticar, requiereRol } = require('../middleware/auth');
const { query } = require('../config/db');

// POST /api/v1/contacto-enfermeria
router.post('/', autenticar, requiereRol('enfermeria','coordinador','cardiólogo','neumólogo','medico'), async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });
  try {
    const id = uuidv4();
    await query(
      `INSERT INTO contactos_enfermeria
        (id, paciente_id, fecha_contacto, tipo_contacto, contacto_exitoso,
         enfermera, cf_oms, fc, spo2, ta, peso, peso_previo, fr,
         signos_alarma, morisky_score, morisky_respuestas,
         observaciones, plan, requiere_cita, prox_contacto,
         alerta_generada, ingresado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        id, d.paciente_id, d.fecha_contacto||null, d.tipo_contacto||null, d.contacto_exitoso||null,
        d.enfermera||null, d.cf_oms||null, d.fc||null, d.spo2||null, d.ta||null,
        d.peso||null, d.peso_previo||null, d.fr||null,
        JSON.stringify(d.signos_alarma||[]), d.morisky_score??null,
        JSON.stringify(d.morisky_respuestas||{}),
        d.observaciones||null, d.plan||null, d.requiere_cita||null,
        d.prox_contacto||null, d.alerta_generada||false, req.usuario.id
      ]
    );

    // Actualizar CF OMS en perfil del paciente
    if (d.cf_oms) {
      await query(
        `UPDATE pacientes SET clase_funcional_oms = $1 WHERE id = $2`,
        [d.cf_oms, d.paciente_id]
      );
    }

    // Generar alerta clínica si es crítico
    if (d.alerta_generada) {
      const alarmasDesc = (d.signos_alarma||[]).join(', ') || 'CF-OMS IV o SpO₂ <90%';
      const alertaId = uuidv4();
      await query(
        `INSERT INTO alertas
          (id, paciente_id, nivel, motivo, estado, reporte_id)
         VALUES ($1,$2,'critica',$3,'pendiente',$4)`,
        [alertaId, d.paciente_id,
         `Contacto enfermería: ${alarmasDesc}. CF-OMS ${d.cf_oms||'--'}. SpO₂ ${d.spo2||'--'}%.`,
         null]
      ).catch(e => console.warn('[alerta contacto]', e.message));
    }

    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
       VALUES ('profesional',$1,'CONTACTO_ENFERMERIA','contactos_enfermeria',$2)`,
      [req.usuario.id, id]
    );

    return res.status(201).json({ ok: true, id, alerta_generada: d.alerta_generada });
  } catch(err) {
    console.error('[POST /contacto-enfermeria]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/contacto-enfermeria/:pacienteId
router.get('/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM contactos_enfermeria
       WHERE paciente_id = $1
       ORDER BY fecha_contacto DESC NULLS LAST, created_at DESC
       LIMIT 24`,
      [req.params.pacienteId]
    );
    return res.json({ contactos: rows });
  } catch(err) {
    console.error('[GET /contacto-enfermeria]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
