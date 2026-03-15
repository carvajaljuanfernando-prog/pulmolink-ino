-- ============================================================
-- PulmoLink INO v2.0 - Schema completo con 100 variables HP
-- Instituto Neumológico del Oriente
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- PROFESIONALES
CREATE TABLE IF NOT EXISTS profesionales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(120) NOT NULL,
    apellido VARCHAR(120) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    especialidad VARCHAR(100) NOT NULL,
    rol VARCHAR(50) NOT NULL CHECK (rol IN ('neumólogo','cardiólogo','enfermería','nutrición','psicología','fisioterapia','terapia_resp','medicina_gral','administrativo')),
    sede_ino VARCHAR(50) DEFAULT 'principal' CHECK (sede_ino IN ('principal','machado','cabecera')),
    mfa_secret TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CUIDADORES
CREATE TABLE IF NOT EXISTS cuidadores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(120) NOT NULL,
    apellido VARCHAR(120) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    telefono VARCHAR(20),
    relacion VARCHAR(60),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PACIENTES (cols 1-26 del formulario HP)
CREATE TABLE IF NOT EXISTS pacientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Identificacion cols 1-6
    consecutivo SERIAL,
    documento_tipo VARCHAR(20),
    documento_numero VARCHAR(40) UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    segundo_nombre VARCHAR(120),
    apellido VARCHAR(120) NOT NULL,
    segundo_apellido VARCHAR(120),
    -- Sociodemograficas cols 7-13
    ciudad_residencia VARCHAR(100),
    estado_civil VARCHAR(30) CHECK (estado_civil IN ('soltero','casado','union_libre','separado','viudo','otro') OR estado_civil IS NULL),
    ocupacion VARCHAR(100),
    estrato_socioeconomico SMALLINT CHECK (estrato_socioeconomico BETWEEN 1 AND 6),
    sexo VARCHAR(10) CHECK (sexo IN ('masculino','femenino','otro') OR sexo IS NULL),
    fecha_nacimiento DATE,
    edad SMALLINT,
    eps VARCHAR(120),
    -- Comorbilidades cols 14-26
    comorbilidades_desc TEXT,
    hta BOOLEAN DEFAULT false,
    diabetes_mellitus BOOLEAN DEFAULT false,
    cancer BOOLEAN DEFAULT false,
    enfermedad_renal BOOLEAN DEFAULT false,
    epoc BOOLEAN DEFAULT false,
    asma BOOLEAN DEFAULT false,
    etv BOOLEAN DEFAULT false,
    enfermedad_coronaria BOOLEAN DEFAULT false,
    arritmia BOOLEAN DEFAULT false,
    insuficiencia_cardiaca BOOLEAN DEFAULT false,
    exposicion_biomasa BOOLEAN DEFAULT false,
    tabaquismo BOOLEAN DEFAULT false,
    -- Diagnostico HP
    grupo_hp_oms SMALLINT CHECK (grupo_hp_oms BETWEEN 1 AND 5),
    clase_funcional_oms SMALLINT CHECK (clase_funcional_oms BETWEEN 1 AND 4),
    riesgo_hp VARCHAR(20) CHECK (riesgo_hp IN ('bajo','intermedio','alto') OR riesgo_hp IS NULL),
    -- Relaciones y control
    cuidador_id UUID REFERENCES cuidadores(id),
    profesional_id UUID REFERENCES profesionales(id),
    canal_preferido VARCHAR(20) DEFAULT 'app' CHECK (canal_preferido IN ('app','sms','whatsapp','email')),
    grupo_etario VARCHAR(20) CHECK (grupo_etario IN ('pediatrico','adolescente','adulto','adulto_mayor')),
    email VARCHAR(200) UNIQUE,
    password_hash TEXT,
    activo BOOLEAN DEFAULT true,
    fecha_ingreso_prog DATE,
    consentimiento_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- EXAMENES DIAGNOSTICOS (cols 27-64 del formulario HP)
