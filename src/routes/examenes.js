// src/routes/examenes.js
// Exámenes diagnósticos HP — PulmoLink INO
// Ecocardiografía (cols 27-45) + Cateterismo cardíaco derecho (cols 46-62)
// + Clasificación HP (cols 63-64) + Exportación 100 variables

const express = require('express');
const Joi     = require('joi');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/db');
const { autenticar, requiereRol } = require('../middleware/auth');

// ── Validación ecocardiograma ────────────────────────────────
const ecoSchema = Joi.object({
  fecha_examen:                Joi.date().allow(null,''),
  clasif_fevi:                 Joi.string().max(40).allow(null,''),
  fevi_pct:                    Joi.number().min(0).max(100).allow(null,''),
  diam_vi_sistole:             Joi.number().min(0).max(15).allow(null,''),
  diam_vi_diastole:            Joi.number().min(0).max(15).allow(null,''),
  vol_auricula_izq:            Joi.number().min(0).allow(null,''),
  espesor_septum:              Joi.number().min(0).max(30).allow(null,''),
  espesor_pared_posterior:     Joi.number().min(0).max(30).allow(null,''),
  masa_ventricular:            Joi.number().min(0).allow(null,''),
  masa_ventricular_indexada:   Joi.number().min(0).allow(null,''),
  funcion_diastolica:          Joi.string().max(60).allow(null,''),
  relacion_e_e:                Joi.number().min(0).allow(null,''),
  valvulopatia_aortica:        Joi.string().max(40).allow(null,''),
  valvulopatia_mitral:         Joi.string().max(40).allow(null,''),
  diam_vd_basal:               Joi.number().min(0).max(15).allow(null,''),
  diam_vd_medio:               Joi.number().min(0).max(15).allow(null,''),
  diam_vd_long:                Joi.number().min(0).max(20).allow(null,''),
  tapse:                       Joi.number().min(0).max(50).allow(null,''),
  tapse_psap:                  Joi.number().min(0).allow(null,''),
  area_auricula_der:           Joi.number().min(0).allow(null,''),
  insuf_tricuspide:            Joi.string().valid('ninguna','leve','moderada','severa','').allow(null,''),
  vel_regurg_tricusp:          Joi.number().min(0).max(10).allow(null,''),
  psap_eco:                    Joi.number().min(0).max(200).allow(null,''),
  tiempo_aceleracion_pulmonar: Joi.number().min(0).max(500).allow(null,''),
  indice_excentricidad:        Joi.number().min(0).max(5).allow(null,''),
  derrame_pericardico:         Joi.boolean().allow(null,''),
  defecto_interauricular:      Joi.boolean().allow(null,''),
  defecto_interventricular:    Joi.boolean().allow(null,''),
  otros_defectos_congen:       Joi.string().max(500).allow(null,''),
  observaciones:               Joi.string().max(1000).allow(null,''),
}).options({ allowUnknown: true });

// ── Validación cateterismo derecho ────────────────────────────
const catSchema = Joi.object({
  fecha_examen:             Joi.date().allow(null),
  presion_auricula_der:     Joi.number().min(0).max(50).allow(null),
  psap_cateterismo:         Joi.number().min(0).max(200).allow(null),
  pdap:                     Joi.number().min(0).max(150).allow(null),
  pmap:                     Joi.number().min(0).max(150).allow(null),
  pcap:                     Joi.number().min(0).max(50).allow(null),
  pfdvd:                    Joi.number().min(0).max(50).allow(null),
  sat_vena_cava_sup:        Joi.number().min(0).max(100).allow(null),
  sat_vena_cava_inf:        Joi.number().min(0).max(100).allow(null),
  sat_arteria_pulmonar:     Joi.number().min(0).max(100).allow(null),
  sat_auricula_izq:         Joi.number().min(0).max(100).allow(null),
  sat_aorta:                Joi.number().min(0).max(100).allow(null),
  sat_venosa_mixta:         Joi.number().min(0).max(100).allow(null),
  gasto_cardiaco:           Joi.number().min(0).max(30).allow(null),
  rvp:                      Joi.number().min(0).allow(null),
  pa_sistolica_sist:        Joi.number().min(0).max(300).allow(null),
  pa_diastolica_sist:       Joi.number().min(0).max(200).allow(null),
  pa_media_sist:            Joi.number().min(0).max(250).allow(null),
  // Clasificación HP (cols 63-64)
  grupo_hp:                 Joi.number().integer().min(1).max(5).allow(null),
  clasificacion_riesgo:     Joi.string().valid('bajo','intermedio','alto').allow(null,''),
  observaciones:            Joi.string().max(1000).allow(null,''),
});

