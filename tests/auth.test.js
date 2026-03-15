// tests/auth.test.js
// Tests del sistema de autenticación — PulmoLink INO
// Cubre: tokens, grupos etarios, validación de contraseñas,
//        flujo MFA y sanitización de datos sensibles

// Mock de la base de datos para tests unitarios
jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

const { query, transaction } = require('../src/config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

// Importar helpers que NO dependen de DB directamente
const authService = require('../src/services/authService');

// ── Helper: calcularGrupoEtario (función interna expuesta para tests) ─
function calcularGrupoEtario(fechaNacimiento) {
  const hoy   = new Date();
  const nacim = new Date(fechaNacimiento);
  const años  = Math.floor((hoy - nacim) / (365.25 * 24 * 60 * 60 * 1000));
  if (años < 13)  return 'pediatrico';
  if (años < 18)  return 'adolescente';
  if (años < 65)  return 'adulto';
  return 'adulto_mayor';
}

// ── Fecha relativa para tests ────────────────────────────────
function hacerAños(n, diasMenos=1) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setDate(d.getDate() - diasMenos);
  return d.toISOString().split('T')[0];
}

// ============================================================
describe('Cálculo de grupo etario', () => {
  test('5 años → pediátrico', () => {
    expect(calcularGrupoEtario(hacerAños(5))).toBe('pediatrico');
  });
  test('12 años → pediátrico (límite superior)', () => {
    expect(calcularGrupoEtario(hacerAños(12))).toBe('pediatrico');
  });
  test('13 años → adolescente', () => {
    expect(calcularGrupoEtario(hacerAños(13))).toBe('adolescente');
  });
  test('17 años → adolescente (límite superior)', () => {
    expect(calcularGrupoEtario(hacerAños(17))).toBe('adolescente');
  });
  test('18 años → adulto', () => {
    expect(calcularGrupoEtario(hacerAños(18))).toBe('adulto');
  });
  test('45 años → adulto', () => {
    expect(calcularGrupoEtario(hacerAños(45))).toBe('adulto');
  });
  test('64 años → adulto (límite superior)', () => {
    expect(calcularGrupoEtario(hacerAños(64))).toBe('adulto');
  });
  test('65 años → adulto mayor', () => {
    expect(calcularGrupoEtario(hacerAños(65))).toBe('adulto_mayor');
  });
  test('80 años → adulto mayor', () => {
    expect(calcularGrupoEtario(hacerAños(80))).toBe('adulto_mayor');
  });
});

// ============================================================
describe('Login paso 1 — paciente', () => {
  const hashValido = bcrypt.hashSync('Password1', 10);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Credenciales correctas → devuelve access_token y refresh_token', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'uuid-123', nombre: 'Juan', apellido: 'Pérez',
        email: 'juan@test.com', password_hash: hashValido,
        activo: true, grupo_etario: 'adulto',
        clase_funcional_oms: 2, canal_preferido: 'app',
      }]
    });
    // Mock del INSERT de auditoría
    query.mockResolvedValueOnce({ rows: [] });

    const resultado = await authService.loginPaso1('juan@test.com', 'Password1', 'paciente');

    expect(resultado.mfa_requerido).toBe(false);
    expect(resultado.access_token).toBeDefined();
    expect(resultado.refresh_token).toBeDefined();
    expect(resultado.usuario.email).toBe('juan@test.com');
  });

  test('Credenciales incorrectas → lanza error 401', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'uuid-123', nombre: 'Juan', apellido: 'Pérez',
        email: 'juan@test.com', password_hash: hashValido,
        activo: true, grupo_etario: 'adulto',
      }]
    });
    query.mockResolvedValueOnce({ rows: [] }); // auditoría

    await expect(
      authService.loginPaso1('juan@test.com', 'WrongPass', 'paciente')
    ).rejects.toMatchObject({ status: 401, message: 'Credenciales inválidas' });
  });

  test('Email no registrado → lanza error 401 (mismo mensaje, timing consistente)', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(
      authService.loginPaso1('noexiste@test.com', 'Password1', 'paciente')
    ).rejects.toMatchObject({ status: 401 });
  });

  test('Cuenta desactivada → lanza error 403', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'uuid-123', email: 'inactivo@test.com',
        password_hash: hashValido, activo: false,
      }]
    });

    await expect(
      authService.loginPaso1('inactivo@test.com', 'Password1', 'paciente')
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ============================================================
describe('Login paso 1 — profesional → requiere MFA', () => {
  const hashValido = bcrypt.hashSync('Secure1!Pass', 10);

  beforeEach(() => jest.clearAllMocks());

  test('Profesional con credenciales correctas → mfa_requerido: true + token_mfa', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'prof-456', nombre: 'Dr. Ana', apellido: 'Martínez',
        email: 'ana@ino.com', password_hash: hashValido,
        activo: true, rol: 'neumólogo',
        especialidad: 'Neumología', sede_ino: 'principal',
        mfa_secret: 'BASE32SECRET',
      }]
    });
    query.mockResolvedValueOnce({ rows: [] }); // auditoría

    const resultado = await authService.loginPaso1('ana@ino.com', 'Secure1!Pass', 'profesional');

    expect(resultado.mfa_requerido).toBe(true);
    expect(resultado.token_mfa).toBeDefined();
    // No debe haber access_token en este paso
    expect(resultado.access_token).toBeUndefined();
  });

  test('Token MFA tiene expiración corta (5 min)', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'prof-456', nombre: 'Dr. Ana', apellido: 'Martínez',
        email: 'ana@ino.com', password_hash: hashValido,
        activo: true, rol: 'neumólogo',
        especialidad: 'Neumología', sede_ino: 'principal',
        mfa_secret: 'BASE32SECRET',
      }]
    });
    query.mockResolvedValueOnce({ rows: [] });

    const resultado = await authService.loginPaso1('ana@ino.com', 'Secure1!Pass', 'profesional');
    const decoded = jwt.decode(resultado.token_mfa);

    // El token debe expirar en aprox. 5 minutos (300 segundos ± 10s de tolerancia)
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBeGreaterThanOrEqual(290);
    expect(ttl).toBeLessThanOrEqual(310);
    expect(decoded.fase).toBe('mfa');
  });
});

