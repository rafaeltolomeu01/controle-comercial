/*
 * Clientes Importador do Sistema
 * Adiciona uma guia isolada na tela Gestão de Clientes, sem alterar funções existentes.
 * Os dados importados ficam separados em localStorage e podem ser exportados em Excel.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'controle_comercial_clientes_importador_sistema_v1';
  const IMPORT_SESSION_KEY = 'controle_comercial_clientes_importador_session_v1';

  const FIELDS = [
    { key: 'codigo', label: 'Código', required: true, aliases: ['codigo', 'código', 'cod', 'cód', 'codigo cliente', 'codigo do cliente', 'cód cliente', 'cod cliente'] },
    { key: 'fantasia', label: 'Fantasia', required: true, aliases: ['fantasia', 'nome fantasia', 'cliente', 'nome cliente', 'razao fantasia'] },
    { key: 'cnpj', label: 'CNPJ', required: true, aliases: ['cnpj', 'cpf/cnpj', 'documento'] },
    { key: 'atividade', label: 'Atividade', required: false, aliases: ['atividade', 'categoria', 'ramo', 'ramo atividade', 'atividade principal'] },
    { key: 'fone', label: 'Fone', required: false, aliases: ['fone', 'telefone', 'tel', 'celular', 'whatsapp', 'contato'] },
    { key: 'email', label: 'Email', required: false, aliases: ['email', 'e-mail', 'mail', 'correio eletrônico'] },
    { key: 'empresaResponsavel', label: 'Empresa Responsável', required: false, aliases: ['empresa responsavel', 'empresa responsável', 'empresa', 'distribuidora', 'empresa base'] },
    { key: 'cidade', label: 'Cidade', required: false, aliases: ['cidade', 'municipio', 'município'] },
    { key: 'vendedor', label: 'Vendedor', required: false, aliases: ['vendedor', 'representante', 'consultor', 'responsavel comercial', 'responsável comercial'] },
    { key: 'supervisor', label: 'Supervisor', required: false, aliases: ['supervisor', 'gerente', 'coordenador'] }
  ];

  const state = {
    initializedForPanel: null,
    showImporter: false,
    importHeaders: [],
    importRows: [],
    mapping: {},
    mappedRows: [],
    errors: []
  };

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function getRows() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Falha ao ler clientes importados:', err);
      return [];
    }
  }

  function saveRows(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
  }

  function showToast(message) {
    if (window.App && typeof App.showToast === 'function') {
      App.showToast(message);
      return;
    }
    const toast = document.getElementById('save-toast');
    if (toast) {
      toast.textContent = message;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2500);
      return;
    }
    alert(message);
  }

  function injectStyle() {
    if (document.getElementById('clientes-importador-sistema-style')) return;
    const style = document.createElement('style');
    style.id = 'clientes-importador-sistema-style';
    style.textContent = `
      #clientes-importador-sistema-content.hidden { display: none !important; }
      #tab-client-importador-sistema { white-space: nowrap; }
      .clientes-importador-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; width:100%; border-top:1px dashed var(--border-color); padding-top:10px; margin-top:6px; }
      .clientes-importador-filter-row { display:flex; flex-wrap:wrap; gap:12px; width:100%; align-items:flex-start; }
      .clientes-importador-filter-group { display:flex; flex-direction:column; gap:4px; min-width:140px; flex:1; }
      .clientes-importador-filter-group.search { flex:2; min-width:220px; }
      .clientes-importador-filter-group label { font-size:.72rem; font-weight:600; color:var(--text-muted); }
      .clientes-importador-filter-group input,
      .clientes-importador-filter-group select,
      .clientes-importador-map-select,
      #clientes-importador-file-input { height:36px; padding:0 10px; background:var(--bg-input); border:1px solid var(--border-color); color:var(--text-main); border-radius:6px; font-size:.82rem; width:100%; }
      .clientes-importador-map-select { min-width:220px; }
      .clientes-importador-table-wrap { overflow-x:auto; }
      .clientes-importador-table-wrap table { min-width:1100px; }
      .clientes-importador-modal-overlay { display:none; position:fixed; inset:0; z-index:2600; background:rgba(0,0,0,.68); align-items:center; justify-content:center; padding:18px 10px; }
      .clientes-importador-modal-overlay.open { display:flex; }
      .clientes-importador-modal { width:min(1120px, 96vw); max-height:92vh; overflow:auto; background:var(--bg-card); border:1px solid var(--border-color); border-radius:14px; box-shadow:0 16px 44px rgba(0,0,0,.45); padding:18px; color:var(--text-main); }
      .clientes-importador-modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:14px; }
      .clientes-importador-modal-title { margin:0; font-family:var(--font-title); font-size:1.05rem; color:var(--text-main); }
      .clientes-importador-modal-subtitle { margin:4px 0 0; color:var(--text-muted); font-size:.78rem; line-height:1.35; }
      .clientes-importador-close { background:transparent; border:0; color:var(--text-muted); font-size:1.4rem; cursor:pointer; line-height:1; padding:4px 8px; }
      .clientes-importador-step { border:1px solid var(--border-color); background:rgba(255,255,255,.02); border-radius:10px; padding:14px; margin-bottom:12px; }
      .clientes-importador-step h4 { margin:0 0 10px; color:var(--primary-color); font-family:var(--font-title); font-size:.9rem; }
      .clientes-importador-map-grid { display:grid; grid-template-columns: minmax(160px, 240px) 1fr; gap:10px; align-items:center; }
      .clientes-importador-required { color:var(--danger); font-weight:700; }
      .clientes-importador-preview-table { width:100%; min-width:980px; font-size:.78rem; }
      .clientes-importador-preview-table th,
      .clientes-importador-preview-table td { white-space:nowrap; }
      .clientes-importador-errors { display:none; border:1px solid rgba(239,68,68,.45); background:rgba(239,68,68,.08); border-radius:8px; padding:10px; color:#fecaca; font-size:.78rem; max-height:180px; overflow:auto; }
      .clientes-importador-errors.open { display:block; }
      .clientes-importador-modal-footer { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; border-top:1px solid var(--border-color); padding-top:14px; margin-top:14px; }
      @media (max-width: 768px) {
        #view-clientes .view-tabs { overflow-x:auto; display:flex; flex-wrap:nowrap; padding-bottom:8px; }
        .clientes-importador-filter-group,
        .clientes-importador-filter-group.search { min-width:100%; }
        .clientes-importador-map-grid { grid-template-columns:1fr; }
        .clientes-importador-modal { padding:14px; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildContentHtml() {
    const filterSelect = (id, label) => `
      <div class="clientes-importador-filter-group">
        <label for="${id}">${label}</label>
        <select id="${id}"><option value="">Todos</option></select>
      </div>`;

    return `
      <div id="clientes-importador-sistema-content" class="hidden">
        <div class="card" id="clientes-importador-card">
          <div class="card-header">
            <span class="card-title">Clientes Importador do Sistema</span>
            <button class="btn btn-primary" id="btn-clientes-importador-open" type="button">+ Importar Clientes</button>
          </div>

          <div class="general-filter-bar no-print" style="padding:16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border-color);display:flex;flex-direction:column;gap:12px;">
            <div class="clientes-importador-filter-row">
              <div class="clientes-importador-filter-group search">
                <label for="clientes-importador-search">Buscar Texto</label>
                <input type="text" id="clientes-importador-search" placeholder="Pesquisar por código, fantasia, CNPJ, cidade, vendedor...">
              </div>
              ${filterSelect('clientes-importador-empresa', 'Empresa Responsável')}
              ${filterSelect('clientes-importador-cidade', 'Cidade')}
              ${filterSelect('clientes-importador-vendedor', 'Vendedor')}
              ${filterSelect('clientes-importador-supervisor', 'Supervisor')}
            </div>
            <div class="clientes-importador-actions">
              <button type="button" class="btn btn-secondary" id="btn-clientes-importador-clear" style="height:32px;padding:0 12px;font-size:.78rem;">✕ Limpar Filtros</button>
              <button type="button" class="btn btn-success" id="btn-clientes-importador-export-filtered" style="height:32px;padding:0 12px;font-size:.78rem;background-color:#10b981;border:1px solid #059669;color:#fff;">📥 Exportar Excel</button>
              <button type="button" class="btn btn-secondary" id="btn-clientes-importador-export-all" style="height:32px;padding:0 12px;font-size:.78rem;">🗂️ Exportar Tudo</button>
            </div>
          </div>

          <div class="table-responsive clientes-importador-table-wrap">
            <table>
              <thead>
                <tr>
                  ${FIELDS.map(field => `<th>${escapeHtml(field.label)}</th>`).join('')}
                </tr>
              </thead>
              <tbody id="clientes-importador-table-body"></tbody>
            </table>
          </div>
        </div>

        <div id="modal-clientes-importador" class="clientes-importador-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="clientes-importador-modal-title">
          <div class="clientes-importador-modal">
            <div class="clientes-importador-modal-header">
              <div>
                <h3 id="clientes-importador-modal-title" class="clientes-importador-modal-title">Importar Clientes do Sistema</h3>
                <p class="clientes-importador-modal-subtitle">Envie uma planilha Excel ou CSV, confira o mapeamento das colunas e revise a prévia antes de confirmar.</p>
              </div>
              <button type="button" class="clientes-importador-close" id="btn-clientes-importador-close" aria-label="Fechar">×</button>
            </div>

            <div class="clientes-importador-step">
              <h4>1. Arquivo</h4>
              <input type="file" id="clientes-importador-file-input" accept=".xlsx,.xls,.csv">
              <p style="font-size:.75rem;color:var(--text-muted);margin:8px 0 0;">A primeira linha da planilha deve conter o cabeçalho das colunas.</p>
            </div>

            <div class="clientes-importador-step" id="clientes-importador-map-step" style="display:none;">
              <h4>2. Mapeamento de Colunas</h4>
              <div id="clientes-importador-map-grid" class="clientes-importador-map-grid"></div>
            </div>

            <div class="clientes-importador-step" id="clientes-importador-preview-step" style="display:none;">
              <h4>3. Prévia da Importação</h4>
              <div class="table-responsive" style="overflow-x:auto;">
                <table class="clientes-importador-preview-table">
                  <thead><tr>${FIELDS.map(field => `<th>${escapeHtml(field.label)}</th>`).join('')}</tr></thead>
                  <tbody id="clientes-importador-preview-body"></tbody>
                </table>
              </div>
            </div>

            <div id="clientes-importador-errors" class="clientes-importador-errors"></div>

            <div class="clientes-importador-modal-footer">
              <button type="button" class="btn btn-secondary" id="btn-clientes-importador-cancel">Cancelar</button>
              <button type="button" class="btn btn-secondary" id="btn-clientes-importador-errors-xlsx" style="display:none;">Baixar Relatório de Erros</button>
              <button type="button" class="btn btn-primary" id="btn-clientes-importador-confirm" disabled>Confirmar Importação</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function findClientesPanel() {
    return document.getElementById('view-clientes');
  }

  function ensureUi() {
    const panel = findClientesPanel();
    if (!panel || !panel.innerHTML.trim()) return false;

    injectStyle();

    const tabs = panel.querySelector('.view-tabs');
    if (!tabs) return false;

    let importerTab = panel.querySelector('#tab-client-importador-sistema');
    if (!importerTab) {
      importerTab = document.createElement('button');
      importerTab.type = 'button';
      importerTab.className = 'view-tab-btn';
      importerTab.id = 'tab-client-importador-sistema';
      importerTab.textContent = 'Clientes Importador do Sistema';
      tabs.appendChild(importerTab);
    }

    let importerContent = panel.querySelector('#clientes-importador-sistema-content');
    if (!importerContent) {
      tabs.insertAdjacentHTML('afterend', buildContentHtml());
      importerContent = panel.querySelector('#clientes-importador-sistema-content');
    }

    bindEvents(panel);
    refreshFilterOptions();
    renderTable();
    return true;
  }

  function bindEvents(panel) {
    if (panel.dataset.clientesImportadorBound === '1') return;
    panel.dataset.clientesImportadorBound = '1';

    const importerTab = panel.querySelector('#tab-client-importador-sistema');
    importerTab?.addEventListener('click', () => setImporterVisible(true));

    panel.querySelectorAll('.view-tabs a[href="#clientes"]').forEach(tab => {
      tab.addEventListener('click', () => setImporterVisible(false));
    });

    panel.querySelector('#btn-clientes-importador-open')?.addEventListener('click', openImportModal);
    panel.querySelector('#btn-clientes-importador-clear')?.addEventListener('click', clearFilters);
    panel.querySelector('#btn-clientes-importador-export-filtered')?.addEventListener('click', () => exportRows(true));
    panel.querySelector('#btn-clientes-importador-export-all')?.addEventListener('click', () => exportRows(false));

    ['clientes-importador-search', 'clientes-importador-empresa', 'clientes-importador-cidade', 'clientes-importador-vendedor', 'clientes-importador-supervisor'].forEach(id => {
      const el = panel.querySelector('#' + id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderTable);
    });

    panel.querySelector('#btn-clientes-importador-close')?.addEventListener('click', closeImportModal);
    panel.querySelector('#btn-clientes-importador-cancel')?.addEventListener('click', closeImportModal);
    panel.querySelector('#btn-clientes-importador-confirm')?.addEventListener('click', confirmImport);
    panel.querySelector('#btn-clientes-importador-errors-xlsx')?.addEventListener('click', exportErrors);
    panel.querySelector('#clientes-importador-file-input')?.addEventListener('change', handleFileSelected);

    const modal = panel.querySelector('#modal-clientes-importador');
    modal?.addEventListener('click', event => {
      if (event.target === modal) closeImportModal();
    });
  }

  function setImporterVisible(show) {
    const panel = findClientesPanel();
    if (!panel) return;
    const importerContent = panel.querySelector('#clientes-importador-sistema-content');
    const tabs = panel.querySelector('.view-tabs');
    if (!importerContent || !tabs) return;

    state.showImporter = !!show;

    Array.from(panel.children).forEach(child => {
      if (child === tabs || child === importerContent) return;
      child.style.display = show ? 'none' : '';
    });

    importerContent.classList.toggle('hidden', !show);
    panel.querySelectorAll('.view-tabs .view-tab-btn').forEach(tab => tab.classList.remove('active'));
    if (show) {
      panel.querySelector('#tab-client-importador-sistema')?.classList.add('active');
      refreshFilterOptions();
      renderTable();
    } else {
      panel.querySelector('.view-tabs a[href="#clientes"]')?.classList.add('active');
    }
  }

  function clearFilters() {
    const panel = findClientesPanel();
    if (!panel) return;
    ['clientes-importador-search', 'clientes-importador-empresa', 'clientes-importador-cidade', 'clientes-importador-vendedor', 'clientes-importador-supervisor'].forEach(id => {
      const el = panel.querySelector('#' + id);
      if (el) el.value = '';
    });
    renderTable();
  }

  function getFilterValues() {
    const panel = findClientesPanel();
    const value = id => String(panel?.querySelector('#' + id)?.value || '').trim();
    return {
      search: normalize(value('clientes-importador-search')),
      empresaResponsavel: value('clientes-importador-empresa'),
      cidade: value('clientes-importador-cidade'),
      vendedor: value('clientes-importador-vendedor'),
      supervisor: value('clientes-importador-supervisor')
    };
  }

  function filterRows(rows) {
    const filters = getFilterValues();
    return rows.filter(row => {
      if (filters.search) {
        const haystack = normalize(FIELDS.map(field => row[field.key]).join(' '));
        if (!haystack.includes(filters.search)) return false;
      }
      for (const key of ['empresaResponsavel', 'cidade', 'vendedor', 'supervisor']) {
        if (filters[key] && String(row[key] || '') !== filters[key]) return false;
      }
      return true;
    });
  }

  function refreshFilterOptions() {
    const panel = findClientesPanel();
    if (!panel) return;
    const rows = getRows();
    const configs = [
      ['clientes-importador-empresa', 'empresaResponsavel'],
      ['clientes-importador-cidade', 'cidade'],
      ['clientes-importador-vendedor', 'vendedor'],
      ['clientes-importador-supervisor', 'supervisor']
    ];
    configs.forEach(([id, key]) => {
      const select = panel.querySelector('#' + id);
      if (!select) return;
      const current = select.value;
      const values = Array.from(new Set(rows.map(row => String(row[key] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      select.innerHTML = '<option value="">Todos</option>' + values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('');
      if (values.includes(current)) select.value = current;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('clientes-importador-table-body');
    if (!tbody) return;
    const rows = filterRows(getRows());
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${FIELDS.length}" style="text-align:center;color:var(--text-muted);padding:18px;">Nenhum cliente importado encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(row => `
      <tr>
        ${FIELDS.map(field => `<td data-label="${escapeAttr(field.label)}">${escapeHtml(row[field.key] || '-')}</td>`).join('')}
      </tr>
    `).join('');
  }

  function openImportModal() {
    const panel = findClientesPanel();
    if (!panel) return;
    resetImportState();
    const modal = panel.querySelector('#modal-clientes-importador');
    modal?.classList.add('open');
    const fileInput = panel.querySelector('#clientes-importador-file-input');
    if (fileInput) fileInput.value = '';
  }

  function closeImportModal() {
    const modal = document.getElementById('modal-clientes-importador');
    modal?.classList.remove('open');
  }

  function resetImportState() {
    state.importHeaders = [];
    state.importRows = [];
    state.mapping = {};
    state.mappedRows = [];
    state.errors = [];
    const panel = findClientesPanel();
    if (!panel) return;
    const mapStep = panel.querySelector('#clientes-importador-map-step');
    const previewStep = panel.querySelector('#clientes-importador-preview-step');
    const mapGrid = panel.querySelector('#clientes-importador-map-grid');
    const previewBody = panel.querySelector('#clientes-importador-preview-body');
    const errorsBox = panel.querySelector('#clientes-importador-errors');
    const confirmBtn = panel.querySelector('#btn-clientes-importador-confirm');
    const errorsBtn = panel.querySelector('#btn-clientes-importador-errors-xlsx');
    if (mapStep) mapStep.style.display = 'none';
    if (previewStep) previewStep.style.display = 'none';
    if (mapGrid) mapGrid.innerHTML = '';
    if (previewBody) previewBody.innerHTML = '';
    if (errorsBox) { errorsBox.innerHTML = ''; errorsBox.classList.remove('open'); }
    if (confirmBtn) confirmBtn.disabled = true;
    if (errorsBtn) errorsBtn.style.display = 'none';
  }

  function handleFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!window.XLSX) {
      alert('Biblioteca de Excel não carregada. Verifique sua conexão e tente novamente.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      try {
        const data = new Uint8Array(loadEvent.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error('Arquivo sem planilha válida.');
        const sheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const cleaned = matrix.filter(row => Array.isArray(row) && row.some(cell => String(cell || '').trim() !== ''));
        if (cleaned.length < 2) throw new Error('A planilha precisa ter cabeçalho e pelo menos uma linha de dados.');
        state.importHeaders = cleaned[0].map((cell, index) => String(cell || `Coluna ${index + 1}`).trim());
        state.importRows = cleaned.slice(1).map((row, rowIndex) => ({
          __line: rowIndex + 2,
          __values: state.importHeaders.reduce((acc, header, index) => {
            acc[header] = row[index] == null ? '' : String(row[index]).trim();
            return acc;
          }, {})
        }));
        autoMapHeaders();
        renderMappingStep();
        updatePreviewAndValidation();
      } catch (err) {
        alert('Erro ao ler arquivo: ' + (err.message || err));
        resetImportState();
      }
    };
    reader.onerror = function () {
      alert('Não foi possível ler o arquivo selecionado.');
    };
    reader.readAsArrayBuffer(file);
  }

  function autoMapHeaders() {
    const normalizedHeaders = state.importHeaders.map(header => ({ header, norm: normalize(header) }));
    state.mapping = {};
    FIELDS.forEach(field => {
      const aliasNorms = [field.label, ...(field.aliases || [])].map(normalize);
      let found = normalizedHeaders.find(h => aliasNorms.includes(h.norm));
      if (!found) found = normalizedHeaders.find(h => aliasNorms.some(alias => h.norm.includes(alias) || alias.includes(h.norm)));
      state.mapping[field.key] = found ? found.header : '';
    });
  }

  function renderMappingStep() {
    const panel = findClientesPanel();
    if (!panel) return;
    const mapStep = panel.querySelector('#clientes-importador-map-step');
    const mapGrid = panel.querySelector('#clientes-importador-map-grid');
    if (!mapStep || !mapGrid) return;
    mapStep.style.display = 'block';
    const options = '<option value="">Selecione a coluna da planilha...</option>' + state.importHeaders.map(header => `<option value="${escapeAttr(header)}">${escapeHtml(header)}</option>`).join('');
    mapGrid.innerHTML = FIELDS.map(field => `
      <label for="map-${field.key}" style="font-size:.8rem;color:var(--text-main);font-weight:600;">
        ${escapeHtml(field.label)} ${field.required ? '<span class="clientes-importador-required">*</span>' : ''}
      </label>
      <select id="map-${field.key}" class="clientes-importador-map-select" data-field="${field.key}">
        ${options}
      </select>
    `).join('');
    FIELDS.forEach(field => {
      const select = mapGrid.querySelector(`#map-${field.key}`);
      if (select) {
        select.value = state.mapping[field.key] || '';
        select.addEventListener('change', () => {
          state.mapping[field.key] = select.value;
          updatePreviewAndValidation();
        });
      }
    });
  }

  function mapRows() {
    const mapped = [];
    state.importRows.forEach(source => {
      const row = { __line: source.__line };
      FIELDS.forEach(field => {
        const header = state.mapping[field.key];
        row[field.key] = header ? String(source.__values[header] || '').trim() : '';
      });
      if (FIELDS.some(field => String(row[field.key] || '').trim())) mapped.push(row);
    });
    return mapped;
  }

  function isValidEmail(email) {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function validateMappedRows(rows) {
    const errors = [];
    const existing = getRows();
    const existingCodes = new Set(existing.map(row => normalize(row.codigo)).filter(Boolean));
    const existingCnpjs = new Set(existing.map(row => onlyDigits(row.cnpj)).filter(Boolean));
    const seenCodes = new Set();
    const seenCnpjs = new Set();

    FIELDS.filter(field => field.required).forEach(field => {
      if (!state.mapping[field.key]) {
        errors.push({ line: 'Mapeamento', field: field.label, message: `O campo obrigatório "${field.label}" não foi mapeado.` });
      }
    });

    rows.forEach(row => {
      const codeNorm = normalize(row.codigo);
      const cnpjDigits = onlyDigits(row.cnpj);

      if (!String(row.codigo || '').trim()) errors.push({ line: row.__line, field: 'Código', message: 'Código vazio.' });
      if (!String(row.fantasia || '').trim()) errors.push({ line: row.__line, field: 'Fantasia', message: 'Fantasia vazia.' });
      if (!String(row.cnpj || '').trim()) errors.push({ line: row.__line, field: 'CNPJ', message: 'CNPJ vazio.' });
      if (row.email && !isValidEmail(row.email)) errors.push({ line: row.__line, field: 'Email', message: 'Email inválido.' });

      if (codeNorm) {
        if (existingCodes.has(codeNorm)) errors.push({ line: row.__line, field: 'Código', message: 'Código já importado anteriormente.' });
        if (seenCodes.has(codeNorm)) errors.push({ line: row.__line, field: 'Código', message: 'Código duplicado dentro da planilha.' });
        seenCodes.add(codeNorm);
      }

      if (cnpjDigits) {
        if (existingCnpjs.has(cnpjDigits)) errors.push({ line: row.__line, field: 'CNPJ', message: 'CNPJ já importado anteriormente.' });
        if (seenCnpjs.has(cnpjDigits)) errors.push({ line: row.__line, field: 'CNPJ', message: 'CNPJ duplicado dentro da planilha.' });
        seenCnpjs.add(cnpjDigits);
      }
    });

    if (!rows.length) {
      errors.push({ line: 'Arquivo', field: 'Dados', message: 'Nenhuma linha válida encontrada para importar.' });
    }

    return errors;
  }

  function updatePreviewAndValidation() {
    state.mappedRows = mapRows();
    state.errors = validateMappedRows(state.mappedRows);
    renderPreview();
    renderErrors();
  }

  function renderPreview() {
    const panel = findClientesPanel();
    if (!panel) return;
    const previewStep = panel.querySelector('#clientes-importador-preview-step');
    const previewBody = panel.querySelector('#clientes-importador-preview-body');
    if (!previewStep || !previewBody) return;
    previewStep.style.display = 'block';
    const previewRows = state.mappedRows.slice(0, 15);
    previewBody.innerHTML = previewRows.map(row => `
      <tr>${FIELDS.map(field => `<td>${escapeHtml(row[field.key] || '-')}</td>`).join('')}</tr>
    `).join('') || `<tr><td colspan="${FIELDS.length}" style="text-align:center;color:var(--text-muted);">Nenhuma linha para prévia.</td></tr>`;
  }

  function renderErrors() {
    const panel = findClientesPanel();
    if (!panel) return;
    const errorsBox = panel.querySelector('#clientes-importador-errors');
    const confirmBtn = panel.querySelector('#btn-clientes-importador-confirm');
    const errorsBtn = panel.querySelector('#btn-clientes-importador-errors-xlsx');
    if (!errorsBox || !confirmBtn || !errorsBtn) return;

    if (state.errors.length) {
      errorsBox.classList.add('open');
      errorsBox.innerHTML = `<strong>Corrija antes de importar:</strong><ul style="margin:8px 0 0 18px;padding:0;">${state.errors.map(err => `<li>Linha ${escapeHtml(err.line)} — ${escapeHtml(err.field)}: ${escapeHtml(err.message)}</li>`).join('')}</ul>`;
      confirmBtn.disabled = true;
      errorsBtn.style.display = 'inline-flex';
    } else {
      errorsBox.classList.remove('open');
      errorsBox.innerHTML = '';
      confirmBtn.disabled = state.mappedRows.length === 0;
      errorsBtn.style.display = 'none';
    }
  }

  function confirmImport() {
    updatePreviewAndValidation();
    if (state.errors.length || !state.mappedRows.length) return;
    const now = new Date().toISOString();
    const rowsToSave = state.mappedRows.map(row => {
      const clean = { importedAt: now };
      FIELDS.forEach(field => { clean[field.key] = String(row[field.key] || '').trim(); });
      return clean;
    });
    const allRows = getRows().concat(rowsToSave);
    saveRows(allRows);
    closeImportModal();
    refreshFilterOptions();
    renderTable();
    showToast(`${rowsToSave.length} cliente(s) importado(s) com sucesso!`);
  }

  function exportErrors() {
    if (!state.errors.length) return;
    if (!window.XLSX) return alert('Biblioteca Excel não carregada.');
    const rows = state.errors.map(err => ({ Linha: err.line, Campo: err.field, Erro: err.message }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 55 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Erros');
    XLSX.writeFile(wb, `erros_importacao_clientes_${Date.now()}.xlsx`);
  }

  function exportRows(useFiltered) {
    const sourceRows = useFiltered ? filterRows(getRows()) : getRows();
    if (!sourceRows.length) return alert('Nenhum cliente importado encontrado para exportar.');
    if (!window.XLSX) return alert('Biblioteca Excel não carregada.');
    const loggedUser = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
    const meta = [
      ['RELATÓRIO: CLIENTES IMPORTADOR DO SISTEMA'],
      ['Data da Exportação:', new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')],
      ['Usuário Responsável:', loggedUser ? `${loggedUser.name || ''} (${loggedUser.username || loggedUser.id || ''})` : 'Sistema'],
      ['Origem:', useFiltered ? 'Dados filtrados da guia Clientes Importador do Sistema' : 'Todos os dados da guia Clientes Importador do Sistema'],
      []
    ];
    const rows = sourceRows.map(row => {
      const mapped = {};
      FIELDS.forEach(field => { mapped[field.label] = row[field.key] || ''; });
      return mapped;
    });
    const ws = XLSX.utils.aoa_to_sheet(meta);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 'A6' });
    ws['!cols'] = FIELDS.map(field => ({ wch: Math.max(16, Math.min(35, field.label.length + 8)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes Importador');
    XLSX.writeFile(wb, `clientes_importador_sistema_${Date.now()}.xlsx`);
  }

  function init() {
    if (ensureUi() && state.showImporter) setImporterVisible(true);
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('hashchange', () => setTimeout(init, 250));
  window.addEventListener('load', () => setTimeout(init, 500));

  const observer = new MutationObserver(() => {
    if (window.location.hash === '#clientes' || document.getElementById('view-clientes')) {
      init();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.ClientesImportadorSistema = {
    init,
    renderTable,
    getRows,
    saveRows
  };
})();
