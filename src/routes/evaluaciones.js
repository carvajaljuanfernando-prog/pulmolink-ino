// src/routes/evaluaciones.js
// Endpoints de evaluaciones clínicas — PulmoLink INO

const express = require('express');
const Joi     = require('joi');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const { query, transaction }   = require('../config/db');
const { calcularSF12, PREGUNTAS_SF12 } = require('../services/sf12Service');
const { calcularMorisky, clasificarOMS,
        compararEvaluaciones,
        PREGUNTAS_MORISKY, PREGUNTAS_CLASE_OMS } = require('../services/evaluacionService');
const { autenticar, requiereRol } = require('../middleware/auth');

// ============================================================
// GET /api/v1/evaluaciones/preguntas/:tipo
// Devuelve el cuestionario para mostrar al paciente
// ============================================================
router.get('/preguntas/:tipo', autenticar, (req, res) => {
  const { tipo } = req.params;
  const cuestionarios = {
    sf12: {
      tipo: 'sf12',
      preguntas: PREGUNTAS_SF12,
      instrucciones: 'Las siguientes preguntas se refieren a su salud. Por favor responda como si fuera un promedio de las últimas 4 semanas.',
    },
    morisky8: {
      tipo: 'morisky8',
      preguntas: PREGUNTAS_MORISKY,
      instrucciones: 'Las siguientes preguntas son sobre cómo toma sus medicamentos para la hipertensión pulmonar.',
    },
    clase_oms: {
      tipo: 'clase_oms',
      preguntas: PREGUNTAS_CLASE_OMS,
      instrucciones: 'Estas preguntas nos ayudan a entender cómo se siente en sus actividades del día a día. Sus respuestas son una guía para el equipo médico del INO.',
    },
  };

  if (!cuestionarios[tipo]) {
    return res.status(404).json({
      error: `Tipo desconocido: ${tipo}. Use: sf12, morisky8, clase_oms`,
    });
  }
  return res.json(cuestionarios[tipo]);
});

// ============================================================
// POST /api/v1/evaluaciones
// Guardar respuestas y calcular puntaje automáticamente
// ============================================================
const esquemaEvaluacion = Joi.object({
  paciente_id:   Joi.string().uuid().allow(null),
  tipo:          Joi.string().valid('sf12', 'morisky8', 'clase_oms').required(),
  momento:       Joi.string().valid('inicial','seguimiento','final').default('seguimiento'),
  respuestas:    Joi.object().required(),
  observaciones: Joi.string().max(1000).allow('', null),
});