CREATE TABLE IF NOT EXISTS examenes_diagnosticos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('ecocardiograma','cateterismo_derecho','clasificacion_hp')),
    fecha_examen DATE,
    ingresado_por UUID REFERENCES profesionales(id),
    -- Ecocardiograma cols 27-45
    clasif_fevi VARCHAR(30),
    fevi_pct NUMERIC(5,2),
    diam_vi_sistole NUMERIC(5,2),
    diam_vi_diastole NUMERIC(5,2),
    vol_auricula_izq NUMERIC(7,2),
    valvulopatia_aortica VARCHAR(40),
    valvulopatia_mitral VARCHAR(40),
    diam_vd_basal NUMERIC(5,2),
    diam_vd_medio NUMERIC(5,2),
    diam_vd_long NUMERIC(5,2),
    tapse NUMERIC(5,2),
    area_auricula_der NUMERIC(7,2),
    insuf_tricuspide VARCHAR(30),
    vel_regurg_tricusp NUMERIC(5,2),
    psap_eco NUMERIC(6,2),
    derrame_pericardico BOOLEAN DEFAULT false,
    defecto_interauricular BOOLEAN DEFAULT false,
    defecto_interventricular BOOLEAN DEFAULT false,
    otros_defectos_congen TEXT,
    -- Cateterismo cols 46-62
    presion_auricula_der NUMERIC(6,2),
    psap_cateterismo NUMERIC(6,2),
    pdap NUMERIC(6,2),
    pmap NUMERIC(6,2),
    pcap NUMERIC(6,2),
    pfdvd NUMERIC(6,2),
    sat_vena_cava_sup NUMERIC(5,2),
    sat_vena_cava_inf NUMERIC(5,2),
    sat_arteria_pulmonar NUMERIC(5,2),
    sat_auricula_izq NUMERIC(5,2),
    sat_aorta NUMERIC(5,2),
    sat_venosa_mixta NUMERIC(5,2),
    gasto_cardiaco NUMERIC(6,3),
    rvp NUMERIC(8,2),
    pa_sistolica_sist NUMERIC(6,2),
    pa_diastolica_sist NUMERIC(6,2),
    pa_media_sist NUMERIC(6,2),
    -- Clasificacion HP cols 63-64
    grupo_hp SMALLINT CHECK (grupo_hp BETWEEN 1 AND 5),
    clasificacion_riesgo VARCHAR(20) CHECK (clasificacion_riesgo IN ('bajo','intermedio','alto') OR clasificacion_riesgo IS NULL),
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVALUACIONES (cols 65-72 inicial + 81-96 final)
CREATE TABLE IF NOT EXISTS evaluaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('sf12','morisky8','clase_oms')),
    momento VARCHAR(10) DEFAULT 'seguimiento' CHECK (momento IN ('inicial','seguimiento','final')),
    respuestas JSONB NOT NULL,
    -- SF-12 cols 65-70 / 81-90
    pct_salud_fisica NUMERIC(5,2),
    puntaje_pcs NUMERIC(5,2),
    pct_salud_mental NUMERIC(5,2),
    puntaje_mcs NUMERIC(5,2),
    pct_salud_total NUMERIC(5,2),
    puntaje_total NUMERIC(5,2),
    -- Clase funcional cols 71-72 / 93-94
    clase_funcional SMALLINT CHECK (clase_funcional BETWEEN 1 AND 4),
    -- Morisky
    puntaje_morisky SMALLINT CHECK (puntaje_morisky BETWEEN 0 AND 8),
    clasificacion VARCHAR(40),
    -- Cambios calculados automaticamente cols 83-96
    cambio_pcs NUMERIC(5,2),
    cambio_cualit_pcs VARCHAR(20),
    cambio_mcs NUMERIC(5,2),
    cambio_cualit_mcs VARCHAR(20),
    cambio_cv_total NUMERIC(5,2),
    cambio_cualit_total VARCHAR(20),
    cambio_clase_funcional SMALLINT,
    cambio_cualit_cf VARCHAR(20),
    aplicada_at TIMESTAMPTZ DEFAULT NOW(),
    aplicada_por VARCHAR(20) DEFAULT 'paciente' CHECK (aplicada_por IN ('paciente','cuidador','profesional')),
    observaciones TEXT
);

-- MEDICAMENTOS (cols 73-80 del formulario HP)
CREATE TABLE IF NOT EXISTS medicamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    es_ipde5 BOOLEAN DEFAULT false,
    es_era BOOLEAN DEFAULT false,
    es_riociguat BOOLEAN DEFAULT false,
    es_prostaciclina BOOLEAN DEFAULT false,
    es_anticoagulante BOOLEAN DEFAULT false,
    es_broncodilatador BOOLEAN DEFAULT false,
    es_diuretico BOOLEAN DEFAULT false,
    es_oxigeno BOOLEAN DEFAULT false,
    clase VARCHAR(100),
    dosis VARCHAR(80),
    frecuencia VARCHAR(80),
    via VARCHAR(40),
    activo BOOLEAN DEFAULT true,
    fecha_inicio DATE,
    fecha_fin DATE,
    prescrito_por UUID REFERENCES profesionales(id),
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SESIONES DE REHABILITACION (cols 97-100 del formulario HP)
CREATE TABLE IF NOT EXISTS sesiones_rehabilitacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    profesional_id UUID REFERENCES profesionales(id),
    modalidad VARCHAR(20) NOT NULL CHECK (modalidad IN ('presencial','virtual','domiciliaria')),
    numero_sesion SMALLINT,
    total_sesiones SMALLINT,
    porcentaje_trpe NUMERIC(5,2),
    completitud NUMERIC(5,2),
    fecha DATE NOT NULL,
    duracion_min SMALLINT,
    borg_score SMALLINT CHECK (borg_score BETWEEN 0 AND 10),
    asistio BOOLEAN DEFAULT true,
    incidencias TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REPORTES DE SINTOMAS
