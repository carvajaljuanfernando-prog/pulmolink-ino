// src/routes/medico.js
// Módulo médico — Ingreso y Egreso al Programa HP — PulmoLink INO
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();
const { query } = require('../config/db');
const { autenticar, requiereRol } = require('../middleware/auth');

// ══ POST /api/v1/medico/ingreso ═══════════════════════════════
router.post('/ingreso', autenticar, requiereRol('cardiólogo','neumólogo','medico','coordinador'), async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });

  try {
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1::text,'INGRESO_MEDICO','pacientes',$2::text,$3::text)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );

    // Actualizar fecha de ingreso y datos clínicos en pacientes
    await query(
      `UPDATE pacientes SET
         fecha_ingreso_programa = COALESCE($1, fecha_ingreso_programa),
         clase_funcional_oms = COALESCE($2, clase_funcional_oms),
         diagnostico_hp = COALESCE($3, diagnostico_hp),
         grupo_hp_oms = COALESCE($4, grupo_hp_oms),
         medico_tratante = COALESCE($5, medico_tratante)
       WHERE id = $6::uuid`,
      [
        d.fecha_ingreso_programa || null,
        d.clase_funcional_oms || null,
        d.diagnostico_hp || null,
        d.grupo_hp_oms || null,
        d.medico_tratante || null,
        d.paciente_id
      ]
    );

    // Alertas automáticas
    if (d.clase_funcional_oms === 4 || d.clase_funcional_oms === '4' || d.clase_funcional_oms === 'IV') {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta','Ingreso al programa con CF-OMS IV — Paciente en riesgo alto','pendiente',NOW())`,
        [uuidv4(), d.paciente_id]
      );
    }
    if (d.t6mc_metros && parseFloat(d.t6mc_metros) < 165) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id,
         `Ingreso con TC6M ${d.t6mc_metros}m (<165m) — Riesgo alto ESC/ERS`]
      );
    }

    return res.status(201).json({ ok: true, id });
  } catch(err) {
    console.error('[POST /medico/ingreso]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ══ POST /api/v1/medico/egreso ════════════════════════════════
router.post('/egreso', autenticar, requiereRol('cardiólogo','neumólogo','medico','coordinador'), async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });

  try {
    const id = uuidv4();
    const alertas = [];

    // Detectar deterioro de clase funcional
    if (d.cf_ingreso && d.cf_egreso) {
      const cfMap = {'I':1,'II':2,'III':3,'IV':4,'1':1,'2':2,'3':3,'4':4};
      const cfIng = cfMap[d.cf_ingreso] || parseInt(d.cf_ingreso);
      const cfEgr = cfMap[d.cf_egreso]  || parseInt(d.cf_egreso);
      if (cfEgr > cfIng) {
        const msg = `Egreso con deterioro funcional: CF ${d.cf_ingreso} → ${d.cf_egreso}`;
        alertas.push(msg);
        await query(
          `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
           VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
          [uuidv4(), d.paciente_id, msg]
        );
      }
    }

    // Detectar deterioro TC6M >15%
    if (d.t6mc_ingreso && d.t6mc_egreso) {
      const pct = ((d.t6mc_ingreso - d.t6mc_egreso) / d.t6mc_ingreso) * 100;
      if (pct > 15) {
        const msg = `Egreso con deterioro TC6M: ${d.t6mc_ingreso}m → ${d.t6mc_egreso}m (-${pct.toFixed(0)}%)`;
        alertas.push(msg);
        await query(
          `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
           VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
          [uuidv4(), d.paciente_id, msg]
        );
      }
    }

    // Motivos de egreso críticos
    const motivosCriticos = ['fallecimiento','abandono','evento_adverso_grave'];
    if (motivosCriticos.includes(d.motivo_egreso)) {
      const msg = `Egreso por ${d.motivo_egreso.replace(/_/g,' ')} — Requiere revisión`;
      alertas.push(msg);
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'critica',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id, msg]
      );
    }

    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1::text,'EGRESO_MEDICO','pacientes',$2::text,$3::text)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );

    return res.status(201).json({ ok: true, id, alertas_generadas: alertas });
  } catch(err) {
    console.error('[POST /medico/egreso]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ══ GET /api/v1/medico/historial/:pacienteId ══════════════════
router.get('/historial/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, accion, detalle, created_at FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion IN ('INGRESO_MEDICO','EGRESO_MEDICO')
         AND registro_id = $1::text
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
    console.error('[GET /medico/historial]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
