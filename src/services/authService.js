// src/services/authService.js
// Autenticación completa — PulmoLink INO
// Cubre: registro, login, MFA (TOTP), refresh tokens, cambio de contraseña

const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/db');

const JWT_SECRET         = process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_secreto_muy_largo_123!';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'REFRESH_CAMBIAR_EN_PRODUCCION_456!';
const SALT_ROUNDS        = 12;

// ============================================================
// TOKENS
// ============================================================

function generarAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '12h',
    issuer: 'pulmolink-ino',
    jwtid: uuidv4(),
  });
}

function generarRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: '30d',
    issuer: 'pulmolink-ino',
  });
}

function verificarRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

// ============================================================
// REGISTRO DE PACIENTE
// Llamado tras la cita de ingreso al Programa HP del INO
// ============================================================
async function registrarPaciente(datos) {
  const {
    nombre, apellido, email, password,
    fecha_nacimiento, telefono,
    documento_tipo, documento_numero,
    diagnostico_hp, grupo_hp_oms,
    clase_funcional_oms, canal_preferido,
    cuidador_id, profesional_id,
    fecha_ingreso_prog,
  } = datos;

  // Calcular grupo etario a partir de fecha de nacimiento
  const grupo_etario = calcularGrupoEtario(fecha_nacimiento);

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  return transaction(async (client) => {
    // Verificar que el email no exista
    const { rows: existe } = await client.query(
      'SELECT id FROM pacientes WHERE email = $1',
      [email]
    );
    if (existe.length > 0) {
      const err = new Error('El email ya está registrado');
      err.status = 409;
      throw err;
    }

    const { rows } = await client.query(
      `INSERT INTO pacientes
        (id, nombre, apellido, email, password_hash,
         fecha_nacimiento, grupo_etario, telefono,
         documento_tipo, documento_numero,
         diagnostico_hp, grupo_hp_oms, clase_funcional_oms,
         canal_preferido, cuidador_id, profesional_id,
         fecha_ingreso_prog, consentimiento_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
       RETURNING id, nombre, apellido, email, grupo_etario, clase_funcional_oms`,
      [
        uuidv4(), nombre, apellido, email, password_hash,
        fecha_nacimiento, grupo_etario, telefono || null,
        documento_tipo || null, documento_numero || null,
        diagnostico_hp || null, grupo_hp_oms || null,
        clase_funcional_oms || null,
        canal_preferido || 'app',
        cuidador_id || null, profesional_id || null,
        fecha_ingreso_prog || null,
      ]
    );

    await client.query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
       VALUES ('sistema', $1, 'REGISTRO_PACIENTE', 'pacientes', $1)`,
      [rows[0].id]
    );

    return rows[0];
  });
}

// ============================================================
// REGISTRO DE PROFESIONAL INO
// Solo puede hacerlo un administrador del sistema
// ============================================================
async function registrarProfesional(datos) {
  const {
    nombre, apellido, email, password,
    especialidad, rol, sede_ino,
  } = datos;

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  // Generar secreto MFA (TOTP) — el profesional lo configura en su primera sesión
  const mfa_secret = speakeasy.generateSecret({
    name: `PulmoLink INO (${email})`,
    length: 20,
  });

  return transaction(async (client) => {
    const { rows: existe } = await client.query(
      'SELECT id FROM profesionales WHERE email = $1', [email]
    );
    if (existe.length > 0) {
      const err = new Error('El email ya está registrado');
      err.status = 409;
      throw err;
    }

    const { rows } = await client.query(
      `INSERT INTO profesionales
        (id, nombre, apellido, email, password_hash,
         especialidad, rol, sede_ino, mfa_secret)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, nombre, apellido, email, rol, especialidad, sede_ino`,
      [
        uuidv4(), nombre, apellido, email, password_hash,
        especialidad, rol,
        sede_ino || 'principal',
        mfa_secret.base32,   // almacenado encriptado en producción
      ]
    );

    await client.query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id)
       VALUES ('sistema', $1, 'REGISTRO_PROFESIONAL', 'profesionales', $1)`,
      [rows[0].id]
    );

    return {
      profesional: rows[0],
      mfa: {
        secret:   mfa_secret.base32,
        otpauth:  mfa_secret.otpauth_url,  // para generar el QR
      },
    };
  });
}