router.post('/', autenticar, async (req, res) => {
  const { error, value } = esquemaEvaluacion.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  // Si el paciente está autenticado y no envía paciente_id, usar su propio id
  if (!value.paciente_id) {
    if (req.usuario.tipo === 'paciente') {
      value.paciente_id = req.usuario.id;
    } else {
      return res.status(400).json({ error: 'paciente_id requerido para profesionales' });
    }
  }

  if (req.usuario.tipo === 'paciente' && req.usuario.id !== value.paciente_id) {
    return res.status(403).json({ error: 'Solo puedes enviar tu propia evaluación' });
  }

  let calculo = {};
  let alertaGenerada = null;

  try {
    if (value.tipo === 'sf12')      calculo = calcularSF12(value.respuestas);
    if (value.tipo === 'morisky8')  calculo = calcularMorisky(value.respuestas);
    if (value.tipo === 'clase_oms') calculo = clasificarOMS(value.respuestas);

    const evaluacionId = uuidv4();

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO evaluaciones
          (id, paciente_id, tipo, momento, respuestas,
           puntaje_pcs, puntaje_mcs, puntaje_morisky,
           puntaje_total, clasificacion,
           aplicada_por, observaciones)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          evaluacionId, value.paciente_id, value.tipo,
          value.momento || 'seguimiento',
          JSON.stringify(value.respuestas),
          calculo.pcs  ?? null,
          calculo.mcs  ?? null,
          calculo.puntaje ?? null,
          calculo.pcs && calculo.mcs ? Math.round((calculo.pcs + calculo.mcs) / 2 * 100) / 100 : null,
          calculo.clasificacion ?? calculo.clase_orientativa?.toString() ?? null,
          req.usuario.tipo,
          value.observaciones || null,
        ]
      );

      // Alerta por Morisky bajo
      if (value.tipo === 'morisky8' && calculo.genera_alerta) {
        const { rows: p } = await client.query(
          `SELECT profesional_id FROM pacientes WHERE id = $1`, [value.paciente_id]
        );
        const { rows: a } = await client.query(
          `INSERT INTO alertas
            (id, paciente_id, nivel, motivo, profesional_notif_id, estado, notificado_at)
           VALUES ($1,$2,'media',$3,$4,'pendiente',NOW()) RETURNING id, nivel, motivo`,
          [uuidv4(), value.paciente_id,
           `Baja adherencia medicamentosa — Morisky-8: ${calculo.puntaje}/8. ${calculo.recomendacion}`,
           p[0]?.profesional_id || null]
        );
        alertaGenerada = a[0];
      }

      // Alerta por Clase OMS IV orientativa
      if (value.tipo === 'clase_oms' && calculo.clase_orientativa === 4) {
        const { rows: p } = await client.query(
          `SELECT profesional_id FROM pacientes WHERE id = $1`, [value.paciente_id]
        );
        const { rows: a } = await client.query(
          `INSERT INTO alertas
            (id, paciente_id, nivel, motivo, profesional_notif_id, estado, notificado_at)
           VALUES ($1,$2,'alta',$3,$4,'pendiente',NOW()) RETURNING id, nivel, motivo`,
          [uuidv4(), value.paciente_id,
           'Orientación de Clase OMS IV reportada por el paciente. Requiere evaluación médica urgente.',
           p[0]?.profesional_id || null]
        );
        alertaGenerada = a[0];
      }

      await client.query(
        `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
         VALUES ($1,$2,'CREATE_EVALUACION','evaluaciones',$3)`,
        [req.usuario.tipo, req.usuario.id, evaluacionId]
      );
    });

    return res.status(201).json({
      evaluacion_id: evaluacionId,
      tipo: value.tipo,
      resultado: calculo,
      alerta_generada: alertaGenerada,
      mensaje: mensajeParaPaciente(value.tipo, calculo),
    });

  } catch (err) {
    if (err.message.includes('Faltan ítems')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[POST /evaluaciones]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// GET /api/v1/evaluaciones/paciente/:id — historial con tendencia
// ============================================================
router.get('/paciente/:id', autenticar, async (req, res) => {
  const { tipo, limite = 10 } = req.query;
  const params = [req.params.id, parseInt(limite)];
  const filtroTipo = tipo ? `AND tipo = $3` : '';
  if (tipo) params.push(tipo);

  try {
    const { rows } = await query(
      `SELECT id, tipo, puntaje_pcs, puntaje_mcs, clasificacion,
              aplicada_at, aplicada_por, observaciones, respuestas
       FROM evaluaciones
       WHERE paciente_id = $1 ${filtroTipo}
       ORDER BY aplicada_at DESC LIMIT $2`,
      params
    );

    let tendencia = null;
    if (rows.length >= 2) {
      const mismoTipo = rows.filter(r => r.tipo === (tipo || rows[0].tipo));
      if (mismoTipo.length >= 2) {
        try {
          tendencia = compararEvaluaciones(mismoTipo[1], mismoTipo[0]);
        } catch { /* sin tendencia */ }
      }
    }

    return res.json({ evaluaciones: rows, tendencia });
  } catch (err) {
    console.error('[GET /evaluaciones/paciente]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// GET /api/v1/evaluaciones/programa/resumen — dashboard INO
// ============================================================
router.get('/programa/resumen', autenticar, requiereRol(), async (req, res) => {
  try {
    const [sf12, morisky, oms] = await Promise.all([
      query(`SELECT AVG(puntaje_pcs) AS pcs_promedio, AVG(puntaje_mcs) AS mcs_promedio,
                    MIN(puntaje_pcs) AS pcs_min, MAX(puntaje_pcs) AS pcs_max,
                    COUNT(*) AS total
             FROM evaluaciones WHERE tipo='sf12' AND aplicada_at >= NOW()-INTERVAL '90 days'`),
      query(`SELECT clasificacion, COUNT(*) AS cantidad FROM evaluaciones
             WHERE tipo='morisky8' AND aplicada_at >= NOW()-INTERVAL '90 days'
             GROUP BY clasificacion`),
      query(`SELECT clasificacion AS clase, COUNT(*) AS cantidad FROM evaluaciones
             WHERE tipo='clase_oms' AND aplicada_at >= NOW()-INTERVAL '90 days'
             GROUP BY clasificacion ORDER BY clasificacion`),
    ]);

    return res.json({
      periodo: 'últimos 90 días',
      sf12: sf12.rows[0],
      morisky: morisky.rows,
      clase_oms: oms.rows,
    });
  } catch (err) {
    console.error('[GET /evaluaciones/programa/resumen]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================================
// GET /api/v1/evaluaciones/:id — detalle completo
// ============================================================
router.get('/:id', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT e.*, p.nombre || ' ' || p.apellido AS paciente_nombre,
              p.grupo_etario, p.clase_funcional_oms
       FROM evaluaciones e JOIN pacientes p ON p.id = e.paciente_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Evaluación no encontrada' });

    const ev = rows[0];
    const respuestas = typeof ev.respuestas === 'string'
      ? JSON.parse(ev.respuestas) : ev.respuestas;

    let calculo = {};
    try {
      if (ev.tipo === 'sf12')      calculo = calcularSF12(respuestas);
      if (ev.tipo === 'morisky8')  calculo = calcularMorisky(respuestas);
      if (ev.tipo === 'clase_oms') calculo = clasificarOMS(respuestas);
    } catch { /* sin recálculo */ }

    return res.json({ ...ev, calculo });
  } catch (err) {
    console.error('[GET /evaluaciones/:id]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

function mensajeParaPaciente(tipo, calculo) {
  if (tipo === 'sf12') {
    const nivel = calculo.interpretacion?.pcs?.nivel;
    if (nivel === 'muy_bajo') return 'Gracias por completar la encuesta. El equipo del Programa HP del INO revisará tus resultados y se pondrá en contacto contigo.';
    return 'Gracias por completar la encuesta de calidad de vida. El equipo revisará tu evolución en la próxima consulta.';
  }
  if (tipo === 'morisky8') {
    if (calculo.clasificacion === 'alta') return '¡Excelente! Estás tomando tus medicamentos correctamente. Sigue así.';
    if (calculo.clasificacion === 'media') return 'Gracias por responder. Te enviaremos consejos para recordar tus medicamentos.';
    return 'Gracias por tu honestidad. El equipo del Programa HP te contactará para ayudarte con tus medicamentos.';
  }
  return 'Evaluación recibida correctamente. Tu médico del INO confirmará los resultados en la próxima consulta.';
}


// PUT /api/v1/pacientes/:id/egreso — inactivar paciente con motivo
router.put('/:id/egreso', autenticar, async (req, res) => {
  const { motivo_egreso, fecha_egreso, observaciones_egreso } = req.body;
  if (!motivo_egreso) return res.status(400).json({ error: 'motivo_egreso requerido' });
  try {
    await query(
      `UPDATE pacientes SET
         estado = 'inactivo',
         motivo_egreso = $1,
         fecha_egreso = $2,
         observaciones_egreso = $3
       WHERE id = $4`,
      [motivo_egreso, fecha_egreso || new Date().toISOString().split('T')[0],
       observaciones_egreso || null, req.params.id]
    );
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional',$1,'EGRESO_PACIENTE','pacientes',$2,$3)`,
      [req.usuario.id, req.params.id, JSON.stringify({ motivo_egreso, fecha_egreso, observaciones_egreso })]
    );
    return res.json({ ok: true });
  } catch(err) {
    console.error('[PUT /pacientes/:id/egreso]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/pacientes/:id/reactivar — reactivar paciente
router.put('/:id/reactivar', autenticar, async (req, res) => {
  try {
    await query(
      `UPDATE pacientes SET estado='activo', motivo_egreso=NULL, fecha_egreso=NULL, observaciones_egreso=NULL WHERE id=$1`,
      [req.params.id]
    );
    return res.json({ ok: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/pacientes/egresados — listar pacientes inactivos
router.get('/egresados', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, apellido, numero_documento, fecha_nacimiento,
              eps, diagnostico_hp, grupo_hp_oms, motivo_egreso,
              fecha_egreso, observaciones_egreso, created_at
       FROM pacientes WHERE estado = 'inactivo'
       ORDER BY fecha_egreso DESC NULLS LAST`
    );
    return res.json({ pacientes: rows });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
