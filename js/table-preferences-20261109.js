/* Preferências locais das tabelas de Movimentações e Chamados.
 * Atua somente na visualização desktop e não altera dados, permissões ou exportações.
 */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'controle_campo_table_preferences_v1';
  const MIN_SCALE = 0.8;
  const MAX_SCALE = 1.4;
  const STEP = 0.1;
  const CONFIGS = [
    { key: 'movimentacao', tbodyId: 'movements-table-body', title: 'Movimentações', baseSize: 0.75 },
    { key: 'chamados', tbodyId: 'tickets-table-body', title: 'Chamados', baseSize: 0.66 }
  ];

  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  function loggedUser() {
    try {
      return window.Store && typeof Store.getLoggedUser === 'function' ? (Store.getLoggedUser() || {}) : {};
    } catch (_) {
      return {};
    }
  }

  function storageKey(config) {
    const user = loggedUser();
    const company = user.empresa_id || user.companyId || user.company_id || 'empresa';
    const identity = user.id || user.username || user.email || 'usuario';
    return [STORAGE_PREFIX, encodeURIComponent(String(company)), encodeURIComponent(String(identity)), config.key].join(':');
  }

  function defaultState() {
    return { hiddenColumns: [], fontScale: 1 };
  }

  function readState(config) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(config)) || 'null');
      const hiddenColumns = Array.isArray(parsed && parsed.hiddenColumns)
        ? parsed.hiddenColumns.map(String)
        : [];
      const rawScale = Number(parsed && parsed.fontScale);
      const fontScale = Number.isFinite(rawScale)
        ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale))
        : 1;
      return { hiddenColumns, fontScale };
    } catch (_) {
      return defaultState();
    }
  }

  function writeState(config, state) {
    try {
      localStorage.setItem(storageKey(config), JSON.stringify({
        hiddenColumns: Array.from(new Set(state.hiddenColumns || [])),
        fontScale: Number(state.fontScale || 1)
      }));
    } catch (_) {}
  }

  function tableFor(config) {
    const body = document.getElementById(config.tbodyId);
    return body ? body.closest('table') : null;
  }

  function columnDefinitions(table) {
    const headers = Array.from(table && table.tHead && table.tHead.rows[0] ? table.tHead.rows[0].cells : []);
    return headers.map((header, index) => {
      const visibleText = String(header.textContent || '').replace(/\s+/g, ' ').trim();
      const label = visibleText || (header.querySelector('input[type="checkbox"]') ? 'Seleção' : `Coluna ${index + 1}`);
      const key = normalize(label) || `coluna-${index + 1}`;
      header.dataset.ccColumnKey = key;
      return { key, label, index, header };
    });
  }

  function applyState(config) {
    const table = tableFor(config);
    if (!table) return;
    const state = readState(config);
    const hidden = new Set(state.hiddenColumns);
    const definitions = columnDefinitions(table);

    table.classList.add('cc-user-configurable-table', `cc-table-${config.key}`);
    table.style.setProperty('--cc-user-table-font-scale', String(state.fontScale));
    table.style.setProperty('--cc-user-table-font-size', `${(config.baseSize * state.fontScale).toFixed(3)}rem`);
    table.style.setProperty('--cc-user-table-button-size', `${(0.64 * state.fontScale).toFixed(3)}rem`);

    definitions.forEach(column => {
      const shouldHide = hidden.has(column.key);
      column.header.classList.toggle('cc-user-hidden-column', shouldHide);
      Array.from(table.tBodies).forEach(body => {
        Array.from(body.rows).forEach(row => {
          const cell = row.cells[column.index];
          if (!cell || cell.hasAttribute('colspan')) return;
          cell.classList.toggle('cc-user-hidden-column', shouldHide);
        });
      });
    });

    updateToolbar(config, state);
  }

  function updateToolbar(config, state) {
    const toolbar = document.querySelector(`.cc-table-preferences[data-module="${config.key}"]`);
    if (!toolbar) return;
    const value = toolbar.querySelector('.cc-font-value');
    const minus = toolbar.querySelector('[data-action="font-minus"]');
    const plus = toolbar.querySelector('[data-action="font-plus"]');
    const valueText = `${Math.round(state.fontScale * 100)}%`;
    if (value && value.textContent !== valueText) value.textContent = valueText;
    if (minus) minus.disabled = state.fontScale <= MIN_SCALE + 0.001;
    if (plus) plus.disabled = state.fontScale >= MAX_SCALE - 0.001;
  }

  function renderColumnMenu(config, toolbar) {
    const table = tableFor(config);
    const menu = toolbar.querySelector('.cc-column-menu');
    if (!table || !menu) return;
    const state = readState(config);
    const hidden = new Set(state.hiddenColumns);
    const definitions = columnDefinitions(table);
    menu.innerHTML = `
      <div class="cc-column-menu-title">Colunas visíveis</div>
      <div class="cc-column-options"></div>
      <button type="button" class="cc-table-reset" data-action="reset">Restaurar visual padrão</button>
    `;
    const options = menu.querySelector('.cc-column-options');
    definitions.forEach(column => {
      const label = document.createElement('label');
      label.className = 'cc-column-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !hidden.has(column.key);
      input.dataset.columnKey = column.key;
      const text = document.createElement('span');
      text.textContent = column.label;
      label.append(input, text);
      options.appendChild(label);
    });
  }

  function closeMenus(except) {
    document.querySelectorAll('.cc-column-menu.open').forEach(menu => {
      if (menu !== except) menu.classList.remove('open');
    });
    document.querySelectorAll('.cc-columns-button[aria-expanded="true"]').forEach(button => {
      if (!except || button.nextElementSibling !== except) button.setAttribute('aria-expanded', 'false');
    });
  }

  function changeFont(config, delta) {
    const state = readState(config);
    state.fontScale = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.fontScale + delta)) * 10) / 10;
    writeState(config, state);
    applyState(config);
  }

  function resetPreferences(config, toolbar) {
    const state = defaultState();
    writeState(config, state);
    applyState(config);
    renderColumnMenu(config, toolbar);
  }

  function createToolbar(config, host) {
    const toolbar = document.createElement('div');
    toolbar.className = 'cc-table-preferences no-print';
    toolbar.dataset.module = config.key;
    toolbar.dataset.storageKey = storageKey(config);
    toolbar.innerHTML = `
      <div class="cc-column-control">
        <button type="button" class="cc-table-control cc-columns-button" aria-expanded="false" title="Escolher colunas visíveis">☷ Colunas</button>
        <div class="cc-column-menu" role="menu"></div>
      </div>
      <div class="cc-font-control" aria-label="Tamanho da fonte da tabela">
        <button type="button" class="cc-table-control cc-font-button" data-action="font-minus" title="Diminuir fonte">A−</button>
        <span class="cc-font-value">100%</span>
        <button type="button" class="cc-table-control cc-font-button" data-action="font-plus" title="Aumentar fonte">A+</button>
      </div>
    `;

    toolbar.addEventListener('click', event => {
      const actionButton = event.target.closest('button');
      if (!actionButton) return;
      if (actionButton.classList.contains('cc-columns-button')) {
        const menu = toolbar.querySelector('.cc-column-menu');
        const willOpen = !menu.classList.contains('open');
        closeMenus(willOpen ? menu : null);
        if (willOpen) renderColumnMenu(config, toolbar);
        menu.classList.toggle('open', willOpen);
        actionButton.setAttribute('aria-expanded', String(willOpen));
        return;
      }
      const action = actionButton.dataset.action;
      if (action === 'font-minus') changeFont(config, -STEP);
      if (action === 'font-plus') changeFont(config, STEP);
      if (action === 'reset') resetPreferences(config, toolbar);
    });

    toolbar.addEventListener('change', event => {
      const input = event.target.closest('input[data-column-key]');
      if (!input) return;
      const state = readState(config);
      const hidden = new Set(state.hiddenColumns);
      if (input.checked) hidden.delete(input.dataset.columnKey);
      else hidden.add(input.dataset.columnKey);
      state.hiddenColumns = Array.from(hidden);
      writeState(config, state);
      applyState(config);
    });

    host.appendChild(toolbar);
    renderColumnMenu(config, toolbar);
    updateToolbar(config, readState(config));
    return toolbar;
  }

  function enhance(config) {
    const table = tableFor(config);
    if (!table) return;
    const card = table.closest('.card');
    const tableWrap = table.closest('.table-responsive');
    if (!card || !tableWrap) return;

    // O cabeçalho das páginas pode ser reconstruído pelos filtros legados.
    // Mantém os controles em uma faixa própria e estável, imediatamente acima da tabela.
    card.querySelectorAll(`.card-header .cc-table-preferences[data-module="${config.key}"]`).forEach(old => old.remove());
    let host = card.querySelector(`:scope > .cc-table-preferences-host[data-module="${config.key}"]`);
    if (!host) {
      host = document.createElement('div');
      host.className = 'cc-table-preferences-host no-print';
      host.dataset.module = config.key;
      card.insertBefore(host, tableWrap);
    }

    let toolbar = host.querySelector(`.cc-table-preferences[data-module="${config.key}"]`);
    const key = storageKey(config);
    if (toolbar && toolbar.dataset.storageKey !== key) {
      toolbar.remove();
      toolbar = null;
    }
    if (!toolbar) toolbar = createToolbar(config, host);
    applyState(config);
  }

  let scanTimer = null;
  function scheduleScan(delay) {
    // Agrupa mutações sem adiar indefinidamente quando a página está atualizando.
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      CONFIGS.forEach(enhance);
    }, delay == null ? 80 : delay);
  }

  function injectStyles() {
    if (document.getElementById('cc-table-preferences-style')) return;
    const style = document.createElement('style');
    style.id = 'cc-table-preferences-style';
    style.textContent = `
      .cc-table-preferences-host,.cc-table-preferences{display:none}
      @media(min-width:901px){
        .cc-table-preferences-host{display:flex!important;align-items:center!important;justify-content:flex-end!important;min-height:50px;padding:8px 14px;border-bottom:1px solid var(--border-color);background:rgba(255,255,255,.012);overflow:visible!important;position:relative;z-index:12}
        .cc-table-preferences{display:flex;align-items:center;gap:8px;margin-left:auto;position:relative;z-index:12}
        .cc-column-control{position:relative}
        .cc-table-control{height:32px;min-width:36px;padding:0 10px;border:1px solid var(--border-color);border-radius:7px;background:rgba(255,255,255,.04);color:var(--text-main);font:inherit;font-size:.76rem;font-weight:700;cursor:pointer}
        .cc-table-control:hover{background:rgba(37,99,235,.14);border-color:var(--primary-color)}
        .cc-table-control:disabled{opacity:.4;cursor:not-allowed}
        .cc-font-control{display:flex;align-items:center;border:1px solid var(--border-color);border-radius:7px;overflow:hidden;background:rgba(255,255,255,.03)}
        .cc-font-control .cc-table-control{border:0;border-radius:0;padding:0 8px}
        .cc-font-value{min-width:46px;text-align:center;color:var(--text-muted);font-size:.7rem;font-weight:700}
        .cc-column-menu{display:none;position:absolute;right:0;top:38px;width:250px;max-height:min(430px,70vh);overflow:auto;padding:12px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 16px 38px rgba(0,0,0,.35);z-index:100}
        .cc-column-menu.open{display:block}
        .cc-column-menu-title{font-size:.78rem;font-weight:800;color:var(--text-main);margin-bottom:9px;padding-bottom:8px;border-bottom:1px solid var(--border-color)}
        .cc-column-options{display:grid;gap:5px}
        .cc-column-option{display:flex;align-items:center;gap:9px;padding:6px 4px;font-size:.76rem;color:var(--text-main);cursor:pointer}
        .cc-column-option:hover{background:rgba(255,255,255,.04);border-radius:6px}
        .cc-column-option input{width:16px;height:16px;margin:0;accent-color:var(--primary-color)}
        .cc-table-reset{width:100%;margin-top:10px;padding:8px;border:1px solid var(--border-color);border-radius:7px;background:transparent;color:var(--text-muted);font-size:.72rem;font-weight:700;cursor:pointer}
        .cc-table-reset:hover{color:var(--text-main);border-color:var(--primary-color)}
        table.cc-user-configurable-table th,table.cc-user-configurable-table td{font-size:var(--cc-user-table-font-size)!important}
        table.cc-user-configurable-table td>strong,table.cc-user-configurable-table .badge-status{font-size:inherit!important}
        table.cc-user-configurable-table td .btn{font-size:var(--cc-user-table-button-size)!important}
        table.cc-user-configurable-table .cc-user-hidden-column{display:none!important}
        /* Chamados possui regras legadas com ID + !important. Estes seletores,
           carregados por último, permitem que a preferência do usuário prevaleça. */
        #view-chamados table.cc-user-configurable-table th{font-size:var(--cc-user-table-font-size)!important}
        #tickets-table-body td{font-size:var(--cc-user-table-font-size)!important}
        #tickets-table-body td>strong,#tickets-table-body .badge-status{font-size:inherit!important}
        #tickets-table-body td .btn{font-size:var(--cc-user-table-button-size)!important}
        #view-chamados table.cc-user-configurable-table th.cc-user-hidden-column,#tickets-table-body td.cc-user-hidden-column{display:none!important}
      }
      @media(max-width:900px){.cc-table-preferences-host,.cc-table-preferences{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  injectStyles();
  scheduleScan(0);
  document.addEventListener('DOMContentLoaded', () => scheduleScan(0));
  window.addEventListener('hashchange', () => scheduleScan(180));
  document.addEventListener('click', event => {
    if (!event.target.closest('.cc-table-preferences')) closeMenus(null);
  });
  new MutationObserver(() => scheduleScan(60)).observe(document.documentElement, { childList: true, subtree: true });
  // Garantia leve para páginas legadas que recriam partes do conteúdo depois do carregamento.
  setInterval(() => CONFIGS.forEach(enhance), 1500);

  window.TablePreferences = { applyState, readState, storageKey, scan: () => CONFIGS.forEach(enhance) };
})();
