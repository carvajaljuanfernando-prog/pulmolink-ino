// src/routes/auth.js
// Endpoints de autenticación — PulmoLink INO

const express = require('express');
const Joi     = require('joi');
const router  = express.Router();

const {
  registrarPaciente,
  registrarProfesional,
  loginPaso1,
  loginPaso2MFA,
  renovarToken,
  cambiarPassword,
} = require('../services/authService');

const { autenticar } = require('../middleware/auth');

// ── Esquemas de validación ───────────────────────────────────

const esquemaPaciente = Joi.object({
  nombre:             Joi.string().min(2).max(80).required(),
  apellido:           Joi.string().min(2).max(80).required(),
  email:              Joi.string().email().required(),
  password:           Joi.string().min(8).max(128)
                        .pattern(/[A-Z]/, 'mayúscula')
                        .pattern(/[0-9]/, 'número')
                        .required()
                        .messages({
                          'string.pattern.name': 'La contraseña debe tener al menos una {#name}',
                          'string.min': 'La contraseña debe tener al menos 8 caracteres',
                        }),
  fecha_nacimiento:   Joi.date().max('now').required(),
  telefono:           Joi.string().pattern(/^\+?[0-9\s\-]{7,20}$/).allow(null, ''),
  documento_tipo:     Joi.string().valid('CC','TI','CE','pasaporte').allow(null),
  documento_numero:   Joi.string().max(20).allow(null, ''),
  diagnostico_hp:     Joi.string().max(200).allow(null, ''),
  grupo_hp_oms:       Joi.number().integer().min(1).max(5).allow(null),
  clase_funcional_oms:Joi.number().integer().min(1).max(4).allow(null),
  canal_preferido:    Joi.string().valid('app','sms','whatsapp','email').default('app'),
  cuidador_id:        Joi.string().uuid().allow(null),
  profesional_id:     Joi.string().uuid().allow(null),
  fecha_ingreso_prog: Joi.date().allow(null),
});

const esquemaProfesional = Joi.object({
  nombre:       Joi.string().min(2).max(80).required(),
  apellido:     Joi.string().min(2).max(80).required(),
  email:        Joi.string().email().required(),
  password:     Joi.string().min(10).max(128)
                  .pattern(/[A-Z]/, 'mayúscula')
                  .pattern(/[0-9]/, 'número')
                  .pattern(/[!@#$%^&*]/, 'símbolo')
                  .required(),
  especialidad: Joi.string().max(100).required(),
  rol:          Joi.string()
                  .valid('neumólogo','cardiólogo','enfermería','nutrición',
                         'psicología','fisioterapia','terapia_resp',
                         'medicina_gral','administrativo')
                  .required(),
  sede_ino:     Joi.string().valid('principal','machado','cabecera').default('principal'),
});

const esquemaLogin = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
  tipo:     Joi.string().valid('paciente','cuidador','profesional').required(),
});

const esquemaMFA = Joi.object({
  token_mfa:   Joi.string().required(),
  codigo_totp: Joi.string().length(6).pattern(/^\d{6}$/).required()
                 .messages({ 'string.pattern.base': 'El código debe ser de 6 dígitos' }),
});

const esquemaRefresh = Joi.object({
  refresh_token: Joi.string().required(),
});

const esquemaCambioPass = Joi.object({
  password_actual: Joi.string().required(),
  password_nueva:  Joi.string().min(8).max(128)
                     .pattern(/[A-Z]/, 'mayúscula')
                     .pattern(/[0-9]/, 'número')
                     .required(),
});

// ── Helper de validación ─────────────────────────────────────
function validar(esquema) {
  return (req, res, next) => {
    const { error, value } = esquema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalle: error.details.map(d => d.message),
      });
    }
    req.body = value;
    next();
  };
}

// ============================================================
// POST /api/v1/auth/registro/paciente
// Registrar un nuevo paciente en el Programa HP INO
// ============================================================
router.post('/registro/paciente', validar(esquemaPaciente), async (req, res) => {
  try {
    const paciente = await registrarPaciente(req.body);
    return res.status(201).json({
      mensaje: 'Paciente registrado en el Programa HP del INO correctamente',
      paciente,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/v1/auth/registro/profesional
// Solo accesible por administradores del sistema INO
// ============================================================
router.post('/registro/profesional', autenticar, async (req, res) => {
  // Solo administradores pueden registrar profesionales
  if (req.usuario.rol !== 'administrativo' && req.usuario.tipo !== 'profesional') {
    return res.status(403).json({ error: 'Solo administradores pueden registrar profesionales' });
  }

  const { error, value } = esquemaProfesional.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalle: error.details.map(d => d.message),
    });
  }

  try {
    const resultado = await registrarProfesional(value);
    return res.status(201).json({
      mensaje: 'Profesional INO registrado. Comparte el QR de MFA de forma segura.',
      profesional: resultado.profesional,
      mfa: resultado.mfa,    // ← El admin entrega el QR al profesional en persona
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/v1/auth/login
// Paso 1: email + contraseña
// ============================================================
router.post('/login', validar(esquemaLogin), async (req, res) => {
  const { email, password, tipo } = req.body;
  try {
    const resultado = await loginPaso1(email, password, tipo);
    return res.json(resultado);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/v1/auth/login/mfa
// Paso 2 (solo profesionales): verificar código TOTP
// ============================================================
router.post('/login/mfa', validar(esquemaMFA), async (req, res) => {
  const { token_mfa, codigo_totp } = req.body;
  try {
    const resultado = await loginPaso2MFA(token_mfa, codigo_totp);
    return res.json(resultado);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/v1/auth/refresh
// Renovar access token con refresh token
// ============================================================
router.post('/refresh', validar(esquemaRefresh), async (req, res) => {
  try {
    const resultado = await renovarToken(req.body.refresh_token);
    return res.json(resultado);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/v1/auth/cambiar-password
// Requiere estar autenticado
// ============================================================
router.post('/cambiar-password', autenticar, validar(esquemaCambioPass), async (req, res) => {
  try {
    const resultado = await cambiarPassword(
      req.usuario.id,
      req.usuario.tipo,
      req.body.password_actual,
      req.body.password_nueva
    );
    return res.json(resultado);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/v1/auth/me
// Perfil del usuario autenticado actual
// ============================================================
router.get('/me', autenticar, async (req, res) => {
  return res.json({ usuario: req.usuario });
});

module.exports = router;
