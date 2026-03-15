// src/middleware/auth.js
// Autenticación JWT + verificación de roles — PulmoLink INO

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_secreto_muy_largo_123!';

// ── Verificar token JWT ──────────────────────────────────────
async function autenticar(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;   // { id, tipo: 'paciente'|'profesional', rol, ... }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Verificar rol del profesional INO ───────────────────────
function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    // Los pacientes/cuidadores no tienen rol de profesional
    if (req.usuario.tipo !== 'profesional') {
      return res.status(403).json({ error: 'Acceso restringido a profesionales INO' });
    }
    if (roles.length > 0 && !roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso restringido. Roles permitidos: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

// ── Solo el propio paciente o su equipo puede acceder ────────
function pacienteOEquipo(req, res, next) {
  const { id, tipo } = req.usuario;
  const pacienteIdParam = req.params.pacienteId || req.params.id;

  if (tipo === 'paciente' && id !== pacienteIdParam) {
    return res.status(403).json({ error: 'Solo puedes acceder a tu propio perfil' });
  }
  // Los cuidadores solo acceden a los pacientes que tienen asignados
  // Los profesionales INO tienen acceso a todos (verificado arriba)
  next();
}

// ── Generar token de acceso ──────────────────────────────────
function generarToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '12h',
    issuer: 'pulmolink-ino',
  });
}

module.exports = { autenticar, requiereRol, pacienteOEquipo, generarToken };