CREATE TABLE IF NOT EXISTS reportes_sintomas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    disnea_escala SMALLINT CHECK (disnea_escala BETWEEN 0 AND 10),
    edema VARCHAR(20) CHECK (edema IN ('ninguno','leve','moderado','severo')),
    sincope BOOLEAN DEFAULT false,
    hemoptisis BOOLEAN DEFAULT false,
    dolor_toracico BOOLEAN DEFAULT false,
    spo2 SMALLINT CHECK (spo2 BETWEEN 50 AND 100),
    efecto_adverso BOOLEAN DEFAULT false,
    efecto_adverso_desc TEXT,
    notas TEXT,
    foto_url TEXT,
    reportado_por VARCHAR(20) DEFAULT 'paciente' CHECK (reportado_por IN ('paciente','cuidador','profesional')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ALERTAS
CREATE TABLE IF NOT EXISTS alertas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    reporte_id UUID REFERENCES reportes_sintomas(id),
    nivel VARCHAR(10) NOT NULL CHECK (nivel IN ('critica','alta','media')),
    motivo VARCHAR(300) NOT NULL,
    profesional_notif_id UUID REFERENCES profesionales(id),
    estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente','vista','en_proceso','resuelta','escalada')),
    notificado_at TIMESTAMPTZ,
    vista_at TIMESTAMPTZ,
    respondida_at TIMESTAMPTZ,
    resuelta_at TIMESTAMPTZ,
    resolucion TEXT,
    escalada_at TIMESTAMPTZ,
    escalada_a UUID REFERENCES profesionales(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RECORDATORIOS
CREATE TABLE IF NOT EXISTS recordatorios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('medicamento','cita','evaluacion','sintomas','rehab')),
    descripcion VARCHAR(200),
    cron_expr VARCHAR(60),
    fecha_puntual TIMESTAMPTZ,
    canal VARCHAR(20) DEFAULT 'app' CHECK (canal IN ('app','sms','whatsapp','email')),
    activo BOOLEAN DEFAULT true,
    ultima_env_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MENSAJES
CREATE TABLE IF NOT EXISTS mensajes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alerta_id UUID REFERENCES alertas(id),
    de_tipo VARCHAR(20) NOT NULL CHECK (de_tipo IN ('paciente','cuidador','profesional')),
    de_id UUID NOT NULL,
    para_tipo VARCHAR(20) NOT NULL CHECK (para_tipo IN ('paciente','cuidador','profesional')),
    para_id UUID NOT NULL,
    contenido TEXT NOT NULL,
    leido BOOLEAN DEFAULT false,
    leido_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONTENIDO EDUCATIVO
CREATE TABLE IF NOT EXISTS contenido_educativo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modulo VARCHAR(5) NOT NULL,
    unidad VARCHAR(10) NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    grupo_etario VARCHAR(20) NOT NULL CHECK (grupo_etario IN ('pediatrico','adolescente','adulto','adulto_mayor','todos')),
    formato VARCHAR(30),
    url_recurso TEXT,
    obligatorio BOOLEAN DEFAULT false,
    validado BOOLEAN DEFAULT false,
    validado_por UUID REFERENCES profesionales(id),
    validado_at TIMESTAMPTZ,
    version SMALLINT DEFAULT 1,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONSUMO EDUCATIVO
CREATE TABLE IF NOT EXISTS consumo_educativo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    contenido_id UUID NOT NULL REFERENCES contenido_educativo(id),
    completitud NUMERIC(5,2) DEFAULT 0 CHECK (completitud BETWEEN 0 AND 100),
    primer_acceso TIMESTAMPTZ DEFAULT NOW(),
    ultimo_acceso TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(paciente_id, contenido_id)
);

-- AUDITORIA
CREATE TABLE IF NOT EXISTS auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_tipo VARCHAR(20),
    usuario_id UUID,
    accion VARCHAR(100),
    tabla VARCHAR(60),
    registro_id UUID,
    ip_origen INET,
    detalle JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VISTA: reporte completo - une las 100 variables
