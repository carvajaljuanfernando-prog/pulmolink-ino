// src/services/alertEngine.js
// Motor de reglas clínicas — PulmoLink INO
// Evalúa cada reporte de síntomas y determina nivel de alerta
// Basado en criterios clínicos del Programa HP del INO

const { query, transaction } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ============================================================
// REGLAS CLÍNICAS
// Cada regla tiene: condición, nivel, motivo
// Orden importa: las reglas críticas evalúan primero
// ============================================================
const REGLAS = [
  // ── NIVEL CRÍTICO ────────────────────────────────────────
  {
    nivel: 'critica',
    evaluar: (r) => r.sincope === true,
    motivo: 'Síncope reportado — riesgo inmediato de colapso hemodinámico',
  },
  {
    nivel: 'critica',
    evaluar: (r) => r.hemoptisis === true,
    motivo: 'Hemoptisis reportada — posible complicación vascular pulmonar grave',
  },
  {
    nivel: 'critica',
    evaluar: (r) => r.spo2 !== null && r.spo2 <= 85,
    motivo: `SpO2 críticamente baja (${0}%) — hipoxemia severa`,
    motivoDinamico: (r) => `SpO2 críticamente baja (${r.spo2}%) — hipoxemia severa`,
  },
  {
    nivel: 'critica',
    evaluar: (r) => r.disnea_escala !== null && r.disnea_escala >= 9,
    motivo: 'Disnea severa (escala ≥9) — posible descompensación aguda',
    motivoDinamico: (r) => `Disnea severa (escala ${r.disnea_escala}/10) — posible descompensación aguda`,
  },
  {
    nivel: 'critica',
    evaluar: (r) => r.dolor_toracico === true && r.disnea_escala >= 7,
    motivo: 'Dolor torácico con disnea severa — descartar crisis cardiopulmonar',
  },

  // ── NIVEL ALTO ───────────────────────────────────────────
  {
    nivel: 'alta',
    evaluar: (r) => r.disnea_escala !== null && r.disnea_escala >= 7 && r.disnea_escala <= 8,
    motivoDinamico: (r) => `Disnea moderada-severa (escala ${r.disnea_escala}/10) — requiere evaluación en <2h`,
  },
  {
    nivel: 'alta',
    evaluar: (r) => r.edema === 'severo',
    motivo: 'Edema severo en extremidades — posible descompensación derecha',
  },
  {
    nivel: 'alta',
    evaluar: (r) => r.edema === 'moderado' && r.disnea_escala >= 6,
    motivo: 'Edema moderado con disnea — patrón de sobrecarga de volumen',
  },
  {
    nivel: 'alta',
    evaluar: (r) => r.spo2 !== null && r.spo2 >= 86 && r.spo2 <= 90,
    motivoDinamico: (r) => `SpO2 baja (${r.spo2}%) — hipoxemia moderada`,
  },
  {
    nivel: 'alta',
    evaluar: (r) => r.efecto_adverso === true && r.disnea_escala >= 5,
    motivo: 'Efecto adverso medicamentoso con síntomas respiratorios — revisar tratamiento',
  },

  // ── NIVEL MEDIO ──────────────────────────────────────────
  {
    nivel: 'media',
    evaluar: (r) => r.disnea_escala !== null && r.disnea_escala >= 5 && r.disnea_escala <= 6,
    motivoDinamico: (r) => `Disnea moderada (escala ${r.disnea_escala}/10) — monitorear evolución`,
  },
  {
    nivel: 'media',
    evaluar: (r) => r.edema === 'moderado',
    motivo: 'Edema moderado en extremidades — evaluar en próxima consulta',
  },
  {
    nivel: 'media',
    evaluar: (r) => r.efecto_adverso === true,
    motivo: 'Efecto adverso medicamentoso reportado — revisión por enfermería',
  },
  {
    nivel: 'media',
    evaluar: (r) => r.dolor_toracico === true,
    motivo: 'Dolor torácico sin otros criterios severos — evaluar en contexto clínico',
  },
];

