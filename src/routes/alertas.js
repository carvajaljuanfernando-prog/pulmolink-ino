// src/routes/alertas.js
// Endpoints del módulo de monitoreo y alertas — PulmoLink INO

const express  = require('express');
const Joi      = require('joi');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();

const { query, transaction } = require('../config/db');
const { procesarReporte }    = require('../services/alertEngine');
const { autenticar, requiereRol } = require('../middleware/auth');

const esquemaReporte = Joi.object({
  paciente_id:         Joi.string().uuid().allow(null),
  disnea_escala:       Joi.number().integer().min(0).max(10),
  edema:               Joi.string().valid('ninguno','leve','moderado','severo'),
  sincope:             Joi.boolean(),
  hemoptisis:          Joi.boolean(),
  dolor_toracico:      Joi.boolean(),
  spo2:                Joi.number().integer().min(50).max(100).allow(null),
  efecto_adverso:      Joi.boolean(),
  efecto_adverso_desc: Joi.string().max(500).allow('', null),
  notas:               Joi.string().max(1000).allow('', null),
  foto_url:            Joi.string().uri().allow(null),
}).min(1);

router.post('/reportes', autenticar, async (req, res) => {
  const { error, value } = esquemaReporte.validate(req.body);
  if (error) {
    return res.status(400).json({ error: 'Datos inválidos', detalle: error.details[0].message });
  }

  const pacienteId = req.usuario.tipo === 'paciente'
    ? req.usuario.id
    : req.body.paciente_id;

  if (!pacienteId) {
    return res.status(400).json({ error: 'paciente_id requerido' });
  }

  try {
    const reporteId = uuidv4();
    await query(
      `INSERT INTO reportes_sintomas
        (id, paciente_id, disnea_escala, edema, sincope, hemoptisis,
         dolor_toracico, spo2, efecto_adverso, efecto_adverso_desc,
         notas, foto_url, reportado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        reporteId, pacienteId,
        value.disnea_escala ?? null,
        value.edema ?? null,
        value.sincope ?? false,
        value.hemoptisis ?? false,
        value.dolor_toracico ?? false,
        value.spo2 ?? null,
        value.efecto_adverso ?? false,
        value.efecto_adverso_desc ?? null,
        value.notas ?? null,
        value.foto_url ?? null,
        req.usuario.tipo,
      ]
    );

    const alerta = await procesarReporte(pacienteId, reporteId, value);

    const respuesta = { mensaje: 'Reporte recibido correctamente', reporte_id: reporteId, alerta: null };

    if (alerta) {
      respuesta.alerta = {
        id:     alerta.id,
        nivel:  alerta.nivel,
        motivo: alerta.motivo,
        mensaje_paciente: mensajeParaPaciente(alerta.nivel),
      };
    }

    return res.status(201).json(respuesta);
  } catch (err) {
    console.error('[POST /reportes]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/alertas', autenticar, requiereRol(), async (req, res) => {
  const { estado = 'pendiente', nivel, pagina = 1, limite = 20 } = req.query;
  const offset = (parseInt(pagina) - 1) * parseInt(limite);
  const params = [];
  const condiciones = [];

  if (estado !== 'todas') {
    params.push(estado);
    condiciones.push(`a.estado = $${params.length}`);
  }
  if (nivel) {
    params.push(nivel);
    condiciones.push(`a.nivel = $${params.length}`);
  }
  if (req.usuario.rol !== 'administrativo' && req.usuario.rol !== 'medico' && req.usuario.rol !== 'cardiólogo' && req.usuario.rol !== 'neumólogo' && req.usuario.rol !== 'enfermería') {
    params.push(req.usuario.id);
    condiciones.push(`a.profesional_notif_id = $${params.length}`);
  }

  const where = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';

  try {
    const { rows } = await query(
      `SELECT
         a.id, a.nivel, a.motivo, a.estado,
         a.created_at, a.notificado_at, a.vista_at,
         p.nombre || ' ' || p.apellido AS paciente_nombre,
         p.grupo_etario, p.clase_funcional_oms,
         rs.disnea_escala, rs.spo2, rs.edema, rs.sincope, rs.hemoptisis
       FROM alertas a
       JOIN pacientes p ON p.id = a.paciente_id
       LEFT JOIN reportes_sintomas rs ON rs.id = a.reporte_id
       ${where}
       ORDER BY
         CASE a.nivel WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 END,
         a.created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limite), offset]
    );

    return res.json({ alertas: rows, pagina: parseInt(pagina), limite: parseInt(limite) });
  } catch (err) {
    console.error('[GET /alertas]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.patch('/alertas/:id', autenticar, requiereRol(), async (req, res) => {
  const { id } = req.params;
  const esquemaActualizacion = Joi.object({
    estado:     Joi.string().valid('vista','en_proceso','resuelta').required(),
    resolucion: Joi.string().max(2000).when('estado', { is: 'resuelta', then: Joi.required() }),
  });

  const { error, value } = esquemaActualizacion.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const { rows } = await query(
      `UPDATE alertas
       SET estado = $1::text,
           resolucion = COALESCE($2::text, resolucion),
           vista_at = CASE WHEN $1::text = 'vista' THEN NOW() ELSE vista_at END,
           respondida_at = CASE WHEN $1::text = 'en_proceso' THEN NOW() ELSE respondida_at END,
           resuelta_at = CASE WHEN $1::text = 'resuelta' THEN NOW() ELSE resuelta_at END
       WHERE id = $3::uuid
       RETURNING id, estado, nivel, resuelta_at`,
      [value.estado, value.resolucion || null, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Alerta no encontrada' });

    await query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('profesional', $1, 'UPDATE_ALERTA', 'alertas', $2, $3)`,
      [req.usuario.id, id, JSON.stringify({ estado: value.estado })]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /alertas/:id]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/alertas/:id', autenticar, requiereRol(), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, p.nombre || ' ' || p.apellido AS paciente_nombre,
         p.grupo_etario, p.clase_funcional_oms, p.fecha_nacimiento,
         pr.nombre || ' ' || pr.apellido AS profesional_nombre, pr.especialidad,
         rs.*
       FROM alertas a
       JOIN pacientes p ON p.id = a.paciente_id
       LEFT JOIN profesionales pr ON pr.id = a.profesional_notif_id
       LEFT JOIN reportes_sintomas rs ON rs.id = a.reporte_id
       WHERE a.id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Alerta no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[GET /alertas/:id]', err.message);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

function mensajeParaPaciente(nivel) {
  const mensajes = {
    critica: 'Tu reporte fue marcado como urgente. El equipo médico del INO ha sido notificado de inmediato. Llama al 607 6972473 si necesitas atención urgente.',
    alta:    'Tu reporte ha sido revisado y el equipo INO fue notificado. Un profesional te contactará en las próximas horas.',
    media:   'Tu reporte fue recibido. El equipo de enfermería del programa HP lo revisará pronto.',
  };
  return mensajes[nivel];
}

module.exports = router;
