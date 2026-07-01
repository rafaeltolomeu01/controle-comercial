/*
 * Clientes Importador do Sistema
 * Adiciona uma guia isolada na tela Gestão de Clientes, sem alterar funções existentes.
 * Os dados importados ficam separados e agora são salvos também no banco via app_kv_store.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'controle_comercial_clientes_importador_sistema_v1';
  const STORE_KEY = 'clientes_importador_sistema';

  const VISIBLE_FIELDS = [
    { key: 'codigo', label: 'Código', required: true, aliases: ['codigo', 'código', 'cod', 'cód', 'codigo cliente', 'codigo do cliente', 'cód cliente', 'cod cliente'] },
    { key: 'fantasia', label: 'Fantasia', required: true, aliases: ['fantasia', 'nome fantasia', 'cliente', 'nome cliente', 'razao fantasia'] },
    { key: 'cnpj', label: 'CNPJ', required: false, aliases: ['cnpj', 'cpf/cnpj', 'cnpj/cpf', 'documento'] },
    { key: 'atividade', label: 'Atividade', required: false, aliases: ['atividade', 'categoria', 'ramo', 'ramo atividade', 'atividade principal'] },
    { key: 'fone', label: 'Fone', required: false, aliases: ['fone', 'telefone', 'tel', 'celular', 'whatsapp', 'contato'] },
    { key: 'email', label: 'Email', required: false, aliases: ['email', 'e-mail', 'mail', 'correio eletrônico'] },
    { key: 'empresaResponsavel', label: 'Empresa Responsável', required: false, aliases: ['empresa responsavel', 'empresa responsável', 'empresa', 'distribuidora', 'empresa base'] },
    { key: 'cidade', label: 'Cidade', required: false, aliases: ['cidade', 'municipio', 'município'] },
    { key: 'vendedor', label: 'Vendedor', required: false, aliases: ['vendedor', 'representante', 'consultor', 'responsavel comercial', 'responsável comercial'] },
    { key: 'supervisor', label: 'Supervisor', required: false, aliases: ['supervisor', 'gerente', 'coordenador'] }
  ];

  // Campos que são importados e salvos no banco, mas ficam ocultos na tabela principal.
  // Eles serão usados futuramente sem poluir a tela atual.
  const HIDDEN_FIELDS = [
    { key: 'cpf', label: 'CPF', required: false, hidden: true, aliases: ['cpf', 'cpf/cnpj', 'cnpj/cpf', 'documento', 'cadastro pessoa fisica', 'cadastro pessoa física'] },
    { key: 'logradouro', label: 'Logradouro', required: false, hidden: true, aliases: ['logradouro', 'tipo logradouro', 'tipo de logradouro'] },
    { key: 'endereco', label: 'Endereço', required: false, hidden: true, aliases: ['endereco', 'endereço', 'rua', 'avenida', 'av', 'logradouro endereco', 'logradouro endereço'] },
    { key: 'numero', label: 'Número', required: false, hidden: true, aliases: ['numero', 'número', 'num', 'nº', 'nro'] },
    { key: 'complemento', label: 'Complemento', required: false, hidden: true, aliases: ['complemento', 'compl'] },
    { key: 'cep', label: 'CEP', required: false, hidden: true, aliases: ['cep', 'c.e.p', 'c.e.p.', 'c e p'] },
    { key: 'bairro', label: 'Bairro', required: false, hidden: true, aliases: ['bairro'] },
    { key: 'enderecoCompleto', label: 'Endereço Completo', required: false, hidden: true, calculated: true, aliases: ['endereco completo', 'endereço completo', 'endereco completo cliente', 'endereço completo cliente'] }
  ];

  const IMPORT_FIELDS = [...VISIBLE_FIELDS, ...HIDDEN_FIELDS];
  const FIELDS = VISIBLE_FIELDS;

  const state = {
    initializedForPanel: null,
    showImporter: false,
    importHeaders: [],
    importRows: [],
    mapping: {},
    mappedRows: [],
    validRows: [],
    errors: [],
    currentPage: 1,
    pageSize: 20,
    currentDisplayRows: []
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

  function readLegacyRows() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Falha ao ler backup local de clientes importados:', err);
      return [];
    }
  }

  function getRows() {
    try {
      if (window.Store && typeof Store.getList === 'function') {
        const rows = Store.getList(STORE_KEY, []);
        if (Array.isArray(rows) && rows.length) return rows;

        // Migração automática da primeira versão, que salvava somente no navegador.
        const legacy = readLegacyRows();
        if (legacy.length && typeof Store.saveList === 'function') {
          Store.saveList(STORE_KEY, legacy);
          return legacy;
        }
        return Array.isArray(rows) ? rows : [];
      }
      return readLegacyRows();
    } catch (err) {
      console.warn('Falha ao ler clientes importados:', err);
      return readLegacyRows();
    }
  }

  async function saveRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    // Backup local para não perder a importação caso a internet caia no meio.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeRows));

    // Salva no armazenamento central do sistema e no banco PostgreSQL.
    if (window.Store && typeof Store.saveList === 'function') {
      Store.saveList(STORE_KEY, safeRows);
    }

    // Garante a gravação no banco antes de fechar o modal e avisar sucesso.
    if (window.Store && typeof Store.backendRequest === 'function' && Store.getToken && Store.getToken()) {
      await Store.backendRequest(`/api/store/${encodeURIComponent(STORE_KEY)}`, {
        method: 'POST',
        body: JSON.stringify({ data: safeRows })
      });
    }
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
      #clientes-importador-table-body tr { cursor:pointer; transition:background .16s ease, transform .16s ease; }
      #clientes-importador-table-body tr:hover { background:rgba(59,130,246,.10); }
      .clientes-importador-pagination { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:12px 0 2px; color:var(--text-muted); font-size:.78rem; }
      .clientes-importador-pagination-info { line-height:1.35; }
      .clientes-importador-pagination-controls { display:flex; align-items:center; justify-content:flex-end; gap:6px; flex-wrap:wrap; }
      .clientes-importador-page-btn { min-width:32px; height:32px; padding:0 10px; border-radius:7px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-main); cursor:pointer; font-size:.78rem; }
      .clientes-importador-page-btn:hover:not(:disabled) { border-color:var(--primary-color); color:#fff; }
      .clientes-importador-page-btn.active { background:var(--primary-color); border-color:var(--primary-color); color:#fff; }
      .clientes-importador-page-btn:disabled { opacity:.45; cursor:not-allowed; }
      .clientes-importador-row-hint { color:var(--primary-color); font-weight:600; }
      html.clientes-importador-modal-active, body.clientes-importador-modal-active { overflow:hidden !important; }
      .clientes-importador-modal-overlay { display:none; position:fixed; inset:0; z-index:2600; background:rgba(0,0,0,.68); align-items:center; justify-content:center; padding:18px 10px; }
      .clientes-importador-modal-overlay.open { display:flex; }
      .clientes-importador-modal { width:min(1120px, 96vw); max-height:92vh; overflow:auto; background:var(--bg-card); border:1px solid var(--border-color); border-radius:14px; box-shadow:0 16px 44px rgba(0,0,0,.45); padding:18px; color:var(--text-main); }
      #modal-clientes-importador-detail.clientes-importador-modal-overlay { align-items:flex-start; justify-content:center; padding:12px 10px; overflow-y:auto; overscroll-behavior:contain; }
      #modal-clientes-importador-detail .clientes-importador-detail-modal { margin:0 auto 18px; }
      .clientes-importador-modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:14px; }
      .clientes-importador-modal-title { margin:0; font-family:var(--font-title); font-size:1.05rem; color:var(--text-main); }
      .clientes-importador-modal-subtitle { margin:4px 0 0; color:var(--text-muted); font-size:.78rem; line-height:1.35; }
      .clientes-importador-close { background:transparent; border:0; color:var(--text-muted); font-size:1.4rem; cursor:pointer; line-height:1; padding:4px 8px; }
      .clientes-importador-step { border:1px solid var(--border-color); background:rgba(255,255,255,.02); border-radius:10px; padding:14px; margin-bottom:12px; }
      .clientes-importador-step h4 { margin:0 0 10px; color:var(--primary-color); font-family:var(--font-title); font-size:.9rem; }
      .clientes-importador-map-grid { display:grid; grid-template-columns: minmax(160px, 240px) 1fr; gap:10px; align-items:center; }
      .clientes-importador-required { color:var(--danger); font-weight:700; }
      .clientes-importador-preview-table { width:100%; min-width:1500px; font-size:.78rem; }
      .clientes-importador-preview-table th,
      .clientes-importador-preview-table td { white-space:nowrap; }
      .clientes-importador-errors { display:none; border:1px solid rgba(239,68,68,.45); background:rgba(239,68,68,.08); border-radius:8px; padding:10px; color:#fecaca; font-size:.78rem; max-height:180px; overflow:auto; }
      .clientes-importador-errors.open { display:block; }
      .clientes-importador-modal-footer { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; border-top:1px solid var(--border-color); padding-top:14px; margin-top:14px; }
      .clientes-importador-detail-modal { width:min(980px, 96vw); max-height:calc(100dvh - 24px); overflow:auto; background:var(--bg-card); border:1px solid var(--border-color); border-radius:14px; box-shadow:0 16px 44px rgba(0,0,0,.45); padding:18px; color:var(--text-main); }
      .clientes-importador-detail-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:14px; }
      .clientes-importador-detail-title { margin:0; font-family:var(--font-title); font-size:1.08rem; color:var(--text-main); }
      .clientes-importador-detail-subtitle { margin:4px 0 0; color:var(--text-muted); font-size:.8rem; line-height:1.35; }
      .clientes-importador-detail-section { border:1px solid var(--border-color); border-radius:10px; background:rgba(255,255,255,.02); padding:12px; margin-bottom:12px; }
      .clientes-importador-detail-section h4 { margin:0 0 10px; color:var(--primary-color); font-family:var(--font-title); font-size:.88rem; }
      .clientes-importador-detail-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
      .clientes-importador-detail-item { border:1px solid rgba(148,163,184,.18); border-radius:8px; padding:9px 10px; background:rgba(15,23,42,.35); min-width:0; }
      .clientes-importador-detail-label { display:block; margin-bottom:4px; font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.02em; color:var(--text-muted); }
      .clientes-importador-detail-value { display:block; font-size:.86rem; color:var(--text-main); word-break:break-word; line-height:1.32; }
      .clientes-importador-detail-value.empty { color:var(--text-muted); }
      .clientes-importador-detail-wide { grid-column:1 / -1; }
      @media (max-width: 768px) {
        #view-clientes .view-tabs { overflow-x:auto; display:flex; flex-wrap:nowrap; padding-bottom:8px; }
        .clientes-importador-filter-group,
        .clientes-importador-filter-group.search { min-width:100%; }
        .clientes-importador-map-grid { grid-template-columns:1fr; }
        .clientes-importador-modal { padding:14px; }
        #modal-clientes-importador-detail.clientes-importador-modal-overlay { align-items:flex-start; padding:8px; }
        #modal-clientes-importador-detail .clientes-importador-detail-modal { width:100%; max-height:calc(100dvh - 16px); margin:0; }
        .clientes-importador-pagination { align-items:flex-start; }
        .clientes-importador-pagination-controls { width:100%; justify-content:flex-start; overflow-x:auto; padding-bottom:4px; }
        .clientes-importador-detail-modal { padding:14px; }
        .clientes-importador-detail-grid { grid-template-columns:1fr; }
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
                <input type="text" id="clientes-importador-search" placeholder="Pesquisar por código, fantasia, CNPJ, CPF, endereço, cidade, vendedor...">
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
          <div id="clientes-importador-pagination" class="clientes-importador-pagination"></div>
        </div>

        <div id="modal-clientes-importador" class="clientes-importador-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="clientes-importador-modal-title">
          <div class="clientes-importador-modal">
            <div class="clientes-importador-modal-header">
              <div>
                <h3 id="clientes-importador-modal-title" class="clientes-importador-modal-title">Importar Clientes do Sistema</h3>
                <p class="clientes-importador-modal-subtitle">Envie uma planilha Excel ou CSV, confira o mapeamento das colunas e revise a prévia antes de confirmar. CNPJ pode ficar vazio quando houver CPF.</p>
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
                  <thead><tr>${IMPORT_FIELDS.map(field => `<th>${escapeHtml(field.label)}${field.hidden ? ' (oculto)' : ''}</th>`).join('')}</tr></thead>
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

        <div id="modal-clientes-importador-detail" class="clientes-importador-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="clientes-importador-detail-title">
          <div class="clientes-importador-detail-modal">
            <div class="clientes-importador-detail-head">
              <div>
                <h3 id="clientes-importador-detail-title" class="clientes-importador-detail-title">Informações do Cliente</h3>
                <p id="clientes-importador-detail-subtitle" class="clientes-importador-detail-subtitle">Clique em uma linha para visualizar os dados completos importados.</p>
              </div>
              <button type="button" class="clientes-importador-close" id="btn-clientes-importador-detail-close" aria-label="Fechar">×</button>
            </div>
            <div id="clientes-importador-detail-body"></div>
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

    let createdOrRebuilt = false;

    let importerTab = panel.querySelector('#tab-client-importador-sistema');
    if (!importerTab) {
      importerTab = document.createElement('button');
      importerTab.type = 'button';
      importerTab.className = 'view-tab-btn';
      importerTab.id = 'tab-client-importador-sistema';
      importerTab.textContent = 'Clientes Importador do Sistema';
      tabs.appendChild(importerTab);
      createdOrRebuilt = true;
    }

    let importerContent = panel.querySelector('#clientes-importador-sistema-content');
    if (!importerContent) {
      tabs.insertAdjacentHTML('afterend', buildContentHtml());
      importerContent = panel.querySelector('#clientes-importador-sistema-content');
      createdOrRebuilt = true;
    }

    // Quando o sistema recarrega o HTML da tela, o dataset do painel pode ficar antigo.
    // Se a aba/conteúdo precisou ser recriado, forçamos o rebinding dos eventos só dessa guia.
    if (createdOrRebuilt) {
      delete panel.dataset.clientesImportadorBound;
      delete panel.dataset.clientesImportadorInitialRendered;
    }

    bindEvents(panel);

    // Renderiza apenas uma vez por montagem da tela para não gerar loop de MutationObserver.
    if (createdOrRebuilt || panel.dataset.clientesImportadorInitialRendered !== '1') {
      refreshFilterOptions();
      renderTable();
      panel.dataset.clientesImportadorInitialRendered = '1';
    }

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

    const filterKeyById = {
      'clientes-importador-empresa': 'empresaResponsavel',
      'clientes-importador-cidade': 'cidade',
      'clientes-importador-vendedor': 'vendedor',
      'clientes-importador-supervisor': 'supervisor'
    };

    ['clientes-importador-search', 'clientes-importador-empresa', 'clientes-importador-cidade', 'clientes-importador-vendedor', 'clientes-importador-supervisor'].forEach(id => {
      const el = panel.querySelector('#' + id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        state.currentPage = 1;
        refreshFilterOptions(filterKeyById[id] || null);
        renderTable();
      });
    });

    panel.querySelector('#clientes-importador-table-body')?.addEventListener('click', event => {
      const rowEl = event.target.closest('tr[data-detail-index]');
      if (!rowEl) return;
      const index = Number(rowEl.dataset.detailIndex);
      const row = state.currentDisplayRows[index];
      if (row) openClientDetail(row);
    });

    panel.querySelector('#clientes-importador-pagination')?.addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      const page = Number(button.dataset.page);
      if (!Number.isFinite(page) || page < 1) return;
      state.currentPage = page;
      renderTable();
    });

    panel.querySelector('#btn-clientes-importador-detail-close')?.addEventListener('click', closeClientDetail);
    // O card de detalhes fica estático na tela e fecha somente pelo botão X,
    // para não fechar sem querer ao tocar fora no celular.

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
    state.currentPage = 1;
    refreshFilterOptions();
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

  function rowMatchesFilters(row, filters, ignoreKey) {
    if (filters.search) {
      const haystack = normalize(IMPORT_FIELDS.map(field => row[field.key]).join(' '));
      if (!haystack.includes(filters.search)) return false;
    }

    for (const key of ['empresaResponsavel', 'cidade', 'vendedor', 'supervisor']) {
      if (key === ignoreKey) continue;
      if (filters[key] && String(row[key] || '') !== filters[key]) return false;
    }

    return true;
  }

  function filterRows(rows) {
    const filters = getFilterValues();
    return rows.filter(row => rowMatchesFilters(row, filters));
  }

  function refreshFilterOptions(preserveKey = null) {
    const panel = findClientesPanel();
    if (!panel) return;

    const rows = getRows();
    const configs = [
      ['clientes-importador-empresa', 'empresaResponsavel'],
      ['clientes-importador-cidade', 'cidade'],
      ['clientes-importador-vendedor', 'vendedor'],
      ['clientes-importador-supervisor', 'supervisor']
    ];

    // Filtros encadeados: cada lista mostra apenas opções compatíveis
    // com os demais filtros já selecionados. Ex.: ao escolher a empresa,
    // o campo Vendedor exibe somente vendedores que possuem clientes nela.
    const selects = configs
      .map(([id, key]) => ({ id, key, el: panel.querySelector('#' + id) }))
      .filter(item => item.el);

    const filters = getFilterValues();

    const getValuesForKey = key => Array.from(new Set(
      rows
        .filter(row => rowMatchesFilters(row, filters, key))
        .map(row => String(row[key] || '').trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Primeiro limpa seleções que não existem mais dentro do filtro atual.
    // O filtro que acabou de ser alterado é preservado para não voltar para "Todos"
    // quando outro filtro antigo ficar incompatível com a nova escolha.
    selects.forEach(({ key, el }) => {
      const current = el.value;
      filters[key] = current;
      if (!current) return;

      const values = getValuesForKey(key);
      if (!values.includes(current) && key !== preserveKey) {
        el.value = '';
        filters[key] = '';
      }
    });

    // Depois remonta as opções já considerando as seleções incompatíveis limpas.
    selects.forEach(({ key, el }) => {
      const current = el.value;
      let values = getValuesForKey(key);

      if (current && !values.includes(current) && key === preserveKey) {
        values = [...values, current].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      }

      el.innerHTML = '<option value="">Todos</option>' + values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('');

      if (current && values.includes(current)) {
        el.value = current;
        filters[key] = current;
      } else {
        el.value = '';
        filters[key] = '';
      }
    });
  }

  function getDisplayValue(row, field) {
    if (!row || !field) return '';
    return row[field.key] || '';
  }

  function renderTable() {
    const tbody = document.getElementById('clientes-importador-table-body');
    if (!tbody) return;

    const rows = filterRows(getRows());
    const total = rows.length;
    const pageSize = state.pageSize || 20;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const startIndex = total ? (state.currentPage - 1) * pageSize : 0;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageRows = rows.slice(startIndex, endIndex);
    state.currentDisplayRows = pageRows;

    if (!total) {
      tbody.innerHTML = `<tr><td colspan="${FIELDS.length}" style="text-align:center;color:var(--text-muted);padding:18px;cursor:default;">Nenhum cliente importado encontrado.</td></tr>`;
      renderPagination(0, 0, 0, 0, 0);
      return;
    }

    tbody.innerHTML = pageRows.map((row, index) => `
      <tr data-detail-index="${index}" title="Clique para abrir as informações completas do cliente">
        ${FIELDS.map(field => `<td data-label="${escapeAttr(field.label)}">${escapeHtml(getDisplayValue(row, field) || '-')}</td>`).join('')}
      </tr>
    `).join('');

    renderPagination(total, state.currentPage, totalPages, startIndex + 1, endIndex);
  }

  function renderPagination(total, currentPage, totalPages, start, end) {
    const pagination = document.getElementById('clientes-importador-pagination');
    if (!pagination) return;

    if (!total) {
      pagination.innerHTML = `<div class="clientes-importador-pagination-info">Nenhum cliente para mostrar.</div>`;
      return;
    }

    const pages = getVisiblePages(currentPage, totalPages);
    const pageButtons = pages.map(page => page === '...'
      ? `<span style="padding:0 4px;color:var(--text-muted);">...</span>`
      : `<button type="button" class="clientes-importador-page-btn ${page === currentPage ? 'active' : ''}" data-page="${page}" ${page === currentPage ? 'disabled' : ''}>${page}</button>`
    ).join('');

    pagination.innerHTML = `
      <div class="clientes-importador-pagination-info">
        Mostrando <strong>${start}</strong> a <strong>${end}</strong> de <strong>${total}</strong> cliente(s).<br>
        <span class="clientes-importador-row-hint">Clique em uma linha para ver as informações completas.</span>
      </div>
      <div class="clientes-importador-pagination-controls" aria-label="Paginação dos clientes importados">
        <button type="button" class="clientes-importador-page-btn" data-page="1" ${currentPage <= 1 ? 'disabled' : ''}>Primeira</button>
        <button type="button" class="clientes-importador-page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        ${pageButtons}
        <button type="button" class="clientes-importador-page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>Próxima</button>
        <button type="button" class="clientes-importador-page-btn" data-page="${totalPages}" ${currentPage >= totalPages ? 'disabled' : ''}>Última</button>
      </div>
    `;
  }

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push('...');
    for (let page = start; page <= end; page++) pages.push(page);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function detailItem(label, value, wide = false) {
    const empty = isEmptyValue(value);
    return `
      <div class="clientes-importador-detail-item ${wide ? 'clientes-importador-detail-wide' : ''}">
        <span class="clientes-importador-detail-label">${escapeHtml(label)}</span>
        <span class="clientes-importador-detail-value ${empty ? 'empty' : ''}">${escapeHtml(empty ? 'Não informado' : value)}</span>
      </div>
    `;
  }

  function openClientDetail(row) {
    const panel = findClientesPanel();
    if (!panel || !row) return;

    const modal = panel.querySelector('#modal-clientes-importador-detail');
    const title = panel.querySelector('#clientes-importador-detail-title');
    const subtitle = panel.querySelector('#clientes-importador-detail-subtitle');
    const body = panel.querySelector('#clientes-importador-detail-body');
    if (!modal || !title || !subtitle || !body) return;

    const fantasia = getDisplayValue(row, { key: 'fantasia' }) || 'Cliente importado';
    const codigo = getDisplayValue(row, { key: 'codigo' }) || '-';
    const documentoPrincipal = getDisplayValue(row, { key: 'cnpj' }) || getDisplayValue(row, { key: 'cpf' }) || 'Documento não informado';

    title.textContent = fantasia;
    subtitle.textContent = `Código ${codigo} • ${documentoPrincipal}`;

    body.innerHTML = `
      <div class="clientes-importador-detail-section">
        <h4>Dados principais</h4>
        <div class="clientes-importador-detail-grid">
          ${detailItem('Código', row.codigo)}
          ${detailItem('Fantasia', row.fantasia)}
          ${detailItem('CNPJ', row.cnpj)}
          ${detailItem('CPF', row.cpf)}
          ${detailItem('Atividade', row.atividade)}
          ${detailItem('Empresa Responsável', row.empresaResponsavel)}
        </div>
      </div>
      <div class="clientes-importador-detail-section">
        <h4>Contato e responsáveis</h4>
        <div class="clientes-importador-detail-grid">
          ${detailItem('Fone', row.fone)}
          ${detailItem('Email', row.email)}
          ${detailItem('Vendedor', row.vendedor)}
          ${detailItem('Supervisor', row.supervisor)}
        </div>
      </div>
      <div class="clientes-importador-detail-section">
        <h4>Endereço completo</h4>
        <div class="clientes-importador-detail-grid">
          ${detailItem('Endereço Completo', row.enderecoCompleto || buildEnderecoCompleto(row), true)}
          ${detailItem('Logradouro', row.logradouro)}
          ${detailItem('Endereço', row.endereco)}
          ${detailItem('Número', row.numero)}
          ${detailItem('Complemento', row.complemento)}
          ${detailItem('CEP', row.cep)}
          ${detailItem('Bairro', row.bairro)}
          ${detailItem('Cidade', row.cidade)}
        </div>
      </div>
      <div class="clientes-importador-detail-section">
        <h4>Controle interno</h4>
        <div class="clientes-importador-detail-grid">
          ${detailItem('Importado em', formatDateTime(row.importedAt))}
          ${detailItem('Origem', 'Clientes Importador do Sistema')}
        </div>
      </div>
    `;

    modal.classList.add('open');
    modal.scrollTop = 0;
    const detailModal = modal.querySelector('.clientes-importador-detail-modal');
    if (detailModal) detailModal.scrollTop = 0;
    document.documentElement.classList.add('clientes-importador-modal-active');
    document.body.classList.add('clientes-importador-modal-active');
  }

  function closeClientDetail() {
    const modal = document.getElementById('modal-clientes-importador-detail');
    modal?.classList.remove('open');
    document.documentElement.classList.remove('clientes-importador-modal-active');
    document.body.classList.remove('clientes-importador-modal-active');
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
    state.validRows = [];
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
    IMPORT_FIELDS.forEach(field => {
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
    mapGrid.innerHTML = IMPORT_FIELDS.map(field => `
      <label for="map-${field.key}" style="font-size:.8rem;color:var(--text-main);font-weight:600;">
        ${escapeHtml(field.label)} ${field.required ? '<span class="clientes-importador-required">*</span>' : ''} ${field.hidden ? '<span style="color:var(--text-muted);font-weight:500;">(oculto)</span>' : ''}
      </label>
      <select id="map-${field.key}" class="clientes-importador-map-select" data-field="${field.key}">
        ${options}
      </select>
    `).join('');
    IMPORT_FIELDS.forEach(field => {
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
      IMPORT_FIELDS.forEach(field => {
        const header = state.mapping[field.key];
        row[field.key] = header ? String(source.__values[header] || '').trim() : '';
      });

      row.enderecoCompleto = buildEnderecoCompleto(row);

      if (IMPORT_FIELDS.some(field => String(row[field.key] || '').trim())) mapped.push(row);
    });
    return mapped;
  }

  function buildEnderecoCompleto(row) {
    const direto = String(row.enderecoCompleto || '').trim();
    const enderecoBase = [row.logradouro, row.endereco]
      .map(value => String(value || '').trim())
      .filter(value => value && value !== '-')
      .join(' ');

    const partes = [];
    if (enderecoBase) partes.push(enderecoBase);
    if (!isEmptyValue(row.numero)) partes.push(String(row.numero).trim());
    if (!isEmptyValue(row.complemento)) partes.push(String(row.complemento).trim());
    if (!isEmptyValue(row.bairro)) partes.push(String(row.bairro).trim());
    if (!isEmptyValue(row.cidade)) partes.push(String(row.cidade).trim());
    if (!isEmptyValue(row.cep)) partes.push('CEP ' + String(row.cep).trim());

    const montado = partes.join(', ');
    return montado || direto;
  }

  function isValidEmail(email) {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function isEmptyValue(value) {
    const text = String(value ?? '').trim();
    return text === '' || text === '-' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined';
  }

  function validateMappedRows(rows) {
    const errors = [];
    const validRows = [];
    const existing = getRows();
    const existingCodes = new Set(existing.map(row => normalize(row.codigo)).filter(Boolean));
    const existingCnpjs = new Set(existing.map(row => onlyDigits(row.cnpj)).filter(Boolean));
    const existingCpfs = new Set(existing.map(row => onlyDigits(row.cpf)).filter(Boolean));
    const seenCodes = new Set();
    const seenCnpjs = new Set();
    const seenCpfs = new Set();
    let hasMappingError = false;

    IMPORT_FIELDS.filter(field => field.required).forEach(field => {
      if (!state.mapping[field.key]) {
        hasMappingError = true;
        errors.push({ line: 'Mapeamento', field: field.label, message: `O campo obrigatório "${field.label}" não foi mapeado.` });
      }
    });

    if (!state.mapping.cnpj && !state.mapping.cpf) {
      hasMappingError = true;
      errors.push({ line: 'Mapeamento', field: 'CNPJ/CPF', message: 'Mapeie CNPJ ou CPF. Cliente sem CNPJ será aceito quando tiver CPF.' });
    }

    rows.forEach(row => {
      const rowErrors = [];
      const codeNorm = normalize(row.codigo);
      const cnpjDigits = onlyDigits(row.cnpj);
      const cpfDigits = onlyDigits(row.cpf);

      if (isEmptyValue(row.codigo)) rowErrors.push({ line: row.__line, field: 'Código', message: 'Código vazio.' });
      if (isEmptyValue(row.fantasia)) rowErrors.push({ line: row.__line, field: 'Fantasia', message: 'Fantasia vazia.' });
      if (!cnpjDigits && !cpfDigits) rowErrors.push({ line: row.__line, field: 'CNPJ/CPF', message: 'Informe CNPJ ou CPF. Cliente sem CNPJ é aceito quando tiver CPF.' });
      if (!isEmptyValue(row.email) && !isValidEmail(row.email)) rowErrors.push({ line: row.__line, field: 'Email', message: 'Email inválido.' });

      if (codeNorm) {
        if (existingCodes.has(codeNorm)) rowErrors.push({ line: row.__line, field: 'Código', message: 'Código já importado anteriormente.' });
        if (seenCodes.has(codeNorm)) rowErrors.push({ line: row.__line, field: 'Código', message: 'Código duplicado dentro da planilha.' });
        seenCodes.add(codeNorm);
      }

      if (cnpjDigits) {
        if (existingCnpjs.has(cnpjDigits)) rowErrors.push({ line: row.__line, field: 'CNPJ', message: 'CNPJ já importado anteriormente.' });
        if (seenCnpjs.has(cnpjDigits)) rowErrors.push({ line: row.__line, field: 'CNPJ', message: 'CNPJ duplicado dentro da planilha.' });
        seenCnpjs.add(cnpjDigits);
      }

      if (cpfDigits) {
        if (existingCpfs.has(cpfDigits)) rowErrors.push({ line: row.__line, field: 'CPF', message: 'CPF já importado anteriormente.' });
        if (seenCpfs.has(cpfDigits)) rowErrors.push({ line: row.__line, field: 'CPF', message: 'CPF duplicado dentro da planilha.' });
        seenCpfs.add(cpfDigits);
      }

      errors.push(...rowErrors);
      if (!hasMappingError && rowErrors.length === 0) {
        validRows.push(row);
      }
    });

    if (!rows.length) {
      errors.push({ line: 'Arquivo', field: 'Dados', message: 'Nenhuma linha encontrada para importar.' });
    }

    return { errors, validRows };
  }

  function updatePreviewAndValidation() {
    state.mappedRows = mapRows();
    const result = validateMappedRows(state.mappedRows);
    state.errors = result.errors;
    state.validRows = result.validRows;
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
      <tr>${IMPORT_FIELDS.map(field => `<td>${escapeHtml(getDisplayValue(row, field) || '-')}</td>`).join('')}</tr>
    `).join('') || `<tr><td colspan="${IMPORT_FIELDS.length}" style="text-align:center;color:var(--text-muted);">Nenhuma linha para prévia.</td></tr>`;
  }

  function renderErrors() {
    const panel = findClientesPanel();
    if (!panel) return;
    const errorsBox = panel.querySelector('#clientes-importador-errors');
    const confirmBtn = panel.querySelector('#btn-clientes-importador-confirm');
    const errorsBtn = panel.querySelector('#btn-clientes-importador-errors-xlsx');
    if (!errorsBox || !confirmBtn || !errorsBtn) return;

    if (state.errors.length) {
      const hasValid = state.validRows.length > 0;
      errorsBox.classList.add('open');
      errorsBox.innerHTML = `<strong>${hasValid ? 'Atenção: as linhas abaixo serão ignoradas, mas as válidas podem ser importadas.' : 'Corrija antes de importar:'}</strong><ul style="margin:8px 0 0 18px;padding:0;">${state.errors.map(err => `<li>Linha ${escapeHtml(err.line)} — ${escapeHtml(err.field)}: ${escapeHtml(err.message)}</li>`).join('')}</ul>`;
      confirmBtn.disabled = !hasValid;
      confirmBtn.textContent = hasValid ? `Confirmar Importação (${state.validRows.length} válidos)` : 'Confirmar Importação';
      errorsBtn.style.display = 'inline-flex';
    } else {
      errorsBox.classList.remove('open');
      errorsBox.innerHTML = '';
      confirmBtn.disabled = state.mappedRows.length === 0;
      confirmBtn.textContent = state.mappedRows.length ? `Confirmar Importação (${state.mappedRows.length})` : 'Confirmar Importação';
      errorsBtn.style.display = 'none';
    }
  }

  async function confirmImport() {
    updatePreviewAndValidation();
    const rowsForImport = state.validRows.length ? state.validRows : (state.errors.length ? [] : state.mappedRows);
    if (!rowsForImport.length) {
      showToast('Nenhuma linha válida para importar. Corrija a planilha ou o mapeamento.');
      return;
    }

    const panel = findClientesPanel();
    const confirmBtn = panel?.querySelector('#btn-clientes-importador-confirm');
    const oldText = confirmBtn ? confirmBtn.textContent : '';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Salvando no banco...';
    }

    try {
      const now = new Date().toISOString();
      const rowsToSave = rowsForImport.map(row => {
        const clean = { importedAt: now };
        IMPORT_FIELDS.forEach(field => { clean[field.key] = String(row[field.key] || '').trim(); });
        clean.enderecoCompleto = buildEnderecoCompleto(clean);
        return clean;
      });
      const allRows = getRows().concat(rowsToSave);
      await saveRows(allRows);
      closeImportModal();
      refreshFilterOptions();
      state.currentPage = 1;
      renderTable();
      const ignored = state.errors.length ? ` ${state.errors.length} erro(s) foram ignorados.` : '';
      showToast(`${rowsToSave.length} cliente(s) salvo(s) no banco com sucesso!${ignored}`);
    } catch (err) {
      console.error('Falha ao salvar clientes importados no banco:', err);
      alert('Não foi possível salvar no banco de dados. Verifique sua conexão/login e tente novamente. Erro: ' + (err.message || err));
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = oldText || 'Confirmar Importação';
      }
    }
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
      FIELDS.forEach(field => { mapped[field.label] = getDisplayValue(row, field) || ''; });
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

  let initTimer = null;
  function scheduleInit(delay = 150) {
    if (initTimer) return;
    initTimer = setTimeout(() => {
      initTimer = null;
      init();
    }, delay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleInit(0));
  } else {
    scheduleInit(0);
  }

  window.addEventListener('hashchange', () => scheduleInit(250));
  window.addEventListener('load', () => scheduleInit(500));

  // Observa somente a montagem/recarregamento da tela de clientes.
  // Não chama init a cada alteração da tabela, evitando tela travada/congelada.
  const observer = new MutationObserver(() => {
    const panel = findClientesPanel();
    if (!panel || !panel.innerHTML.trim()) return;
    const precisaMontar = !panel.querySelector('#clientes-importador-sistema-content') || !panel.querySelector('#tab-client-importador-sistema');
    if (precisaMontar) scheduleInit(150);
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  window.ClientesImportadorSistema = {
    init,
    renderTable,
    getRows,
    saveRows
  };
})();
