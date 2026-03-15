// tests/alertEngine.test.js
// Tests del motor de reglas clínicas — PulmoLink INO
// Cada caso reproduce un escenario clínico real del Programa HP

const { evaluarReporte } = require('../src/services/alertEngine');

describe('Motor de Alertas — Reglas Clínicas INO', () => {

  // ── ALERTAS CRÍTICAS ─────────────────────────────────────

  describe('Nivel CRÍTICO', () => {
    test('Síncope → alerta crítica', () => {
      const reporte = { sincope: true };
      const resultado = evaluarReporte(reporte);
      expect(resultado.nivel).toBe('critica');
      expect(resultado.motivo).toMatch(/síncope/i);
    });

    test('Hemoptisis → alerta crítica', () => {
      const reporte = { hemoptisis: true };
      const resultado = evaluarReporte(reporte);
      expect(resultado.nivel).toBe('critica');
      expect(resultado.motivo).toMatch(/hemoptisis/i);
    });

    test('SpO2 ≤ 85% → alerta crítica', () => {
      const reporte = { spo2: 82 };
      const resultado = evaluarReporte(reporte);
      expect(resultado.nivel).toBe('critica');
      expect(resultado.motivo).toMatch(/82%/);
    });

    test('SpO2 exactamente 85% → alerta crítica', () => {
      const resultado = evaluarReporte({ spo2: 85 });
      expect(resultado.nivel).toBe('critica');
    });

    test('Disnea escala 9 → alerta crítica', () => {
      const resultado = evaluarReporte({ disnea_escala: 9 });
      expect(resultado.nivel).toBe('critica');
      expect(resultado.motivo).toMatch(/9\/10/);
    });

    test('Disnea escala 10 → alerta crítica', () => {
      const resultado = evaluarReporte({ disnea_escala: 10 });
      expect(resultado.nivel).toBe('critica');
    });

    test('Dolor torácico + disnea 7 → alerta crítica', () => {
      const resultado = evaluarReporte({ dolor_toracico: true, disnea_escala: 7 });
      expect(resultado.nivel).toBe('critica');
    });

    // Síncope siempre es crítico, sin importar otros valores
    test('Síncope + edema leve → sigue siendo crítico (síncope tiene prioridad)', () => {
      const resultado = evaluarReporte({ sincope: true, edema: 'leve' });
      expect(resultado.nivel).toBe('critica');
    });
  });

  // ── ALERTAS ALTAS ────────────────────────────────────────

  describe('Nivel ALTO', () => {
    test('Disnea escala 7 sin síncope ni hemoptisis → alerta alta', () => {
      const resultado = evaluarReporte({ disnea_escala: 7 });
      expect(resultado.nivel).toBe('alta');
      expect(resultado.motivo).toMatch(/7\/10/);
    });

    test('Disnea escala 8 → alerta alta', () => {
      const resultado = evaluarReporte({ disnea_escala: 8 });
      expect(resultado.nivel).toBe('alta');
    });

    test('Edema severo → alerta alta', () => {
      const resultado = evaluarReporte({ edema: 'severo' });
      expect(resultado.nivel).toBe('alta');
      expect(resultado.motivo).toMatch(/severo/i);
    });

    test('Edema moderado + disnea 6 → alerta alta', () => {
      const resultado = evaluarReporte({ edema: 'moderado', disnea_escala: 6 });
      expect(resultado.nivel).toBe('alta');
    });

    test('SpO2 entre 86 y 90% → alerta alta', () => {
      const resultado = evaluarReporte({ spo2: 88 });
      expect(resultado.nivel).toBe('alta');
      expect(resultado.motivo).toMatch(/88%/);
    });

    test('SpO2 exactamente 90% → alerta alta', () => {
      const resultado = evaluarReporte({ spo2: 90 });
      expect(resultado.nivel).toBe('alta');
    });

    test('Efecto adverso + disnea 5 → alerta alta', () => {
      const resultado = evaluarReporte({ efecto_adverso: true, disnea_escala: 5 });
      expect(resultado.nivel).toBe('alta');
    });
  });

  // ── ALERTAS MEDIAS ───────────────────────────────────────

  describe('Nivel MEDIO', () => {
    test('Disnea escala 5 → alerta media', () => {
      const resultado = evaluarReporte({ disnea_escala: 5 });
      expect(resultado.nivel).toBe('media');
    });

    test('Disnea escala 6 sin otros criterios → alerta media', () => {
      const resultado = evaluarReporte({ disnea_escala: 6 });
      // disnea 6 solo (sin edema) → media
      expect(resultado.nivel).toBe('media');
    });

    test('Edema moderado sin disnea → alerta media', () => {
      const resultado = evaluarReporte({ edema: 'moderado' });
      expect(resultado.nivel).toBe('media');
    });

    test('Efecto adverso solo → alerta media', () => {
      const resultado = evaluarReporte({ efecto_adverso: true });
      expect(resultado.nivel).toBe('media');
    });

    test('Dolor torácico solo → alerta media', () => {
      const resultado = evaluarReporte({ dolor_toracico: true });
      expect(resultado.nivel).toBe('media');
    });
  });

  // ── SIN ALERTA ───────────────────────────────────────────

  describe('Sin alerta (reporte normal)', () => {
    test('Disnea leve (escala 3) → sin alerta', () => {
      const resultado = evaluarReporte({ disnea_escala: 3 });
      expect(resultado).toBeNull();
    });

    test('Edema leve → sin alerta', () => {
      const resultado = evaluarReporte({ edema: 'leve' });
      expect(resultado).toBeNull();
    });

    test('SpO2 normal (95%) → sin alerta', () => {
      const resultado = evaluarReporte({ spo2: 95 });
      expect(resultado).toBeNull();
    });

    test('Reporte vacío (todo normal) → sin alerta', () => {
      const resultado = evaluarReporte({
        disnea_escala: 2,
        edema: 'ninguno',
        sincope: false,
        hemoptisis: false,
        dolor_toracico: false,
        spo2: 94,
        efecto_adverso: false,
      });
      expect(resultado).toBeNull();
    });

    test('Nota de texto sola → sin alerta', () => {
      const resultado = evaluarReporte({ notas: 'Me siento bien hoy' });
      expect(resultado).toBeNull();
    });
  });

  // ── CASOS BORDE ──────────────────────────────────────────

  describe('Casos borde y prioridad de reglas', () => {
    test('SpO2 86% (límite superior hipoxemia alta) → alta, no media', () => {
      const resultado = evaluarReporte({ spo2: 86 });
      expect(resultado.nivel).toBe('alta');
    });

    test('SpO2 91% → sin alerta (sobre el umbral)', () => {
      const resultado = evaluarReporte({ spo2: 91 });
      expect(resultado).toBeNull();
    });

    test('Múltiples criterios → retorna el más grave (crítica > alta)', () => {
      // hemoptisis (crítica) + edema moderado (alta) → crítica
      const resultado = evaluarReporte({ hemoptisis: true, edema: 'moderado' });
      expect(resultado.nivel).toBe('critica');
    });

    test('Disnea 4 → sin alerta (umbral mínimo es 5)', () => {
      const resultado = evaluarReporte({ disnea_escala: 4 });
      expect(resultado).toBeNull();
    });
  });
});
