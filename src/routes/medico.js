// src/routes/medico.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { query } = require('../config/db');
const { autenticar } = require('../middleware/auth');

// =============================================================
// POST /api/v1/medico/ingreso
// Registra el ingreso del paciente al programa de Hipertensión Pulmonar
// Incluye: antecedentes, diagnóstico, evaluación basal, plan de manejo
// =============================================================
router.post('/ingreso', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });

  try {
    const id = uuidv4();

    // Registro principal en auditoría
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'INGRESO_MEDICO','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );

    // Alertas automáticas en el ingreso (clase funcional severa)
    if (d.clase_funcional_oms === 'IV') {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta','Médico — Paciente ingresa al programa en Clase Funcional OMS IV. Requiere manejo prioritario.','pendiente',NOW())`,
        [uuidv4(), d.paciente_id]
      );
    }

    if (d.t6mc_metros && Number(d.t6mc_metros) < 165) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id, `Médico — T6MC al ingreso ${d.t6mc_metros}m (<165m, riesgo alto). Considerar intensificación terapéutica.`]
      );
    }

    return res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('[POST /medico/ingreso]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================
// POST /api/v1/medico/egreso
// Registra el egreso del paciente del programa
// Incluye: resumen de evolución, recomendaciones, continuidad de tratamiento
// Genera alerta automática si hay deterioro funcional (CF empeoró o T6MC bajó >15%)
// =============================================================
router.post('/egreso', autenticar, async (req, res) => {
  const d = req.body;
  if (!d.paciente_id) return res.status(400).json({ error: 'paciente_id requerido' });

  try {
    const id = uuidv4();

    // Registro principal en auditoría
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'EGRESO_MEDICO','pacientes',$2,$3)`,
      [req.usuario.id, d.paciente_id, JSON.stringify(d)]
    );

    // ---- Detección de deterioro funcional ----
    const ordenCF = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4 };
    let deterioroCF = false;
    let deterioroT6MC = false;
    const motivosDeterioro = [];

    if (d.clase_funcional_inicial && d.clase_funcional_egreso) {
      if (ordenCF[d.clase_funcional_egreso] > ordenCF[d.clase_funcional_inicial]) {
        deterioroCF = true;
        motivosDeterioro.push(`Clase Funcional empeoró de ${d.clase_funcional_inicial} a ${d.clase_funcional_egreso}`);
      }
    }

    if (d.t6mc_inicial && d.t6mc_egreso) {
      const inicial = Number(d.t6mc_inicial);
      const egreso = Number(d.t6mc_egreso);
      if (inicial > 0) {
        const variacion = ((egreso - inicial) / inicial) * 100;
        if (variacion < -15) {
          deterioroT6MC = true;
          motivosDeterioro.push(`T6MC disminuyó ${Math.abs(variacion).toFixed(1)}% (de ${inicial}m a ${egreso}m)`);
        }
      }
    }

    if (deterioroCF || deterioroT6MC) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id, `Médico — Egreso con deterioro funcional: ${motivosDeterioro.join(' | ')}. Revisar plan de continuidad.`]
      );
    }

    // Alerta adicional si motivo de egreso es crítico
    const motivosCriticos = ['abandono', 'evento_adverso_grave', 'fallecimiento'];
    if (d.motivo_egreso && motivosCriticos.includes(d.motivo_egreso)) {
      await query(
        `INSERT INTO alertas (id, paciente_id, nivel, motivo, estado, notificado_at)
         VALUES ($1,$2,'alta',$3,'pendiente',NOW())`,
        [uuidv4(), d.paciente_id, `Médico — Egreso por ${d.motivo_egreso.replace(/_/g, ' ')}. Documentar caso y revisar protocolo.`]
      );
    }

    return res.status(201).json({
      ok: true,
      id,
      alertas_generadas: { deterioroCF, deterioroT6MC, motivosDeterioro }
    });
  } catch (err) {
    console.error('[POST /medico/egreso]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================
// GET /api/v1/medico/historial/:pacienteId
// Devuelve los registros médicos (ingreso y egreso) del paciente
// =============================================================
router.get('/historial/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, accion, detalle, created_at FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion IN ('INGRESO_MEDICO','EGRESO_MEDICO')
         AND registro_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [req.params.pacienteId]
    );

    const registros = rows.map(r => ({
      id: r.id,
      accion: r.accion,
      detalle: typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle,
      created_at: r.created_at,
    }));

    return res.json({ registros });
  } catch (err) {
    console.error('[GET /medico/historial]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// =============================================================
// GET /api/v1/medico/resumen/:pacienteId
// Vista integradora: trae el último ingreso médico + datos de los demás módulos
// Útil al momento de elaborar el egreso para tener todo a la vista
// =============================================================
router.get('/resumen/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT accion, detalle, created_at FROM auditoria
       WHERE tabla = 'pacientes'
         AND registro_id = $1
         AND accion IN ('INGRESO_MEDICO','EGRESO_MEDICO','VALORACION_TS','CONTROL_TS','VALORACION_NUT','CONTROL_NUT')
       ORDER BY created_at DESC`,
      [req.params.pacienteId]
    );

    const resumen = {
      ingreso_medico: null,
      ultimo_egreso_medico: null,
      ultima_valoracion_ts: null,
      ultimo_control_ts: null,
      ultima_valoracion_nut: null,
      ultimo_control_nut: null,
    };

    rows.forEach(r => {
      const detalle = typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle;
      const item = { detalle, created_at: r.created_at };

      if (r.accion === 'INGRESO_MEDICO' && !resumen.ingreso_medico) resumen.ingreso_medico = item;
      if (r.accion === 'EGRESO_MEDICO' && !resumen.ultimo_egreso_medico) resumen.ultimo_egreso_medico = item;
      if (r.accion === 'VALORACION_TS' && !resumen.ultima_valoracion_ts) resumen.ultima_valoracion_ts = item;
      if (r.accion === 'CONTROL_TS' && !resumen.ultimo_control_ts) resumen.ultimo_control_ts = item;
      if (r.accion === 'VALORACION_NUT' && !resumen.ultima_valoracion_nut) resumen.ultima_valoracion_nut = item;
      if (r.accion === 'CONTROL_NUT' && !resumen.ultimo_control_nut) resumen.ultimo_control_nut = item;
    });

    return res.json({ resumen });
  } catch (err) {
    console.error('[GET /medico/resumen]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