// ============================================================
// evaluar(reporte) → { nivel, motivo } | null
// Devuelve la alerta de mayor nivel que aplique, o null si no hay
// ============================================================
function evaluarReporte(reporte) {
  for (const regla of REGLAS) {
    if (regla.evaluar(reporte)) {
      const motivo = regla.motivoDinamico
        ? regla.motivoDinamico(reporte)
        : regla.motivo;
      return { nivel: regla.nivel, motivo };
    }
  }
  return null;
}

// ============================================================
// seleccionarProfesional(pacienteId, nivel)
// Determina a qué profesional INO notificar según nivel y asignación
// ============================================================
async function seleccionarProfesional(pacienteId, nivel) {
  // Para alertas críticas y altas: el profesional asignado al paciente
  // Para alertas medias: enfermería/gestora del programa
  const { rows } = await query(
    `SELECT p.profesional_id, pr.rol
     FROM pacientes p
     JOIN profesionales pr ON pr.id = p.profesional_id
     WHERE p.id = $1 AND pr.activo = true`,
    [pacienteId]
  );

  if (rows.length > 0) {
    return rows[0].profesional_id;
  }

  // Fallback: primer profesional activo de neumología o enfermería
  const { rows: fallback } = await query(
    `SELECT id FROM profesionales
     WHERE activo = true
       AND rol IN ('neumólogo','cardiólogo','enfermería')
     ORDER BY
       CASE rol
         WHEN 'neumólogo'  THEN 1
         WHEN 'cardiólogo' THEN 2
         WHEN 'enfermería' THEN 3
       END
     LIMIT 1`
  );

  return fallback[0]?.id || null;
}

// ============================================================
// procesarReporte(pacienteId, reporte) → alerta | null
// Función principal: evalúa y persiste la alerta si corresponde
// ============================================================
async function procesarReporte(pacienteId, reporteId, datosReporte) {
  const resultado = evaluarReporte(datosReporte);

  // Sin alerta: el reporte es normal
  if (!resultado) {
    return null;
  }

  const { nivel, motivo } = resultado;
  const profesionalId = await seleccionarProfesional(pacienteId, nivel);

  // Crear la alerta en una transacción atómica
  const alerta = await transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO alertas
        (id, paciente_id, reporte_id, nivel, motivo, profesional_notif_id,
         estado, notificado_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', NOW())
       RETURNING *`,
      [uuidv4(), pacienteId, reporteId, nivel, motivo, profesionalId]
    );

    // Registrar en auditoría
    await client.query(
      `INSERT INTO auditoria (usuario_tipo, usuario_id, accion, tabla, registro_id, detalle)
       VALUES ('sistema', $1, 'CREATE_ALERTA', 'alertas', $2, $3)`,
      [pacienteId, rows[0].id, JSON.stringify({ nivel, motivo })]
    );

    return rows[0];
  });

  return alerta;
}

// ============================================================
// verificarSilencio(pacienteId) → alerta de nivel medio si el
// paciente no ha reportado síntomas en más de 48 horas
// ============================================================
async function verificarSilencioReporte(pacienteId) {
  const { rows } = await query(
    `SELECT created_at FROM reportes_sintomas
     WHERE paciente_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [pacienteId]
  );

  const ultimoReporte = rows[0]?.created_at;
  const horasSinReporte = ultimoReporte
    ? (Date.now() - new Date(ultimoReporte).getTime()) / (1000 * 60 * 60)
    : Infinity;

  if (horasSinReporte >= 48) {
    const profesionalId = await seleccionarProfesional(pacienteId, 'media');
    const { rows: alerta } = await query(
      `INSERT INTO alertas
        (id, paciente_id, nivel, motivo, profesional_notif_id, estado, notificado_at)
       VALUES ($1, $2, 'media', $3, $4, 'pendiente', NOW())
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        uuidv4(),
        pacienteId,
        `Sin reporte de síntomas hace ${Math.round(horasSinReporte)} horas`,
        profesionalId,
      ]
    );
    return alerta[0] || null;
  }

  return null;
}

module.exports = { evaluarReporte, procesarReporte, verificarSilencioReporte };