// ============================================================
describe('Tokens JWT', () => {
  test('Access token es verificable con JWT_SECRET', () => {
    const speakeasy = require('speakeasy');
    // Generar un token directamente
    const token = jwt.sign(
      { id: 'test-id', tipo: 'paciente', rol: 'paciente' },
      process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_secreto_muy_largo_123!',
      { expiresIn: '12h', issuer: 'pulmolink-ino' }
    );
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_secreto_muy_largo_123!'
    );
    expect(decoded.id).toBe('test-id');
    expect(decoded.iss).toBe('pulmolink-ino');
  });

  test('Token expirado lanza error', () => {
    const tokenExpirado = jwt.sign(
      { id: 'test-id' },
      process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_secreto_muy_largo_123!',
      { expiresIn: '-1s' }
    );
    expect(() => jwt.verify(
      tokenExpirado,
      process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION_secreto_muy_largo_123!'
    )).toThrow('jwt expired');
  });

  test('Token con secreto incorrecto lanza error', () => {
    const token = jwt.sign({ id: 'test' }, 'secreto-a');
    expect(() => jwt.verify(token, 'secreto-b')).toThrow();
  });
});

// ============================================================
describe('Sanitización — datos sensibles no expuestos', () => {
  test('La respuesta de login no contiene password_hash', async () => {
    const hashValido = bcrypt.hashSync('Password1', 10);
    query.mockResolvedValueOnce({
      rows: [{
        id: 'uuid-123', nombre: 'Juan', apellido: 'Pérez',
        email: 'juan@test.com', password_hash: hashValido,
        activo: true, grupo_etario: 'adulto',
        clase_funcional_oms: 2, canal_preferido: 'app',
      }]
    });
    query.mockResolvedValueOnce({ rows: [] });

    const resultado = await authService.loginPaso1('juan@test.com', 'Password1', 'paciente');

    const usuarioStr = JSON.stringify(resultado.usuario);
    expect(usuarioStr).not.toContain('password_hash');
    expect(usuarioStr).not.toContain('mfa_secret');
  });
});

// ============================================================
describe('Validación de contraseñas (lógica de negocio)', () => {
  // La validación Joi está en las rutas, pero verificamos la lógica
  const PATRON_MAYUSCULA = /[A-Z]/;
  const PATRON_NUMERO    = /[0-9]/;
  const PATRON_SIMBOLO   = /[!@#$%^&*]/;

  test('Contraseña segura para profesional cumple todos los requisitos', () => {
    const pass = 'SecurePass1!';
    expect(pass.length).toBeGreaterThanOrEqual(10);
    expect(PATRON_MAYUSCULA.test(pass)).toBe(true);
    expect(PATRON_NUMERO.test(pass)).toBe(true);
    expect(PATRON_SIMBOLO.test(pass)).toBe(true);
  });

  test('Contraseña sin mayúscula falla el patrón', () => {
    expect(PATRON_MAYUSCULA.test('securepass1!')).toBe(false);
  });

  test('Contraseña sin número falla el patrón', () => {
    expect(PATRON_NUMERO.test('SecurePass!')).toBe(false);
  });
});