// ============================================================
// LOGIN — PASO 1: email + contraseña
// Si es profesional, devuelve mfa_requerido: true
// Si es paciente/cuidador, devuelve tokens directamente
// ============================================================
async function loginPaso1(email, password, tipo) {
  const tabla = tipo === 'profesional' ? 'profesionales' : 
                tipo === 'cuidador'    ? 'cuidadores'    : 'pacientes';

  const { rows } = await query(
    `SELECT id, nombre, apellido, email, password_hash,
            activo,
            ${tipo === 'profesional' ? 'rol, especialidad, sede_ino, mfa_secret' : 
              tipo === 'cuidador'    ? "'cuidador' AS rol" : 
                                      'grupo_etario, clase_funcional_oms, canal_preferido'}
     FROM ${tabla}
     WHERE email = $1`,
    [email]
  );

  if (rows.length === 0) {
    // Siempre usar el mismo tiempo de respuesta para no revelar si el email existe
    await bcrypt.hash('dummy', SALT_ROUNDS);
    const err = new Error('Credenciales inválidas');
    err.status = 401;
    throw err;
  }

  const usuario = rows[0];

  if (!usuario.activo) {
    const err = new Error('Cuenta desactivada. Contacta al equipo INO.');
    err.status = 403;
    throw err;
  }

  const passwordValido = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordValido) {
    await registrarIntentoFallido(usuario.id, tipo);
    const err = new Error('Credenciales inválidas');
    err.status = 401;
    throw err;
  }

  // Registrar acceso exitoso paso 1
  await query(
    `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla)
     VALUES ($1, $2, 'LOGIN_P1_OK', $3)`,
    [tipo, usuario.id, tabla]
  );

  // Profesionales requieren MFA (TOTP)
  if (tipo === 'profesional') {
    // Token temporal de corta vida solo para completar el MFA
    const tokenMFA = jwt.sign(
      { id: usuario.id, tipo, fase: 'mfa', rol: usuario.rol },
      JWT_SECRET,
      { expiresIn: '5m', issuer: 'pulmolink-ino' }
    );
    return {
      mfa_requerido: true,
      token_mfa: tokenMFA,
      usuario: {
        nombre: usuario.nombre,
        rol:    usuario.rol,
      },
    };
  }

  // Pacientes y cuidadores: tokens directamente
  const payload = construirPayload(usuario, tipo);
  return {
    mfa_requerido: false,
    access_token:  generarAccessToken(payload),
    refresh_token: generarRefreshToken({ id: usuario.id, tipo }),
    usuario: sanitizarUsuario(usuario, tipo),
  };
}

// ============================================================
// LOGIN — PASO 2: verificar código TOTP (solo profesionales)
// ============================================================
async function loginPaso2MFA(tokenMFA, codigoTOTP) {
  let payload;
  try {
    payload = jwt.verify(tokenMFA, JWT_SECRET);
  } catch {
    const err = new Error('Token MFA inválido o expirado. Inicia sesión de nuevo.');
    err.status = 401;
    throw err;
  }

  if (payload.fase !== 'mfa' || payload.tipo !== 'profesional') {
    const err = new Error('Token inválido para este paso');
    err.status = 401;
    throw err;
  }

  // Obtener el secreto MFA del profesional
  const { rows } = await query(
    'SELECT id, nombre, apellido, email, rol, especialidad, sede_ino, mfa_secret FROM profesionales WHERE id = $1 AND activo = true',
    [payload.id]
  );

  if (rows.length === 0) {
    const err = new Error('Profesional no encontrado');
    err.status = 404;
    throw err;
  }

  const profesional = rows[0];

  // Verificar código TOTP (ventana de ±1 período = 60 segundos de tolerancia)
  const codigoValido = speakeasy.totp.verify({
    secret:   profesional.mfa_secret,
    encoding: 'base32',
    token:    codigoTOTP,
    window:   1,
  });

  if (!codigoValido) {
    await registrarIntentoFallido(profesional.id, 'profesional');
    const err = new Error('Código MFA incorrecto');
    err.status = 401;
    throw err;
  }

  // MFA exitoso → emitir tokens definitivos
  const tokenPayload = construirPayload(profesional, 'profesional');

  await query(
    `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla)
     VALUES ('profesional', $1, 'LOGIN_MFA_OK', 'profesionales')`,
    [profesional.id]
  );

  return {
    access_token:  generarAccessToken(tokenPayload),
    refresh_token: generarRefreshToken({ id: profesional.id, tipo: 'profesional' }),
    usuario: sanitizarUsuario(profesional, 'profesional'),
  };
}

