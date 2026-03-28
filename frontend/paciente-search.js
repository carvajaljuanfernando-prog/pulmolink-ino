/**
 * PulmoLink INO — Componente de búsqueda universal de pacientes
 * Reemplaza cualquier <select id="pac-select"> por una barra inteligente
 * con autocompletado, búsqueda por nombre/apellido/CC y filtros opcionales.
 * 
 * Uso: incluir <script src="/paciente-search.js"></script> en cualquier módulo
 * El componente se inicializa automáticamente al cargar la página.
 */

(function() {
  const STYLE = `
    .ps-wrapper { position: relative; width: 100%; }
    .ps-input-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .ps-input-wrap { position: relative; flex: 1; min-width: 220px; }
    .ps-input {
      width: 100%; padding: 10px 36px 10px 14px;
      border: 1.5px solid rgba(0,107,143,0.2);
      border-radius: 10px; font-family: "Nunito", sans-serif;
      font-size: 14px; color: #0A2330; background: #fff;
      outline: none; transition: border-color 0.15s;
    }
    .ps-input:focus { border-color: #00A3C4; box-shadow: 0 0 0 3px rgba(0,163,196,0.12); }
    .ps-clear {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; color: #7A9AAA;
      font-size: 16px; display: none; line-height: 1; padding: 2px;
    }
    .ps-clear.visible { display: block; }
    .ps-filter-btn {
      padding: 9px 14px; border: 1.5px solid rgba(0,107,143,0.2);
      border-radius: 10px; background: #fff; font-family: "Nunito", sans-serif;
      font-size: 13px; font-weight: 600; color: #3A5566; cursor: pointer;
      white-space: nowrap; transition: all 0.15s;
    }
    .ps-filter-btn:hover, .ps-filter-btn.active { border-color: #006B8F; background: #E0F5FB; color: #00425A; }
    .ps-filters {
      display: none; gap: 8px; margin-top: 8px; flex-wrap: wrap;
      padding: 10px 12px; background: #F2F7FA;
      border: 1px solid rgba(0,107,143,0.12); border-radius: 10px;
    }
    .ps-filters.visible { display: flex; }
    .ps-filter-select {
      padding: 7px 12px; border: 1.5px solid rgba(0,107,143,0.15);
      border-radius: 8px; font-family: "Nunito", sans-serif;
      font-size: 12px; color: #3A5566; background: #fff;
      outline: none; cursor: pointer;
    }
    .ps-filter-select:focus { border-color: #00A3C4; }
    .ps-dropdown {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: #fff; border: 1.5px solid rgba(0,107,143,0.18);
      border-radius: 12px; box-shadow: 0 8px 24px rgba(0,66,90,0.14);
      z-index: 9999; max-height: 320px; overflow-y: auto; display: none;
    }
    .ps-dropdown.visible { display: block; }
    .ps-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; cursor: pointer; transition: background 0.1s;
      border-bottom: 1px solid rgba(0,107,143,0.06);
    }
    .ps-item:last-child { border-bottom: none; }
    .ps-item:hover, .ps-item.selected { background: #E0F5FB; }
    .ps-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: #006B8F; color: #fff; font-size: 13px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .ps-avatar.riesgo-alto { background: #D63E3E; }
    .ps-avatar.riesgo-intermedio { background: #C07A00; }
    .ps-avatar.riesgo-bajo { background: #1A7A4A; }
    .ps-item-info { flex: 1; min-width: 0; }
    .ps-item-name { font-size: 13px; font-weight: 700; color: #0A2330; }
    .ps-item-name mark { background: #E0F5FB; color: #006B8F; border-radius: 3px; padding: 0 2px; }
    .ps-item-detail { font-size: 11px; color: #7A9AAA; margin-top: 1px; }
    .ps-item-badges { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
    .ps-badge {
      font-size: 10px; font-weight: 700; padding: 1px 7px;
      border-radius: 6px; white-space: nowrap;
    }
    .ps-badge-riesgo-bajo { background: #E8F7EF; color: #1A7A4A; }
    .ps-badge-riesgo-intermedio { background: #FEF5E4; color: #C07A00; }
    .ps-badge-riesgo-alto { background: #FDF0F0; color: #D63E3E; }
    .ps-badge-grupo { background: #E0F5FB; color: #006B8F; }
    .ps-badge-eps { background: #F2F7FA; color: #3A5566; }
    .ps-empty {
      padding: 20px; text-align: center;
      font-size: 13px; color: #7A9AAA;
    }
    .ps-selected-chip {
      display: inline-flex; align-items: center; gap: 6px;
      background: #E0F5FB; border: 1px solid rgba(0,107,143,0.2);
      border-radius: 20px; padding: 5px 12px; font-size: 13px;
      font-weight: 600; color: #00425A; margin-top: 8px;
    }
    .ps-chip-remove {
      background: none; border: none; cursor: pointer;
      color: #7A9AAA; font-size: 15px; line-height: 1; padding: 0;
    }
    .ps-chip-remove:hover { color: #D63E3E; }
  `;

  function inject() {
    if (document.getElementById('ps-styles')) return;
    const st = document.createElement('style');
    st.id = 'ps-styles';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  function highlight(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  function initSearch(selectEl, pacientes, onSelect) {
    inject();
    const parent = selectEl.parentElement;
    selectEl.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'ps-wrapper';

    wrapper.innerHTML = `
      <div class="ps-input-row">
        <div class="ps-input-wrap">
          <input class="ps-input" type="text" placeholder="Buscar por nombre, apellido o documento..." autocomplete="off">
          <button class="ps-clear" title="Limpiar">✕</button>
          <div class="ps-dropdown"></div>
        </div>
        <button class="ps-filter-btn" title="Filtros">⚡ Filtros</button>
      </div>
      <div class="ps-filters">
        <select class="ps-filter-select" id="ps-f-riesgo">
          <option value="">Todos los riesgos</option>
          <option value="bajo">🟢 Riesgo Bajo</option>
          <option value="intermedio">🟡 Riesgo Intermedio</option>
          <option value="alto">🔴 Riesgo Alto</option>
        </select>
        <select class="ps-filter-select" id="ps-f-grupo">
          <option value="">Todos los grupos HP</option>
          <option value="1">Grupo 1 (HAP)</option>
          <option value="2">Grupo 2</option>
          <option value="3">Grupo 3</option>
          <option value="4">Grupo 4</option>
          <option value="5">Grupo 5</option>
        </select>
        <select class="ps-filter-select" id="ps-f-eps">
          <option value="">Todas las EPS</option>
        </select>
      </div>
      <div id="ps-chip-area"></div>
    `;

    parent.insertBefore(wrapper, selectEl.nextSibling);

    const input      = wrapper.querySelector('.ps-input');
    const clearBtn   = wrapper.querySelector('.ps-clear');
    const dropdown   = wrapper.querySelector('.ps-dropdown');
    const filterBtn  = wrapper.querySelector('.ps-filter-btn');
    const filtersDiv = wrapper.querySelector('.ps-filters');
    const fRiesgo    = wrapper.querySelector('#ps-f-riesgo');
    const fGrupo     = wrapper.querySelector('#ps-f-grupo');
    const fEps       = wrapper.querySelector('#ps-f-eps');
    const chipArea   = wrapper.querySelector('#ps-chip-area');

    let seleccionado = null;
    let filtersOpen  = false;

    // Poblar EPS únicas
    const epsSet = [...new Set(pacientes.map(p => p.eps).filter(Boolean))].sort();
    epsSet.forEach(eps => {
      const o = document.createElement('option');
      o.value = eps; o.textContent = eps;
      fEps.appendChild(o);
    });

    function filtrar(query) {
      const q     = query.trim().toLowerCase();
      const riesgo = fRiesgo.value;
      const grupo  = fGrupo.value;
      const eps    = fEps.value;
      return pacientes.filter(p => {
        const nombre = `${p.nombre} ${p.apellido}`.toLowerCase();
        const cc     = (p.numero_documento || '').toLowerCase();
        const matchQ = !q || nombre.includes(q) || cc.includes(q);
        const matchR = !riesgo || p.clasificacion_riesgo === riesgo;
        const matchG = !grupo  || String(p.grupo_hp_oms) === grupo;
        const matchE = !eps    || p.eps === eps;
        return matchQ && matchR && matchG && matchE;
      });
    }

    function renderDropdown(query) {
      const results = filtrar(query).slice(0, 12);
      if (!results.length) {
        dropdown.innerHTML = '<div class="ps-empty">Sin resultados. Intenta con otro nombre o documento.</div>';
      } else {
        dropdown.innerHTML = results.map(p => {
          const ini    = ((p.nombre||'')[0]||'') + ((p.apellido||'')[0]||'');
          const nombre = highlight(`${p.nombre} ${p.apellido}`, query);
          const cc     = highlight(p.numero_documento || '', query);
          const rClass = p.clasificacion_riesgo ? `riesgo-${p.clasificacion_riesgo}` : '';
          const rLabel = { bajo:'Riesgo Bajo', intermedio:'Riesgo Intermedio', alto:'Riesgo Alto' }[p.clasificacion_riesgo] || '';
          const cf     = p.clase_funcional_oms ? `CF ${['I','II','III','IV'][p.clase_funcional_oms-1]||''}` : '';
          return `<div class="ps-item" data-id="${p.id}">
            <div class="ps-avatar ${rClass}">${ini.toUpperCase()}</div>
            <div class="ps-item-info">
              <div class="ps-item-name">${nombre}</div>
              <div class="ps-item-detail">${cc ? 'CC '+cc : ''}${cf ? ' · '+cf : ''}</div>
              <div class="ps-item-badges">
                ${rLabel ? `<span class="ps-badge ps-badge-riesgo-${p.clasificacion_riesgo}">${rLabel}</span>` : ''}
                ${p.grupo_hp_oms ? `<span class="ps-badge ps-badge-grupo">Grupo ${p.grupo_hp_oms}</span>` : ''}
                ${p.eps ? `<span class="ps-badge ps-badge-eps">${p.eps}</span>` : ''}
              </div>
            </div>
          </div>`;
        }).join('');

        dropdown.querySelectorAll('.ps-item').forEach(item => {
          item.addEventListener('mousedown', e => {
            e.preventDefault();
            const id = item.dataset.id;
            const pac = pacientes.find(p => p.id === id);
            if (pac) seleccionar(pac);
          });
        });
      }
      dropdown.classList.add('visible');
    }

    function seleccionar(pac) {
      seleccionado = pac;
      input.value  = `${pac.nombre} ${pac.apellido}`;
      dropdown.classList.remove('visible');
      clearBtn.classList.add('visible');
      // Actualizar el select original
      selectEl.value = pac.id;
      selectEl.dispatchEvent(new Event('change'));
      // Chip visual
      chipArea.innerHTML = `<div class="ps-selected-chip">
        <span>✓ ${pac.nombre} ${pac.apellido}${pac.numero_documento ? ' · CC '+pac.numero_documento : ''}</span>
        <button class="ps-chip-remove" title="Cambiar paciente">✕</button>
      </div>`;
      chipArea.querySelector('.ps-chip-remove').addEventListener('click', limpiar);
      if (onSelect) onSelect(pac);
    }

    function limpiar() {
      seleccionado  = null;
      input.value   = '';
      chipArea.innerHTML = '';
      dropdown.classList.remove('visible');
      clearBtn.classList.remove('visible');
      selectEl.value = '';
      selectEl.dispatchEvent(new Event('change'));
      input.focus();
    }

    // Eventos
    input.addEventListener('input', () => {
      clearBtn.classList.toggle('visible', input.value.length > 0);
      if (input.value.length >= 1 || fRiesgo.value || fGrupo.value || fEps.value) {
        renderDropdown(input.value);
      } else {
        dropdown.classList.remove('visible');
      }
    });

    input.addEventListener('focus', () => {
      if (input.value.length >= 1 || fRiesgo.value || fGrupo.value || fEps.value) {
        renderDropdown(input.value);
      } else if (pacientes.length <= 20) {
        // Si hay pocos pacientes, mostrar todos al hacer foco
        renderDropdown('');
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { dropdown.classList.remove('visible'); input.blur(); }
      if (e.key === 'Enter') {
        const first = dropdown.querySelector('.ps-item');
        if (first) first.dispatchEvent(new MouseEvent('mousedown'));
      }
    });

    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) dropdown.classList.remove('visible');
    });

    clearBtn.addEventListener('click', limpiar);

    filterBtn.addEventListener('click', () => {
      filtersOpen = !filtersOpen;
      filtersDiv.classList.toggle('visible', filtersOpen);
      filterBtn.classList.toggle('active', filtersOpen);
    });

    [fRiesgo, fGrupo, fEps].forEach(f => {
      f.addEventListener('change', () => {
        const active = fRiesgo.value || fGrupo.value || fEps.value;
        filterBtn.textContent = active ? '⚡ Filtros ●' : '⚡ Filtros';
        renderDropdown(input.value);
      });
    });

    // Si el select ya tiene un valor preseleccionado
    if (selectEl.value) {
      const pac = pacientes.find(p => p.id === selectEl.value);
      if (pac) seleccionar(pac);
    }

    return { limpiar, seleccionar };
  }

  // Auto-inicialización: busca el select pac-select y lo reemplaza
  // cuando los pacientes ya están cargados
  window.PulmoSearch = { init: initSearch };

  // Hook global: intercepta cargarPacientes para auto-activar
  const _origFetch = window.fetch;
  window.__ps_pacientes = [];
  window.fetch = function(...args) {
    return _origFetch.apply(this, args).then(res => {
      const url = typeof args[0] === 'string' ? args[0] : '';
      if (url.includes('pacientes-lista')) {
        res.clone().json().then(d => {
          if (d.pacientes) {
            window.__ps_pacientes = d.pacientes;
            setTimeout(activarSearch, 100);
          }
        }).catch(() => {});
      }
      return res;
    });
  };

  function activarSearch() {
    const sel = document.getElementById('pac-select');
    if (!sel || sel.dataset.psInit) return;
    if (!window.__ps_pacientes.length) return;
    sel.dataset.psInit = '1';
    window.PulmoSearch.init(sel, window.__ps_pacientes, null);
  }

})();
