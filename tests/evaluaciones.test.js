const { calcularSF12, transformarItem } = require('../src/services/sf12Service');
const { calcularMorisky, clasificarOMS, compararEvaluaciones } = require('../src/services/evaluacionService');

const SF12_EXCELENTE   = { GH1:1, PF02:3, PF04:3, RP2:5, RP3:5, RE2:5, RE3:5, BP2:1, MH3:1, VT2:1, MH4:5, SF2:5 };
const SF12_DETERIORADO = { GH1:5, PF02:1, PF04:1, RP2:1, RP3:1, RE2:1, RE3:1, BP2:5, MH3:5, VT2:5, MH4:1, SF2:1 };
const SF12_CLASE3_HP   = { GH1:4, PF02:1, PF04:1, RP2:2, RP3:2, RE2:3, RE3:3, BP2:3, MH3:3, VT2:4, MH4:3, SF2:2 };
const MORISKY_ALTA  = { M1:false, M2:false, M3:false, M4:false, M5:true,  M6:false, M7:false, M8:0 };
const MORISKY_MEDIA = { M1:true,  M2:false, M3:false, M4:true,  M5:true,  M6:false, M7:false, M8:0 };
const MORISKY_BAJA  = { M1:true,  M2:true,  M3:true,  M4:true,  M5:false, M6:true,  M7:true,  M8:0.75 };

describe('SF-12 — Transformación de ítems', () => {
  test('PF02/PF04 (3 opciones): 1→0, 2→50, 3→100', () => {
    expect(transformarItem('PF02', 1)).toBe(0);
    expect(transformarItem('PF02', 2)).toBe(50);
    expect(transformarItem('PF02', 3)).toBe(100);
  });
  test('GH1 (invertido): 1→100, 3→50, 5→0', () => {
    expect(transformarItem('GH1', 1)).toBe(100);
    expect(transformarItem('GH1', 3)).toBe(50);
    expect(transformarItem('GH1', 5)).toBe(0);
  });
  test('BP2 (invertido): 1→100, 5→0', () => {
    expect(transformarItem('BP2', 1)).toBe(100);
    expect(transformarItem('BP2', 5)).toBe(0);
  });
  test('MH4 (invertido): 1→100, 5→0', () => {
    expect(transformarItem('MH4', 1)).toBe(100);
    expect(transformarItem('MH4', 5)).toBe(0);
  });
  test('RP2 (directo): 1→0, 5→100', () => {
    expect(transformarItem('RP2', 1)).toBe(0);
    expect(transformarItem('RP2', 5)).toBe(100);
  });
  test('MH3 (directo): 1→0, 5→100', () => {
    expect(transformarItem('MH3', 1)).toBe(0);
    expect(transformarItem('MH3', 5)).toBe(100);
  });
});

describe('SF-12 — Cálculo de PCS y MCS (algoritmo Ware 2002)', () => {
  test('PCS excelente > PCS deteriorado (diferencia clínicamente significativa)', () => {
    const exc = calcularSF12(SF12_EXCELENTE);
    const det = calcularSF12(SF12_DETERIORADO);
    // La mayor limitación física debe dar PCS más bajo
    expect(exc.pcs).toBeGreaterThan(det.pcs);
    expect(exc.pcs - det.pcs).toBeGreaterThan(30); // diferencia grande
  });
  test('Salud muy deteriorada → PCS < 30', () => {
    const r = calcularSF12(SF12_DETERIORADO);
    expect(r.pcs).toBeLessThan(30);
  });
  test('Salud excelente → PCS > 55', () => {
    const r = calcularSF12(SF12_EXCELENTE);
    expect(r.pcs).toBeGreaterThan(55);
  });
  test('Paciente HP Clase III → PCS muy bajo (< 25)', () => {
    const r = calcularSF12(SF12_CLASE3_HP);
    expect(r.pcs).toBeLessThan(25);
  });
  test('PCS y MCS redondeados a 2 decimales', () => {
    const r = calcularSF12(SF12_EXCELENTE);
    expect(r.pcs).toBe(Math.round(r.pcs * 100) / 100);
    expect(r.mcs).toBe(Math.round(r.mcs * 100) / 100);
  });
  test('Devuelve interpretación con nivel y texto', () => {
    const r = calcularSF12(SF12_CLASE3_HP);
    expect(['bueno','promedio','bajo','muy_bajo']).toContain(r.interpretacion.pcs.nivel);
    expect(r.interpretacion.pcs.texto).toBeTruthy();
    expect(r.interpretacion.global).toBeTruthy();
  });
  test('HP Clase III → interpretación "muy_bajo" en PCS', () => {
    const r = calcularSF12(SF12_CLASE3_HP);
    expect(r.interpretacion.pcs.nivel).toBe('muy_bajo');
  });
  test('Salud deteriorada → interpretación "muy_bajo" en PCS', () => {
    const r = calcularSF12(SF12_DETERIORADO);
    expect(r.interpretacion.pcs.nivel).toBe('muy_bajo');
  });
  test('Falta ítem → error descriptivo', () => {
    const inc = { ...SF12_EXCELENTE }; delete inc.GH1;
    expect(() => calcularSF12(inc)).toThrow('Faltan ítems del SF-12: GH1');
  });
  test('Faltan varios ítems → error menciona todos', () => {
    expect(() => calcularSF12({ GH1:1, PF02:3 })).toThrow('Faltan ítems del SF-12');
  });
  test('Devuelve 12 items_transformados', () => {
    expect(Object.keys(calcularSF12(SF12_EXCELENTE).items_transformados)).toHaveLength(12);
  });
});

