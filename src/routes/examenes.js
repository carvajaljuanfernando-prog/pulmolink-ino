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
  // VI
  clasif_fevi:                 Joi.string().max(40).allow(null,''),
  fevi_pct:                    Joi.number().min(0).max(100).allow(null,''),
  diam_vi_diastole:            Joi.number().min(0).max(150).allow(null,''),
  diam_vi_sistole:             Joi.number().min(0).max(150).allow(null,''),
  espesor_septum:              Joi.number().min(0).max(50).allow(null,''),
  espesor_pared_posterior:     Joi.number().min(0).max(50).allow(null,''),
  masa_ventricular:            Joi.number().min(0).allow(null,''),
  masa_ventricular_indexada:   Joi.number().min(0).allow(null,''),
  vol_auricula_izq:            Joi.number().min(0).allow(null,''),
  funcion_diastolica:          Joi.string().max(60).allow(null,''),
  relacion_e_e:                Joi.number().min(0).allow(null,''),
  valvulopatia_aortica:        Joi.string().max(40).allow(null,''),
  valvulopatia_mitral:         Joi.string().max(40).allow(null,''),
  // VD — ASE 2025
  diam_vd_basal:               Joi.number().min(0).max(150).allow(null,''),
  diam_vd_medio:               Joi.number().min(0).max(150).allow(null,''),
  diam_vd_long:                Joi.number().min(0).max(200).allow(null,''),
  grosor_pared_vd:             Joi.number().min(0).max(30).allow(null,''),
  tapse:                       Joi.number().min(0).max(500).allow(null,''),
  tapse_psap:                  Joi.number().min(0).allow(null,''),
  fac_vd:                      Joi.number().min(0).max(100).allow(null,''),
  tdi_s_prime:                 Joi.number().min(0).max(30).allow(null,''),
  rvot_vti:                    Joi.number().min(0).max(50).allow(null,''),
  tiempo_aceleracion_pulmonar: Joi.number().min(0).max(500).allow(null,''),
  indice_excentricidad:        Joi.number().min(0).max(5).allow(null,''),
  rv_strain:                   Joi.number().min(-40).max(0).allow(null,''),
  // AD — ASE 2025
  area_auricula_der:           Joi.number().min(0).allow(null,''),
  ravi:                        Joi.number().min(0).allow(null,''),
  rap_estimada:                Joi.number().allow(null,''),
  // Hemodinámica — ASE 2025
  vel_regurg_tricusp:          Joi.number().min(0).max(10).allow(null,''),
  psap_eco:                    Joi.number().min(0).max(200).allow(null,''),
  probabilidad_hp_ase2025:     Joi.string().valid('baja','intermedia','alta','').allow(null,''),
  diam_arteria_pulmonar:       Joi.number().min(0).max(10).allow(null,''),
  razon_ap_ao:                 Joi.number().min(0).max(5).allow(null,''),
  insuf_tricuspide:            Joi.string().valid('ninguna','leve','moderada','severa','').allow(null,''),
  // Otros
  derrame_pericardico:         Joi.boolean().truthy(1).falsy(0).allow(null,''),
  defecto_interauricular:      Joi.boolean().truthy(1).falsy(0).allow(null,''),
  defecto_interventricular:    Joi.boolean().truthy(1).falsy(0).allow(null,''),
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
  observaciones_cat:        Joi.string().max(1000).allow(null,''),
  indice_cardiaco:          Joi.number().min(0).max(15).allow(null,''),
  rvp_calculada:            Joi.number().min(0).allow(null,''),
  gtp:                      Joi.number().allow(null,''),
  gdp:                      Joi.number().allow(null,''),
  qp_qs:                    Joi.number().min(0).max(20).allow(null,''),
  diagnostico_hemodinamico: Joi.string().max(500).allow(null,''),
  grupo_hp_texto:           Joi.string().max(100).allow(null,''),
}).options({ allowUnknown: true });