CREATE OR REPLACE VIEW reporte_hp_paciente AS
SELECT
    p.consecutivo, p.documento_numero AS documento,
    p.nombre, p.segundo_nombre, p.apellido, p.segundo_apellido,
    p.ciudad_residencia, p.estado_civil, p.ocupacion,
    p.estrato_socioeconomico, p.sexo, p.edad, p.eps,
    p.comorbilidades_desc, p.hta, p.diabetes_mellitus, p.cancer,
    p.enfermedad_renal, p.epoc, p.asma, p.etv,
    p.enfermedad_coronaria, p.arritmia, p.insuficiencia_cardiaca,
    p.exposicion_biomasa, p.tabaquismo,
    eco.clasif_fevi, eco.fevi_pct, eco.diam_vi_sistole, eco.diam_vi_diastole,
    eco.vol_auricula_izq, eco.valvulopatia_aortica, eco.valvulopatia_mitral,
    eco.diam_vd_basal, eco.diam_vd_medio, eco.diam_vd_long,
    eco.tapse, eco.area_auricula_der, eco.insuf_tricuspide,
    eco.vel_regurg_tricusp, eco.psap_eco,
    eco.derrame_pericardico, eco.defecto_interauricular,
    eco.defecto_interventricular, eco.otros_defectos_congen,
    cat.presion_auricula_der, cat.psap_cateterismo,
    cat.pdap, cat.pmap, cat.pcap, cat.pfdvd,
    cat.sat_vena_cava_sup, cat.sat_vena_cava_inf,
    cat.sat_arteria_pulmonar, cat.sat_auricula_izq,
    cat.sat_aorta, cat.sat_venosa_mixta,
    cat.gasto_cardiaco, cat.rvp,
    cat.pa_sistolica_sist, cat.pa_diastolica_sist, cat.pa_media_sist,
    COALESCE(cat.grupo_hp, p.grupo_hp_oms) AS grupo,
    COALESCE(cat.clasificacion_riesgo, p.riesgo_hp) AS riesgo,
    ev_i.pct_salud_fisica AS cv_pct_fisico_inicial,
    ev_i.puntaje_pcs AS cvsfi,
    ev_i.pct_salud_mental AS cv_pct_mental_inicial,
    ev_i.puntaje_mcs AS cvsmi,
    ev_i.pct_salud_total AS cv_pct_total_inicial,
    ev_i.puntaje_total AS cvti,
    ev_i.clase_funcional AS cfi,
    m_agg.es_ipde5, m_agg.es_era, m_agg.es_riociguat,
    m_agg.es_prostaciclina, m_agg.es_anticoagulante,
    m_agg.es_broncodilatador, m_agg.es_diuretico, m_agg.es_oxigeno,
    ev_f.pct_salud_fisica AS cv_pct_fisico_final,
    ev_f.puntaje_pcs AS cvsff,
    ev_f.cambio_pcs AS cambcvsf,
    ev_f.cambio_cualit_pcs AS cualicf_pcs,
    ev_f.pct_salud_mental AS cv_pct_mental_final,
    ev_f.puntaje_mcs AS cvsmf,
    ev_f.cambio_mcs AS cambcvsm,
    ev_f.cambio_cualit_mcs AS cualicm,
    ev_f.pct_salud_total AS cv_pct_total_final,
    ev_f.puntaje_total AS cvtf,
    ev_f.cambio_cv_total AS cambcvt,
    ev_f.cambio_cualit_total AS cualict,
    ev_f.clase_funcional AS cff,
    ev_f.cambio_clase_funcional AS cambcf,
    ev_f.cambio_cualit_cf AS cualicf_cf,
    reh.modalidad AS modal,
    reh.total_sesiones AS numses,
    reh.porcentaje_trpe AS porctrp,
    reh.completitud AS compl