describe('Morisky-8 — Cálculo y clasificación', () => {
  test('Adherencia perfecta → puntaje 8, clasificación "alta"', () => {
    const r = calcularMorisky(MORISKY_ALTA);
    expect(r.puntaje).toBe(8);
    expect(r.clasificacion).toBe('alta');
    expect(r.genera_alerta).toBe(false);
  });
  test('Adherencia media → 6 ≤ puntaje < 8, clasificación "media"', () => {
    const r = calcularMorisky(MORISKY_MEDIA);
    expect(r.puntaje).toBeGreaterThanOrEqual(6);
    expect(r.puntaje).toBeLessThan(8);
    expect(r.clasificacion).toBe('media');
    expect(r.genera_alerta).toBe(false);
  });
  test('Baja adherencia → puntaje < 6, genera alerta', () => {
    const r = calcularMorisky(MORISKY_BAJA);
    expect(r.puntaje).toBeLessThan(6);
    expect(r.clasificacion).toBe('baja');
    expect(r.genera_alerta).toBe(true);
  });
  test('M5 invertida: no tomó ayer (false) → menos puntos que sí tomó', () => {
    const r1 = calcularMorisky({ ...MORISKY_ALTA, M5: false });
    const r2 = calcularMorisky({ ...MORISKY_ALTA, M5: true });
    expect(r2.puntaje).toBeGreaterThan(r1.puntaje);
  });
  test('M8 a veces (0.5) → 0.5 pts menos que nunca (0)', () => {
    const base  = calcularMorisky({ ...MORISKY_ALTA, M8: 0 });
    const conM8 = calcularMorisky({ ...MORISKY_ALTA, M8: 0.5 });
    expect(base.puntaje - conM8.puntaje).toBeCloseTo(0.5, 5);
  });
  test('Items problema identificados correctamente', () => {
    const r = calcularMorisky(MORISKY_BAJA);
    expect(r.items_problema).toContain('M1');
    expect(r.items_problema).toContain('M2');
    expect(r.items_problema).toContain('M5');
  });
  test('Falta ítem → error descriptivo', () => {
    const inc = { ...MORISKY_ALTA }; delete inc.M3;
    expect(() => calcularMorisky(inc)).toThrow('Faltan ítems del Morisky-8: M3');
  });
  test('Incluye recomendación clínica en todos los niveles', () => {
    expect(calcularMorisky(MORISKY_ALTA).recomendacion).toBeTruthy();
    expect(calcularMorisky(MORISKY_MEDIA).recomendacion).toBeTruthy();
    expect(calcularMorisky(MORISKY_BAJA).recomendacion).toBeTruthy();
  });
});