function validar(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, allowUnknown: true });
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
  autenticar, requiereRol('neumólogo','cardiólogo','medico','coordinador','enfermeria','medicina_gral'),
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
           espesor_septum, espesor_pared_posterior,
           masa_ventricular, masa_ventricular_indexada,
           funcion_diastolica, relacion_e_e,
           vol_auricula_izq, valvulopatia_aortica, valvulopatia_mitral,
           diam_vd_basal, diam_vd_medio, diam_vd_long,
           grosor_pared_vd, tapse, tapse_psap,
           fac_vd, tdi_s_prime, rvot_vti,
           tiempo_aceleracion_pulmonar, indice_excentricidad, rv_strain,
           area_auricula_der, ravi, rap_estimada,
           vel_regurg_tricusp, psap_eco,
           probabilidad_hp_ase2025, diam_arteria_pulmonar, razon_ap_ao,
           insuf_tricuspide,
           derrame_pericardico, defecto_interauricular,
           defecto_interventricular, otros_defectos_congen, observaciones)
         VALUES ($1,$2,'ecocardiograma',$3,$4,$5,$6,$7,$8,$9,$10,
                 $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
                 $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
                 $39,$40,$41,$42,$43)
         RETURNING id, tipo, fecha_examen, created_at`,
        [id, pacienteId, d.fecha_examen||null, req.usuario.id,
         d.clasif_fevi||null, d.fevi_pct||null, d.diam_vi_sistole||null, d.diam_vi_diastole||null,
         d.espesor_septum||null, d.espesor_pared_posterior||null,
         d.masa_ventricular||null, d.masa_ventricular_indexada||null,
         d.funcion_diastolica||null, d.relacion_e_e||null,
         d.vol_auricula_izq||null, d.valvulopatia_aortica||null, d.valvulopatia_mitral||null,
         d.diam_vd_basal||null, d.diam_vd_medio||null, d.diam_vd_long||null,
         d.grosor_pared_vd||null, d.tapse||null, d.tapse_psap||null,
         d.fac_vd||null, d.tdi_s_prime||null, d.rvot_vti||null,
         d.tiempo_aceleracion_pulmonar||null, d.indice_excentricidad||null, d.rv_strain||null,
         d.area_auricula_der||null, d.ravi||null, d.rap_estimada||null,
         d.vel_regurg_tricusp||null, d.psap_eco||null,
         d.probabilidad_hp_ase2025||null, d.diam_arteria_pulmonar||null, d.razon_ap_ao||null,
         d.insuf_tricuspide||null,
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
  autenticar, requiereRol('neumólogo','cardiólogo','medico','coordinador','enfermeria'),
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
             gasto_cardiaco, rvp, rvp_calculada, indice_cardiaco,
             gtp, gdp, qp_qs, diagnostico_hemodinamico,
             pa_sistolica_sist, pa_diastolica_sist, pa_media_sist,
             grupo_hp, clasificacion_riesgo,
             observaciones, observaciones_cat,
             vaso_realizado, vaso_agente, vaso_resultado,
             vaso_pmap_pre, vaso_pmap_post, vaso_gc_post, vaso_observaciones,
             carga_vol_realizada, carga_vol_volumen,
             carga_vol_pcap_pre, carga_vol_pcap_post, carga_vol_pmap_post,
             carga_vol_observaciones)
           VALUES ($1,$2,'cateterismo_derecho',$3,$4,$5,$6,$7,$8,$9,$10,
                   $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
                   $25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
                   $39,$40,$41,$42,$43,$44)
           RETURNING id, tipo, fecha_examen, pmap, rvp, created_at`,
          [id, pacienteId, d.fecha_examen||null, req.usuario.id,
           d.presion_auricula_der||null, d.psap_cateterismo||null,
           d.pdap||null, d.pmap||null, d.pcap||null, d.pfdvd||null,
           d.sat_vena_cava_sup||null, d.sat_vena_cava_inf||null,
           d.sat_arteria_pulmonar||null, d.sat_auricula_izq||null,
           d.sat_aorta||null, d.sat_venosa_mixta||null,
           d.gasto_cardiaco||null, d.rvp||null,
           d.rvp_calculada||null, d.indice_cardiaco||null,
           d.gtp||null, d.gdp||null, d.qp_qs||null,
           d.diagnostico_hemodinamico||null,
           d.pa_sistolica_sist||null, d.pa_diastolica_sist||null,
           d.pa_media_sist||null,
           d.grupo_hp||null, d.clasificacion_riesgo||null,
           d.observaciones||null, d.observaciones_cat||null,
           d.vaso_realizado||null, d.vaso_agente||null, d.vaso_resultado||null,
           d.vaso_pmap_pre||null, d.vaso_pmap_post||null, d.vaso_gc_post||null,
           d.vaso_observaciones||null,
           d.carga_vol_realizada||null, d.carga_vol_volumen||null,
           d.carga_vol_pcap_pre||null, d.carga_vol_pcap_post||null,
           d.carga_vol_pmap_post||null, d.carga_vol_observaciones||null]
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
    // Normalizar estructura: envolver datos en campo 'datos' para compatibilidad frontend
    const examenes = rows.map(row => ({
      id: row.id,
      tipo: row.tipo,
      fecha_examen: row.fecha_examen,
      created_at: row.created_at,
      ingresado_por_nombre: row.ingresado_por_nombre,
      datos: row
    }));
    return res.json({ examenes, total: examenes.length });
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
router.post('/estratificacion', autenticar, requiereRol('neumólogo','cardiólogo','medico','coordinador','enfermeria','medicina_gral'), async (req, res) => {
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

// ════════════════════════════════════════════════════════════
// POST /api/v1/examenes/adicional/:pacienteId
// Guardar exámenes adicionales HP (gammagrafía, PFP, CPET, TAC, RMC)
// ════════════════════════════════════════════════════════════
router.post('/adicional/:pacienteId', autenticar, requiereRol('neumólogo','cardiólogo','medico','fisioterapeuta','administrativo'), async (req, res) => {
  const { pacienteId } = req.params;
  const { tipo_examen, datos } = req.body;
  if (!tipo_examen || !datos) return res.status(400).json({ error: 'tipo_examen y datos son requeridos' });
  try {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    await query(
      `INSERT INTO examenes_adicionales_hp
        (id, paciente_id, tipo_examen, fecha_examen, ingresado_por, datos, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT DO NOTHING`,
      [id, pacienteId, tipo_examen, datos.fecha_examen||null, req.usuario.id, JSON.stringify(datos)]
    );
    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
       VALUES ('profesional',$1,'CREATE_EXAMEN_ADICIONAL','examenes_adicionales_hp',$2)`,
      [req.usuario.id, id]
    );
    return res.status(201).json({ ok: true, id, mensaje: tipo_examen + ' guardado correctamente' });
  } catch(err) {
    console.error('[POST /adicional]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/examenes/adicional/:pacienteId — historial exámenes adicionales
router.get('/adicional/:pacienteId', autenticar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, tipo_examen, fecha_examen, datos, created_at
       FROM examenes_adicionales_hp
       WHERE paciente_id = $1
       ORDER BY fecha_examen DESC NULLS LAST, created_at DESC`,
      [req.params.pacienteId]
    );
    return res.json({ examenes: rows });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

module.exports = router;