// ============================================================
// REFRESH TOKEN — renovar access token sin re-login
// ============================================================
async function renovarToken(refreshToken) {
  let payload;
  try {
    payload = verificarRefreshToken(refreshToken);
  } catch {
    const err = new Error('Refresh token inválido o expirado');
    err.status = 401;
    throw err;
  }

  const { id, tipo } = payload;
  const tabla = tipo === 'profesional' ? 'profesionales' :
                tipo === 'cuidador'    ? 'cuidadores'    : 'pacientes';

  const cols = tipo === 'profesional'
    ? 'id, nombre, apellido, email, rol, especialidad, sede_ino, activo'
    : tipo === 'cuidador'
    ? "id, nombre, apellido, email, activo, 'cuidador' AS rol"
    : 'id, nombre, apellido, email, grupo_etario, clase_funcional_oms, activo';

  const { rows } = await query(
    `SELECT ${cols} FROM ${tabla} WHERE id = $1`,
    [id]
  );

  if (rows.length === 0 || !rows[0].activo) {
    const err = new Error('Usuario no encontrado o desactivado');
    err.status = 401;
    throw err;
  }

  const tokenPayload = construirPayload(rows[0], tipo);
  return {
    access_token: generarAccessToken(tokenPayload),
  };
}

// ============================================================
// CAMBIO DE CONTRASEÑA
// ============================================================
async function cambiarPassword(usuarioId, tipo, passwordActual, passwordNueva) {
  const tabla = tipo === 'profesional' ? 'profesionales' :
                tipo === 'cuidador'    ? 'cuidadores'    : 'pacientes';

  const { rows } = await query(
    `SELECT id, password_hash FROM ${tabla} WHERE id = $1`,
    [usuarioId]
  );

  if (rows.length === 0) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }

  const valido = await bcrypt.compare(passwordActual, rows[0].password_hash);
  if (!valido) {
    const err = new Error('Contraseña actual incorrecta');
    err.status = 401;
    throw err;
  }

  const nuevoHash = await bcrypt.hash(passwordNueva, SALT_ROUNDS);
  await query(
    `UPDATE ${tabla} SET password_hash = $1 WHERE id = $2`,
    [nuevoHash, usuarioId]
  );

  await query(
    `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla)
     VALUES ($1, $2, 'CAMBIO_PASSWORD', $3)`,
    [tipo, usuarioId, tabla]
  );

  return { mensaje: 'Contraseña actualizada correctamente' };
}

// ============================================================
// HELPERS INTERNOS
// ============================================================

function calcularGrupoEtario(fechaNacimiento) {
  const hoy   = new Date();
  const nacim = new Date(fechaNacimiento);
  const años  = Math.floor((hoy - nacim) / (365.25 * 24 * 60 * 60 * 1000));
  if (años < 13)  return 'pediatrico';
  if (años < 18)  return 'adolescente';
  if (años < 65)  return 'adulto';
  return 'adulto_mayor';
}

function construirPayload(usuario, tipo) {
  const base = { id: usuario.id, tipo, email: usuario.email };
  if (tipo === 'profesional') {
    return { ...base, rol: usuario.rol, especialidad: usuario.especialidad, sede: usuario.sede_ino };
  }
  if (tipo === 'paciente') {
    return { ...base, rol: 'paciente', grupo_etario: usuario.grupo_etario };
  }
  return { ...base, rol: 'cuidador' };
}

function sanitizarUsuario(usuario, tipo) {
  const { password_hash, mfa_secret, ...limpio } = usuario;
  return { ...limpio, tipo };
}

async function registrarIntentoFallido(usuarioId, tipo) {
  await query(
    `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla)
     VALUES ($1, $2, 'LOGIN_FALLIDO', $3)`,
    [tipo, usuarioId, tipo === 'profesional' ? 'profesionales' : 'pacientes']
  ).catch(() => {}); // no bloquear el flujo si falla el log
}

module.exports = {
  registrarPaciente,
  registrarProfesional,
  loginPaso1,
  loginPaso2MFA,
  renovarToken,
  cambiarPassword,
};
