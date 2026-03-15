// src/services/sf12Service.js
// Cálculo del SF-12 v2 — PulmoLink INO
// Algoritmo basado en: Ware JE et al. (2002) SF-12v2 Health Survey
// Normas poblacionales colombianas (media=50, SD=10)
//
// El SF-12 genera dos puntuaciones sumarias:
//   PCS: Physical Component Summary (componente físico)
//   MCS: Mental Component Summary (componente mental)
// Ambas normalizadas a media=50, SD=10 (población general)
// Puntuaciones más altas = mejor calidad de vida

// ============================================================
// PREGUNTAS DEL SF-12 (versión estándar validada en español)
// ============================================================
const PREGUNTAS_SF12 = [
  {
    id: 'GH1',
    texto: '¿En general, diría que su salud es:',
    opciones: [
      { valor: 1, etiqueta: 'Excelente' },
      { valor: 2, etiqueta: 'Muy buena' },
      { valor: 3, etiqueta: 'Buena' },
      { valor: 4, etiqueta: 'Regular' },
      { valor: 5, etiqueta: 'Mala' },
    ],
  },
  {
    id: 'PF02',
    texto: '¿Su salud actual le limita para hacer esfuerzos moderados, como mover una mesa, pasar la aspiradora, jugar a los bolos o caminar más de una hora?',
    opciones: [
      { valor: 1, etiqueta: 'Sí, me limita mucho' },
      { valor: 2, etiqueta: 'Sí, me limita un poco' },
      { valor: 3, etiqueta: 'No, no me limita nada' },
    ],
  },
  {
    id: 'PF04',
    texto: '¿Su salud actual le limita para subir varios pisos por la escalera?',
    opciones: [
      { valor: 1, etiqueta: 'Sí, me limita mucho' },
      { valor: 2, etiqueta: 'Sí, me limita un poco' },
      { valor: 3, etiqueta: 'No, no me limita nada' },
    ],
  },
  {
    id: 'RP2',
    texto: '¿Durante las 4 últimas semanas, ¿hizo menos de lo que hubiera querido hacer a causa de su salud física?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
  {
    id: 'RP3',
    texto: '¿Durante las 4 últimas semanas, tuvo que dejar de hacer algunas tareas en su trabajo o en sus actividades cotidianas a causa de su salud física?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
  {
    id: 'RE2',
    texto: '¿Durante las 4 últimas semanas, hizo menos de lo que hubiera querido hacer a causa de algún problema emocional (como sentirse deprimido o ansioso)?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
  {
    id: 'RE3',
    texto: '¿Durante las 4 últimas semanas, no hizo su trabajo o sus actividades cotidianas tan cuidadosamente como de costumbre a causa de algún problema emocional?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
  {
    id: 'BP2',
    texto: '¿Durante las 4 últimas semanas, ¿cuánto le ha dificultado el dolor su trabajo habitual (incluyendo tanto el trabajo fuera de casa como las tareas domésticas)?',
    opciones: [
      { valor: 1, etiqueta: 'Nada' },
      { valor: 2, etiqueta: 'Un poco' },
      { valor: 3, etiqueta: 'Regular' },
      { valor: 4, etiqueta: 'Bastante' },
      { valor: 5, etiqueta: 'Mucho' },
    ],
  },
  {
    id: 'MH3',
    texto: '¿Durante las 4 últimas semanas, se sintió calmado y tranquilo?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
  {
    id: 'VT2',
    texto: '¿Durante las 4 últimas semanas, tuvo mucha energía?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
  {
    id: 'MH4',
    texto: '¿Durante las 4 últimas semanas, se sintió desanimado y deprimido?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
  {
    id: 'SF2',
    texto: '¿Durante las 4 últimas semanas, ¿con qué frecuencia la salud física o los problemas emocionales le han dificultado sus actividades sociales (como visitar a los amigos o familiares)?',
    opciones: [
      { valor: 1, etiqueta: 'Siempre' },
      { valor: 2, etiqueta: 'Casi siempre' },
      { valor: 3, etiqueta: 'Algunas veces' },
      { valor: 4, etiqueta: 'Solo alguna vez' },
      { valor: 5, etiqueta: 'Nunca' },
    ],
  },
];

// ============================================================
// PONDERACIONES PARA PCS y MCS (coeficientes de regresión)
// Fuente: Ware et al. (2002), adaptación latinoamericana
// ============================================================
const COEFICIENTES = {
  // Transformaciones lineales de cada ítem (0-100 scale)
  // Luego se aplican cargas factoriales para PCS y MCS
  PCS: {
    GH1:  -0.42251,
    PF02:  0.35057,
    PF04:  0.30930,
    RP2:   0.19847,
    RP3:   0.15386,
    RE2:  -0.01571,
    RE3:  -0.02950,
    BP2:  -0.22069,
    MH3:  -0.01290,
    VT2:   0.02877,
    MH4:  -0.12329,
    SF2:  -0.00753,
  },
  MCS: {
    GH1:  -0.20227,
    PF02: -0.06064,
    PF04: -0.03970,
    RP2:  -0.09765,
    RP3:  -0.08014,
    RE2:   0.43407,
    RE3:   0.44767,
    BP2:  -0.12690,
    MH3:   0.23534,
    VT2:   0.17405,
    MH4:   0.26872,
    SF2:   0.12359,
  },
};

// Constantes de ajuste (intersección del modelo)
const CONSTANTE_PCS = 56.57706;
const CONSTANTE_MCS = 60.75781;

// ============================================================
// Transformar respuesta cruda → valor 0-100 para cada ítem
// ============================================================
function transformarItem(id, valorRespuesta) {
  // Items con escala 1-5 donde 1=peor → invertir para que mayor=mejor
  const itemsInvertidos = ['GH1', 'BP2', 'MH4'];
  // Items con escala 1-5 donde 5=mejor → ya van en dirección correcta
  const itemsDirectos = ['RP2', 'RP3', 'RE2', 'RE3', 'MH3', 'VT2', 'SF2'];
  // Items de 3 opciones (PF02, PF04)
  const items3opciones = ['PF02', 'PF04'];

  let valorTransformado;

  if (items3opciones.includes(id)) {
    // 1=0, 2=50, 3=100
    valorTransformado = (valorRespuesta - 1) * 50;
  } else if (itemsInvertidos.includes(id)) {
    // 1=100, 2=75, 3=50, 4=25, 5=0
    valorTransformado = (5 - valorRespuesta) * 25;
  } else {
    // 1=0, 2=25, 3=50, 4=75, 5=100
    valorTransformado = (valorRespuesta - 1) * 25;
  }

  return valorTransformado;
}

// ============================================================
// calcularSF12(respuestas) → { pcs, mcs, interpretacion }
// respuestas: { GH1: 3, PF02: 2, PF04: 1, ... }
// ============================================================
// Medias poblacionales de referencia para centrar ítems (escala 0-100)
const MEDIAS_REF = {
  GH1:72.21, PF02:81.18, PF04:80.96, RP2:81.19, RP3:80.79,
  RE2:86.41, RE3:86.41, BP2:74.74, MH3:74.74, VT2:61.05, MH4:74.74, SF2:83.28,
};

function calcularSF12(respuestas) {
  const idsRequeridos = Object.keys(COEFICIENTES.PCS);
  const faltantes = idsRequeridos.filter(id => respuestas[id] === undefined);
  if (faltantes.length > 0) {
    throw new Error(`Faltan ítems del SF-12: ${faltantes.join(', ')}`);
  }

  // 1) Transformar a escala 0-100
  const transformados = {};
  for (const id of idsRequeridos) {
    transformados[id] = transformarItem(id, respuestas[id]);
  }

  // 2) Centrar restando media poblacional (necesario para el modelo de regresión)
  const centrados = {};
  for (const id of idsRequeridos) {
    centrados[id] = transformados[id] - MEDIAS_REF[id];
  }

  // 3) Aplicar coeficientes de regresión sobre ítems centrados
  let pcs = CONSTANTE_PCS;
  let mcs = CONSTANTE_MCS;
  for (const id of idsRequeridos) {
    pcs += centrados[id] * COEFICIENTES.PCS[id];
    mcs += centrados[id] * COEFICIENTES.MCS[id];
  }

  pcs = Math.round(pcs * 100) / 100;
  mcs = Math.round(mcs * 100) / 100;

  return {
    pcs,
    mcs,
    interpretacion: {
      pcs: interpretarPuntaje(pcs),
      mcs: interpretarPuntaje(mcs),
      global: interpretarGlobal(pcs, mcs),
    },
    items_transformados: transformados,
  };
}

function interpretarPuntaje(puntaje) {
  if (puntaje >= 55) return { nivel: 'bueno',    texto: 'Por encima del promedio poblacional' };
  if (puntaje >= 45) return { nivel: 'promedio',  texto: 'En el rango promedio poblacional' };
  if (puntaje >= 35) return { nivel: 'bajo',       texto: 'Por debajo del promedio — monitoreo recomendado' };
  return                    { nivel: 'muy_bajo',   texto: 'Significativamente reducida — intervención indicada' };
}

function interpretarGlobal(pcs, mcs) {
  const promedio = (pcs + mcs) / 2;
  if (pcs < 35 && mcs < 35) return 'Calidad de vida físico-mental severamente comprometida';
  if (pcs < 35)              return 'Componente físico severamente comprometido';
  if (mcs < 35)              return 'Componente mental severamente comprometido';
  if (promedio >= 50)        return 'Calidad de vida general preservada';
  return 'Calidad de vida moderadamente reducida';
}

module.exports = {
  calcularSF12,
  PREGUNTAS_SF12,
  transformarItem,
  interpretarPuntaje,
};