describe('Clasificación Funcional OMS', () => {
  test('Síntomas en reposo → Clase IV, urgencia alta', () => {
    const r = clasificarOMS({ O1:true, O2:false, O3:true, O4:false, O5:false, O6:false, O7:false, O8:true });
    expect(r.clase_orientativa).toBe(4);
    expect(r.urgencia_revision).toBe('alta');
  });
  test('Actividad mínima con síntomas → Clase IV', () => {
    const r = clasificarOMS({ O1:false, O2:true, O3:true, O4:false, O5:false, O6:false, O7:false, O8:true });
    expect(r.clase_orientativa).toBe(4);
  });
  test('Síncope → Clase IV', () => {
    const r = clasificarOMS({ O1:false, O2:false, O3:true, O4:false, O5:false, O6:true, O7:false, O8:true });
    expect(r.clase_orientativa).toBe(4);
  });
  test('Síntomas al caminar 5 min → Clase III', () => {
    const r = clasificarOMS({ O1:false, O2:false, O3:true, O4:false, O5:false, O6:false, O7:false, O8:false });
    expect(r.clase_orientativa).toBe(3);
    expect(r.urgencia_revision).toBe('media');
  });
  test('Reducción de actividad → Clase III', () => {
    const r = clasificarOMS({ O1:false, O2:false, O3:false, O4:false, O5:true, O6:false, O7:false, O8:true });
    expect(r.clase_orientativa).toBe(3);
  });
  test('Puede hacer lo habitual pero se queda atrás → Clase II', () => {
    const r = clasificarOMS({ O1:false, O2:false, O3:false, O4:true, O5:true, O6:false, O7:false, O8:false });
    expect(r.clase_orientativa).toBe(2);
    expect(r.urgencia_revision).toBe('baja');
  });
  test('Sin limitación → Clase I, urgencia ninguna', () => {
    const r = clasificarOMS({ O1:false, O2:false, O3:false, O4:true, O5:true, O6:false, O7:true, O8:false });
    expect(r.clase_orientativa).toBe(1);
    expect(r.urgencia_revision).toBe('ninguna');
  });
  test('Siempre incluye advertencia de evaluación médica INO', () => {
    const r = clasificarOMS({ O1:false, O2:false, O3:false, O4:true, O5:true, O6:false, O7:true, O8:false });
    expect(r.advertencia).toContain('médico tratante');
    expect(r.advertencia).toContain('INO');
  });
});

describe('Comparación longitudinal de evaluaciones', () => {
  test('SF-12: mejora PCS >2 pts → tendencia "mejora"', () => {
    const r = compararEvaluaciones(
      { tipo:'sf12', puntaje_pcs:35.0, puntaje_mcs:45.0 },
      { tipo:'sf12', puntaje_pcs:39.5, puntaje_mcs:46.0 }
    );
    expect(r.pcs.tendencia).toBe('mejora');
    expect(r.pcs.delta).toBeCloseTo(4.5, 1);
  });
  test('SF-12: deterioro PCS >2 pts → tendencia "deterioro"', () => {
    const r = compararEvaluaciones(
      { tipo:'sf12', puntaje_pcs:42.0, puntaje_mcs:50.0 },
      { tipo:'sf12', puntaje_pcs:37.0, puntaje_mcs:49.0 }
    );
    expect(r.pcs.tendencia).toBe('deterioro');
  });
  test('SF-12: cambio ≤2 pts → tendencia "estable"', () => {
    const r = compararEvaluaciones(
      { tipo:'sf12', puntaje_pcs:44.0, puntaje_mcs:48.0 },
      { tipo:'sf12', puntaje_pcs:45.0, puntaje_mcs:47.5 }
    );
    expect(r.pcs.tendencia).toBe('estable');
    expect(r.mcs.tendencia).toBe('estable');
  });
  test('SF-12: cambio ≥3 pts → cambio_clinico_significativo = true (MCID)', () => {
    const r = compararEvaluaciones(
      { tipo:'sf12', puntaje_pcs:40.0, puntaje_mcs:45.0 },
      { tipo:'sf12', puntaje_pcs:43.5, puntaje_mcs:45.5 }
    );
    expect(r.cambio_clinico_significativo).toBe(true);
  });
  test('SF-12: cambio <3 pts → cambio_clinico_significativo = false', () => {
    const r = compararEvaluaciones(
      { tipo:'sf12', puntaje_pcs:44.0, puntaje_mcs:48.0 },
      { tipo:'sf12', puntaje_pcs:45.5, puntaje_mcs:49.0 }
    );
    expect(r.cambio_clinico_significativo).toBe(false);
  });
  test('Morisky: mejora de adherencia → tendencia "mejora"', () => {
    const r = compararEvaluaciones(
      { tipo:'morisky8', respuestas: JSON.stringify(MORISKY_BAJA) },
      { tipo:'morisky8', respuestas: JSON.stringify(MORISKY_ALTA) }
    );
    expect(r.morisky.tendencia).toBe('mejora');
    expect(r.morisky.clasificacion_actual).toBe('alta');
    expect(r.morisky.clasificacion_anterior).toBe('baja');
  });
  test('Morisky: deterioro de adherencia → tendencia "deterioro"', () => {
    const r = compararEvaluaciones(
      { tipo:'morisky8', respuestas: JSON.stringify(MORISKY_ALTA) },
      { tipo:'morisky8', respuestas: JSON.stringify(MORISKY_MEDIA) }
    );
    expect(r.morisky.tendencia).toBe('deterioro');
  });
});
