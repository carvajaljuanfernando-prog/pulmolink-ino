// src/services/evaluacionService.js
// Morisky-8 y Clasificación Funcional OMS — PulmoLink INO

const PREGUNTAS_MORISKY = [
  { id: 'M1', texto: '¿Alguna vez olvida tomar su(s) medicamento(s) para la hipertensión pulmonar?', tipo: 'sino' },
  { id: 'M2', texto: '¿A veces, si se siente bien, deja de tomar su medicamento?', tipo: 'sino' },
  { id: 'M3', texto: '¿Alguna vez dejó de tomar su medicamento sin decírselo al médico porque le hacía sentir mal?', tipo: 'sino' },
  { id: 'M4', texto: 'Cuando viaja o sale de casa, ¿a veces olvida llevar su medicamento?', tipo: 'sino' },
  { id: 'M5', texto: '¿Tomó ayer todos sus medicamentos para la hipertensión pulmonar?', tipo: 'sino_inv' },
  { id: 'M6', texto: 'Cuando siente que sus síntomas están controlados, ¿a veces deja de tomar su medicamento?', tipo: 'sino' },
  { id: 'M7', texto: 'Tomar medicamentos todos los días es algo que incomoda a mucha gente. ¿Siente usted que es un problema cumplir con su plan de tratamiento?', tipo: 'sino' },
  {
    id: 'M8', texto: '¿Con qué frecuencia tiene dificultades para recordar tomar todos sus medicamentos?', tipo: 'frecuencia',
    opciones: [
      { valor: 0,    etiqueta: 'Nunca / Casi nunca' },
      { valor: 0.25, etiqueta: 'Alguna vez' },
      { valor: 0.5,  etiqueta: 'A veces' },
      { valor: 0.75, etiqueta: 'Usualmente' },
      { valor: 1,    etiqueta: 'Siempre / Casi siempre' },
    ],
  },
];

// ============================================================
// calcularMorisky(respuestas) → { puntaje, clasificacion, ... }
// Puntaje 0-8: mayor = mejor adherencia
// ============================================================
function calcularMorisky(respuestas) {
  const ids = PREGUNTAS_MORISKY.map(p => p.id);
  const faltantes = ids.filter(id => respuestas[id] === undefined);
  if (faltantes.length > 0) {
    throw new Error(`Faltan ítems del Morisky-8: ${faltantes.join(', ')}`);
  }

  let puntaje = 0;
  const itemsProblema = [];

  for (const pregunta of PREGUNTAS_MORISKY) {
    const r = respuestas[pregunta.id];
    let puntoItem = 0;

    if (pregunta.tipo === 'sino') {
      puntoItem = r === false ? 1 : 0;
      if (r === true) itemsProblema.push(pregunta.id);
    } else if (pregunta.tipo === 'sino_inv') {
      puntoItem = r === true ? 1 : 0;
      if (r === false) itemsProblema.push(pregunta.id);
    } else if (pregunta.tipo === 'frecuencia') {
      puntoItem = 1 - r;
      if (r > 0) itemsProblema.push(pregunta.id);
    }

    puntaje += puntoItem;
  }

  puntaje = Math.round(puntaje * 100) / 100;

  let clasificacion, descripcion, recomendacion;
  if (puntaje === 8) {
    clasificacion = 'alta';
    descripcion   = 'Alta adherencia';
    recomendacion = 'Continuar con refuerzo positivo. Evaluar en 3 meses.';
  } else if (puntaje >= 6) {
    clasificacion = 'media';
    descripcion   = 'Adherencia media';
    recomendacion = 'Identificar barreras. Ajustar recordatorios en PulmoLink. Re-evaluar en 1 mes.';
  } else {
    clasificacion = 'baja';
    descripcion   = 'Baja adherencia';
    recomendacion = 'Intervención prioritaria: consulta de enfermería/gestora HP, revisión de barreras. Generar alerta al equipo INO.';
  }

  return {
    puntaje,
    clasificacion,
    descripcion,
    recomendacion,
    items_problema: itemsProblema,
    genera_alerta:  clasificacion === 'baja',
  };
}

// ============================================================
// CLASIFICACIÓN FUNCIONAL OMS (orientación guiada)
// ESC/ERS Guidelines 2022
// Nota: la asignación definitiva es del médico tratante INO
// ============================================================
const PREGUNTAS_CLASE_OMS = [
  { id: 'O1', texto: '¿Tiene síntomas (disnea, fatiga, mareo) en reposo, sin hacer ningún esfuerzo?', tipo: 'sino' },
  { id: 'O2', texto: '¿Sus síntomas aparecen con actividades mínimas como vestirse o asearse?', tipo: 'sino' },
  { id: 'O3', texto: '¿Sus síntomas aparecen al caminar en llano a paso normal por más de 5 minutos?', tipo: 'sino' },
  { id: 'O4', texto: '¿Puede realizar sus actividades habituales sin tener síntomas?', tipo: 'sino' },
  { id: 'O5', texto: '¿Puede subir un piso de escaleras sin detenerse a causa de síntomas?', tipo: 'sino' },
  { id: 'O6', texto: '¿Ha tenido desmayo o pérdida del conocimiento durante el ejercicio?', tipo: 'sino' },
  { id: 'O7', texto: '¿Puede caminar al mismo ritmo que personas de su edad en terreno plano?', tipo: 'sino' },
  { id: 'O8', texto: '¿Ha tenido que reducir significativamente sus actividades físicas en el último mes?', tipo: 'sino' },
];