function validar(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, allowUnknown: false });
    if (error) return res.status(400).json({ error: 'Datos inválidos', detalle: error.details.map(d => d.message) });
    req.body = value;
    next();
  };
}

// GET /api/v1/examenes/pacientes-lista
// Lista de pacientes para el selector del formulario
router.get('/pacientes-lista', autenticar, requiereRol(), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, apellido, email,
              numero_documento, tipo_documento,
              fecha_nacimiento, sexo, telefono,
              eps, regimen, diagnostico_hp,
              grupo_hp_oms, clase_funcional_oms,
              clasificacion_riesgo, fecha_ingreso_programa,
              medico_tratante, sede_ino,
              grupo_etario, activo
       FROM pacientes
       WHERE activo = true
       ORDER BY apellido, nombre`
    );
    return res.json({ pacientes: rows });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/v1/examenes/ecocardiograma/:pacienteId
// Ingresar resultados de ecocardiograma (cols 27-45)
// ════════════════════════════════════════════════════════════
router.post('/ecocardiograma/:pacienteId',
  autenticar, requiereRol('neumólogo','cardiólogo','medicina_gral','medico'),
  validar(ecoSchema),
  async (req, res) => {
    const { pacienteId } = req.params;
    try {
      const id = uuidv4();
      const d  = req.body;
      const { rows } = await query(
        `INSERT INTO examenes_diagnosticos
          (id, paciente_id, tipo, fecha_examen, ingresado_por,
           clasif_fevi, fevi_pct, diam_vi_sistole, diam_vi_diastole,
           vol_auricula_izq, valvulopatia_aortica, valvulopatia_mitral,
           diam_vd_basal, diam_vd_medio, diam_vd_long,
           tapse, area_auricula_der, insuf_tricuspide,
           vel_regurg_tricusp, psap_eco,
           derrame_pericardico, defecto_interauricular,
           defecto_interventricular, otros_defectos_congen, observaciones)
         VALUES ($1,$2,'ecocardiograma',$3,$4,$5,$6,$7,$8,$9,$10,$11,
                 $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         RETURNING id, tipo, fecha_examen, created_at`,
        [id, pacienteId, d.fecha_examen||null, req.usuario.id,
         d.clasif_fevi||null, d.fevi_pct||null, d.diam_vi_sistole||null, d.diam_vi_diastole||null,
         d.vol_auricula_izq||null, d.valvulopatia_aortica||null, d.valvulopatia_mitral||null,
         d.diam_vd_basal||null, d.diam_vd_medio||null, d.diam_vd_long||null,
         d.tapse||null, d.area_auricula_der||null, d.insuf_tricuspide||null,
         d.vel_regurg_tricusp||null, d.psap_eco||null,
         d.derrame_pericardico??false, d.defecto_interauricular??false,
         d.defecto_interventricular??false, d.otros_defectos_congen||null,
         d.observaciones||null]
      );
      await query(
        `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
         VALUES ('profesional',$1,'CREATE_EXAMEN_ECO','examenes_diagnosticos',$2)`,
        [req.usuario.id, id]
      );
      return res.status(201).json({ mensaje: 'Ecocardiograma guardado', examen: rows[0] });
    } catch (err) {
      console.error('[POST /ecocardiograma]', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// POST /api/v1/examenes/cateterismo/:pacienteId
// Ingresar resultados de cateterismo derecho (cols 46-64)
// ════════════════════════════════════════════════════════════
router.post('/cateterismo/:pacienteId',
  autenticar, requiereRol('neumólogo','cardiólogo','medico'),
  validar(catSchema),
  async (req, res) => {
    const { pacienteId } = req.params;
    try {
      const id = uuidv4();
      const d  = req.body;
      const rows = await transaction(async (client) => {
        const r = await client.query(
          `INSERT INTO examenes_diagnosticos
            (id, paciente_id, tipo, fecha_examen, ingresado_por,
             presion_auricula_der, psap_cateterismo, pdap, pmap, pcap, pfdvd,
             sat_vena_cava_sup, sat_vena_cava_inf, sat_arteria_pulmonar,
             sat_auricula_izq, sat_aorta, sat_venosa_mixta,
             gasto_cardiaco, rvp,
             pa_sistolica_sist, pa_diastolica_sist, pa_media_sist,
             grupo_hp, clasificacion_riesgo, observaciones)
           VALUES ($1,$2,'cateterismo_derecho',$3,$4,$5,$6,$7,$8,$9,$10,
                   $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
           RETURNING id, tipo, fecha_examen, pmap, rvp, created_at`,
          [id, pacienteId, d.fecha_examen||null, req.usuario.id,
           d.presion_auricula_der||null, d.psap_cateterismo||null,
           d.pdap||null, d.pmap||null, d.pcap||null, d.pfdvd||null,
           d.sat_vena_cava_sup||null, d.sat_vena_cava_inf||null,
           d.sat_arteria_pulmonar||null, d.sat_auricula_izq||null,
           d.sat_aorta||null, d.sat_venosa_mixta||null,
           d.gasto_cardiaco||null, d.rvp||null,
           d.pa_sistolica_sist||null, d.pa_diastolica_sist||null,
           d.pa_media_sist||null,
           d.grupo_hp||null, d.clasificacion_riesgo||null,
           d.observaciones||null]
        );
        // Actualizar clasificación de riesgo en perfil del paciente
        if (d.grupo_hp || d.clasificacion_riesgo) {
          await client.query(
            `UPDATE pacientes SET
               grupo_hp_oms = COALESCE($1, grupo_hp_oms),
               riesgo_hp = COALESCE($2, riesgo_hp)
             WHERE id = $3`,
            [d.grupo_hp||null, d.clasificacion_riesgo||null, pacienteId]
          );
        }
        await client.query(
          `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
           VALUES ('profesional',$1,'CREATE_EXAMEN_CAT','examenes_diagnosticos',$2)`,
          [req.usuario.id, id]
        );
        return r.rows;
      });
      // Alertar si PMAP >= 20 mmHg (criterio diagnóstico HP ESC/ERS 2022)
      let alertaDx = null;
      if (d.pmap && d.pmap >= 20) {
        alertaDx = {
          criterio: `PMAP ${d.pmap} mmHg ≥ 20 mmHg — criterio diagnóstico HP (ESC/ERS 2022)`,
          rvp_elevada: d.rvp && d.rvp >= 240,
        };
      }
      return res.status(201).json({ mensaje: 'Cateterismo guardado', examen: rows[0], alerta_diagnostica: alertaDx });
    } catch (err) {
      console.error('[POST /cateterismo]', err.message);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// ════════════════════════════════════════════════════════════
// GET /api/v1/examenes/:pacienteId
// Historial de exámenes del paciente
// ════════════════════════════════════════════════════════════
router.get('/:pacienteId', autenticar, async (req, res) => {
  const { tipo } = req.query;
  try {
    const { rows } = await query(
      `SELECT e.*, pr.nombre || ' ' || pr.apellido AS ingresado_por_nombre
       FROM examenes_diagnosticos e
       LEFT JOIN profesionales pr ON pr.id = e.ingresado_por
       WHERE e.paciente_id = $1
         AND ($2::text IS NULL OR e.tipo = $2)
       ORDER BY e.fecha_examen DESC NULLS LAST, e.created_at DESC`,
      [req.params.pacienteId, tipo||null]
    );
    return res.json({ examenes: rows, total: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/v1/examenes/exportar/:pacienteId
// Exportar las 100 variables del formulario HP en JSON
// Listo para generar Excel o alimentar otro sistema
// ════════════════════════════════════════════════════════════
router.get('/exportar/:pacienteId', autenticar, requiereRol(), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM reporte_hp_paciente WHERE consecutivo = (
         SELECT consecutivo FROM pacientes WHERE id = $1
       )`,
      [req.params.pacienteId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Paciente no encontrado' });
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
       VALUES ('profesional',$1,'EXPORT_100_VARS','reporte_hp_paciente',$2)`,
      [req.usuario.id, req.params.pacienteId]
    );
    return res.json({
      descripcion: 'Exportación de las 100 variables del Programa HP - INO',
      paciente_id: req.params.pacienteId,
      variables_total: 100,
      datos: rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/v1/examenes/exportar-panel
// Exportar panel completo de pacientes HP (todas las 100 vars)
// Para investigación y auditorías del programa
// ════════════════════════════════════════════════════════════
router.get('/exportar-panel', autenticar, requiereRol('neumólogo','cardiólogo','administrativo','medico'), async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM reporte_hp_paciente ORDER BY consecutivo`);
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla)
       VALUES ('profesional',$1,'EXPORT_PANEL_COMPLETO','reporte_hp_paciente')`,
      [req.usuario.id]
    );
    return res.json({
      descripcion: 'Panel completo Programa HP - INO — 100 variables por paciente',
      total_pacientes: rows.length,
      variables_total: 100,
      fecha_exportacion: new Date().toISOString(),
      datos: rows,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/v1/examenes/estratificacion
// Guardar resultado de calculadora de riesgo
// ════════════════════════════════════════════════════════════
router.post('/estratificacion', autenticar, requiereRol('neumólogo','cardiólogo','medico','medicina_gral'), async (req, res) => {
  const { paciente_id, tipo_calculadora, resultado, clasificacion_riesgo } = req.body;
  if (!paciente_id || !tipo_calculadora || !clasificacion_riesgo) {
    return res.status(400).json({ error: 'paciente_id, tipo_calculadora y clasificacion_riesgo son requeridos' });
  }
  try {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional', $1, 'ESTRATIFICACION_RIESGO', 'pacientes', $2, $3)`,
      [req.usuario.id, paciente_id, JSON.stringify({ tipo_calculadora, clasificacion_riesgo, resultado })]
    );
    await query(
      `UPDATE pacientes SET riesgo_hp = $1 WHERE id = $2`,
      [clasificacion_riesgo, paciente_id]
    );
    return res.status(201).json({
      ok: true,
      id,
      tipo_calculadora,
      clasificacion_riesgo,
      created_at: new Date().toISOString()
    });
  } catch(err) {
    console.error('[POST /estratificacion]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/examenes/estratificacion/:pacienteId
router.get('/estratificacion/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, detalle, created_at
       FROM auditoria
       WHERE tabla = 'pacientes'
         AND accion = 'ESTRATIFICACION_RIESGO'
         AND registro_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.params.pacienteId]
    );
    const estratificaciones = rows.map(r => {
      const d = typeof r.detalle === 'string' ? JSON.parse(r.detalle) : r.detalle;
      return {
        id: r.id,
        tipo_calculadora: d.tipo_calculadora,
        clasificacion_riesgo: d.clasificacion_riesgo,
        resultado: d.resultado,
        created_at: r.created_at,
      };
    });
    return res.json({ estratificaciones });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