FROM pacientes p
LEFT JOIN LATERAL (SELECT * FROM examenes_diagnosticos WHERE paciente_id=p.id AND tipo='ecocardiograma' ORDER BY fecha_examen DESC NULLS LAST, created_at DESC LIMIT 1) eco ON true
LEFT JOIN LATERAL (SELECT * FROM examenes_diagnosticos WHERE paciente_id=p.id AND tipo='cateterismo_derecho' ORDER BY fecha_examen DESC NULLS LAST, created_at DESC LIMIT 1) cat ON true
LEFT JOIN LATERAL (SELECT * FROM evaluaciones WHERE paciente_id=p.id AND tipo='sf12' AND momento='inicial' ORDER BY aplicada_at ASC LIMIT 1) ev_i ON true
LEFT JOIN LATERAL (SELECT * FROM evaluaciones WHERE paciente_id=p.id AND tipo='sf12' AND momento IN ('final','seguimiento') ORDER BY aplicada_at DESC LIMIT 1) ev_f ON true
LEFT JOIN LATERAL (SELECT bool_or(es_ipde5) AS es_ipde5, bool_or(es_era) AS es_era, bool_or(es_riociguat) AS es_riociguat, bool_or(es_prostaciclina) AS es_prostaciclina, bool_or(es_anticoagulante) AS es_anticoagulante, bool_or(es_broncodilatador) AS es_broncodilatador, bool_or(es_diuretico) AS es_diuretico, bool_or(es_oxigeno) AS es_oxigeno FROM medicamentos WHERE paciente_id=p.id AND activo=true) m_agg ON true
LEFT JOIN LATERAL (SELECT * FROM sesiones_rehabilitacion WHERE paciente_id=p.id ORDER BY fecha DESC LIMIT 1) reh ON true
WHERE p.activo=true;

-- INDICES
CREATE INDEX IF NOT EXISTS idx_pacientes_doc ON pacientes(documento_numero);
CREATE INDEX IF NOT EXISTS idx_pacientes_prof ON pacientes(profesional_id);
CREATE INDEX IF NOT EXISTS idx_examenes_pac_tipo ON examenes_diagnosticos(paciente_id, tipo, fecha_examen DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_pac ON alertas(paciente_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_prof ON alertas(profesional_notif_id, estado);
CREATE INDEX IF NOT EXISTS idx_alertas_nivel ON alertas(nivel, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reportes_pac ON reportes_sintomas(paciente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_tipo ON evaluaciones(paciente_id, tipo, momento, aplicada_at DESC);
CREATE INDEX IF NOT EXISTS idx_meds_pac ON medicamentos(paciente_id, activo);
CREATE INDEX IF NOT EXISTS idx_rehab_pac ON sesiones_rehabilitacion(paciente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_consumo_pac ON consumo_educativo(paciente_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_user ON auditoria(usuario_id, created_at DESC);

-- TRIGGERS updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pacientes_upd BEFORE UPDATE ON pacientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profesionales_upd BEFORE UPDATE ON profesionales FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- TRIGGER: calcular cambios evaluacion automaticamente (cols 83-96)
CREATE OR REPLACE FUNCTION calcular_cambios_evaluacion()
RETURNS TRIGGER AS $$
DECLARE ev_ini RECORD; d_pcs NUMERIC; d_mcs NUMERIC; d_tot NUMERIC; d_cf SMALLINT;
BEGIN
    IF NEW.tipo = 'sf12' AND NEW.momento IN ('final','seguimiento') THEN
        SELECT * INTO ev_ini FROM evaluaciones
        WHERE paciente_id=NEW.paciente_id AND tipo='sf12' AND momento='inicial'
        ORDER BY aplicada_at ASC LIMIT 1;
        IF FOUND THEN
            d_pcs := ROUND(NEW.puntaje_pcs - ev_ini.puntaje_pcs, 2);
            d_mcs := ROUND(NEW.puntaje_mcs - ev_ini.puntaje_mcs, 2);
            d_tot := ROUND(NEW.puntaje_total - ev_ini.puntaje_total, 2);
            d_cf  := NEW.clase_funcional - ev_ini.clase_funcional;
            NEW.cambio_pcs        := d_pcs;
            NEW.cambio_cualit_pcs := CASE WHEN d_pcs>3 THEN 'mejora' WHEN d_pcs<-3 THEN 'deterioro' ELSE 'estable' END;
            NEW.cambio_mcs        := d_mcs;
            NEW.cambio_cualit_mcs := CASE WHEN d_mcs>3 THEN 'mejora' WHEN d_mcs<-3 THEN 'deterioro' ELSE 'estable' END;
            NEW.cambio_cv_total   := d_tot;
            NEW.cambio_cualit_total := CASE WHEN d_tot>3 THEN 'mejora' WHEN d_tot<-3 THEN 'deterioro' ELSE 'estable' END;
            NEW.cambio_clase_funcional := d_cf;
            NEW.cambio_cualit_cf  := CASE WHEN d_cf<0 THEN 'mejora' WHEN d_cf>0 THEN 'deterioro' ELSE 'estable' END;
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_cambios BEFORE INSERT ON evaluaciones FOR EACH ROW EXECUTE FUNCTION calcular_cambios_evaluacion();