function clasificarOMS(respuestas) {
  const { O1, O2, O3, O4, O5, O6, O7, O8 } = respuestas;
  let clase, descripcion, limitacion, urgencia;

  if (O1 === true || O2 === true || O6 === true) {
    clase = 4;
    descripcion = 'Síntomas en reposo o con actividad mínima';
    limitacion  = 'Incapacidad para realizar actividad física sin síntomas.';
    urgencia    = 'alta';
  } else if (O3 === true || O8 === true || (O4 === false && O5 === false)) {
    clase = 3;
    descripcion = 'Limitación marcada de la actividad física';
    limitacion  = 'Confortable en reposo, pero la actividad habitual ocasiona síntomas.';
    urgencia    = 'media';
  } else if ((O4 === true && O7 === false) || O5 === false) {
    clase = 2;
    descripcion = 'Ligera limitación de la actividad física';
    limitacion  = 'La actividad ordinaria ocasiona algo de fatiga o disnea.';
    urgencia    = 'baja';
  } else if (O4 === true && O5 === true && O7 === true) {
    clase = 1;
    descripcion = 'Sin limitación de la actividad física';
    limitacion  = 'La actividad ordinaria no ocasiona síntomas excesivos.';
    urgencia    = 'ninguna';
  } else {
    clase = null;
    descripcion = 'Clase no determinada — evaluación médica requerida';
    limitacion  = 'Las respuestas requieren evaluación directa por el médico INO.';
    urgencia    = 'media';
  }

  return {
    clase_orientativa: clase,
    descripcion,
    limitacion,
    urgencia_revision: urgencia,
    advertencia: 'IMPORTANTE: Esta orientación es solo referencial. La clasificación definitiva la asigna el médico tratante del Programa HP del INO.',
  };
}

// ============================================================
// compararEvaluaciones — detecta tendencia longitudinal
// ============================================================
function compararEvaluaciones(anterior, actual) {
  const resultado = {};

  if (anterior.tipo === 'sf12' && actual.tipo === 'sf12') {
    const deltaPCS = actual.puntaje_pcs - anterior.puntaje_pcs;
    const deltaMCS = actual.puntaje_mcs - anterior.puntaje_mcs;
    resultado.pcs = {
      anterior: anterior.puntaje_pcs, actual: actual.puntaje_pcs,
      delta: Math.round(deltaPCS * 100) / 100,
      tendencia: deltaPCS > 2 ? 'mejora' : deltaPCS < -2 ? 'deterioro' : 'estable',
    };
    resultado.mcs = {
      anterior: anterior.puntaje_mcs, actual: actual.puntaje_mcs,
      delta: Math.round(deltaMCS * 100) / 100,
      tendencia: deltaMCS > 2 ? 'mejora' : deltaMCS < -2 ? 'deterioro' : 'estable',
    };
    // MCID (mínima diferencia clínicamente importante) para SF-12: 3 puntos
    resultado.cambio_clinico_significativo =
      Math.abs(deltaPCS) >= 3 || Math.abs(deltaMCS) >= 3;
  }

  if (anterior.tipo === 'morisky8' && actual.tipo === 'morisky8') {
    const rA = typeof anterior.respuestas === 'string'
      ? JSON.parse(anterior.respuestas) : anterior.respuestas;
    const rB = typeof actual.respuestas === 'string'
      ? JSON.parse(actual.respuestas) : actual.respuestas;
    const calcA = calcularMorisky(rA);
    const calcB = calcularMorisky(rB);
    resultado.morisky = {
      anterior: calcA.puntaje, actual: calcB.puntaje,
      delta: Math.round((calcB.puntaje - calcA.puntaje) * 100) / 100,
      clasificacion_anterior: calcA.clasificacion,
      clasificacion_actual:   calcB.clasificacion,
      tendencia: calcB.puntaje > calcA.puntaje ? 'mejora' :
                 calcB.puntaje < calcA.puntaje ? 'deterioro' : 'estable',
    };
  }

  return resultado;
}

module.exports = {
  calcularMorisky,
  clasificarOMS,
  compararEvaluaciones,
  PREGUNTAS_MORISKY,
  PREGUNTAS_CLASE_OMS,
};
