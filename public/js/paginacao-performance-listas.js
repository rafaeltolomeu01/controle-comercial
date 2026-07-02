/* Otimização de listas pesadas: paginação local e despesas sem carregar miniaturas. */
(function(){
  'use strict';
  if (window.__ccPaginacaoPerformance0207) return;
  window.__ccPaginacaoPerformance0207 = true;

  const PAGE_SIZE = 5;
  const TARGETS = {
    despesas: { renderMethod: 'renderExpenses', tbodyId: 'expenses-table-body', storeMethod: 'getExpenses', label: 'despesas' },
    movimentacao: { renderMethod: 'renderMovements', tbodyId: 'movements-table-body', storeMethod: 'getMovements', label: 'movimentações' },
    chamados: { renderMethod: 'renderTickets', tbodyId: 'tickets-table-body', storeMethod: 'getTickets', label: 'chamados' }
  };
  const state = {
    despesas: { page: 1, signature: '', raw: [] },
    movimentacao: { page: 1, signature: '', raw: [] },
    chamados: { page: 1, signature: '', raw: [] }
  };
  const baseRender = {};

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normalize(value){
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function getUser(){
    try { return window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null; } catch(_) { return null; }
  }
  function getActiveUnitId(){
    try { return window.Store && Store.getActiveUnitId ? Store.getActiveUnitId() : 'all'; } catch(_) { return 'all'; }
  }
  function unitName(id){
    if (!id) return '-';
    try { return window.UI && UI.getUnitName ? UI.getUnitName(id) : id; } catch(_) { return id; }
  }
  function expenseUser(exp){
    try { if (window.UI && UI.getExpenseUserName) return UI.getExpenseUserName(exp); } catch(_) {}
    const userId = exp && (exp.userId || exp.user_id || exp.usuario_id);
    try { if (window.UI && UI.getUserName && userId) return UI.getUserName(userId); } catch(_) {}
    return (exp && (exp.vendedor || exp.vendedor_nome || exp.userName || exp.usuario_nome)) || '-';
  }
  function money(value){
    if (value === undefined || value === null || value === '') return '-';
    const n = Number(String(value).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return esc(value);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
  function dateTimeExpense(exp){
    const rawDate = exp && exp.date;
    let formattedDate = rawDate || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawDate || ''))) {
      const parts = String(rawDate).split('-');
      formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else if (exp && (exp.created_at || exp.createdAt) && !formattedDate) {
      try { formattedDate = new Date(exp.created_at || exp.createdAt).toLocaleDateString('pt-BR'); } catch(_) {}
    }
    return `${formattedDate || '-'}${exp && exp.time ? ' / ' + exp.time : ''}`;
  }
  function pending(status){
    return ['pendente','aguardando','aguardando aprovacao','aguardando aprovação'].includes(normalize(status));
  }
  function statusClass(status){
    const s = normalize(status);
    if (s.includes('aprov')) return 'badge-success';
    if (s.includes('reprov')) return 'badge-danger';
    if (s.includes('correc')) return 'badge-warning';
    return 'badge-warning';
  }
  function attachmentBadge(exp){
    let total = 0;
    if (exp && exp.foto_comprovante) total++;
    if (exp && exp.foto_odometro) total++;
    if (exp && Array.isArray(exp.media)) total += exp.media.length;
    if (!total) return '<span style="color:var(--text-muted);font-size:.78rem;">Sem anexo</span>';
    return `<span class="badge-status badge-primary" style="font-size:.7rem;font-weight:600;">📎 ${total} anexo${total > 1 ? 's' : ''}</span>`;
  }
  function actionButtonsExpense(exp){
    const id = String(exp && exp.id || '').replace(/'/g, "\\'");
    const approvalMode = sessionStorage.getItem('cc_expense_approval_mode') === '1';
    if (approvalMode && pending(exp && exp.status)) {
      return `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.__ccOpenExpenseDetails('${id}')">Ver Detalhes</button>
        <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveRegisteredExpense && App.approveRegisteredExpense('${id}')">Aprovar</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.rejectRegisteredExpense && App.rejectRegisteredExpense('${id}')">Reprovar</button>
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.correctRegisteredExpense && App.correctRegisteredExpense('${id}')">Correção</button>
      </div>`;
    }
    let correction = '';
    const user = getUser();
    if (normalize(exp && exp.status).includes('correc') && user && String(exp && exp.userId) === String(user.id)) {
      correction = `<button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); App.correctExpenseAndResubmit && App.correctExpenseAndResubmit('${id}')">Corrigir</button>`;
    }
    return `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.__ccOpenExpenseDetails('${id}')">Ver Detalhes</button>
      <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.generateExpenseComprovantePdf && App.generateExpenseComprovantePdf('${id}')">PDF</button>
      ${correction}
    </div>`;
  }

  window.__ccOpenExpenseDetails = function(id){
    if (window.App && typeof App.showRegisteredExpenseDetails === 'function') return App.showRegisteredExpenseDetails(id);
    if (window.App && typeof App.generateExpenseComprovantePdf === 'function') return App.generateExpenseComprovantePdf(id);
  };

  function visibilityFilter(moduleKey, list){
    const user = getUser();
    const activeUnitId = getActiveUnitId();
    let out = Array.isArray(list) ? list.slice() : [];
    if ((moduleKey === 'despesas' || moduleKey === 'chamados') && activeUnitId && activeUnitId !== 'all') {
      out = out.filter(item => String(item.unitId || item.unit_id || '') === String(activeUnitId));
    }
    if ((moduleKey === 'despesas' || moduleKey === 'chamados') && user && user.profile === 'Vendedor') {
      out = out.filter(item => String(item.userId || item.user_id || item.usuario_id || '') === String(user.id));
    }
    return out;
  }

  function fullFilter(moduleKey, raw){
    let list = Array.isArray(raw) ? raw.slice() : [];
    try {
      if (window.FiltersManager && FiltersManager.configs && FiltersManager.configs[moduleKey]) {
        FiltersManager.caches[moduleKey] = raw;
        FiltersManager.ensureFilterPanel(moduleKey);
        const filters = FiltersManager.getFilterValues(moduleKey);
        list = FiltersManager.filterData(raw, filters, moduleKey);
      }
    } catch(err) { console.warn('Falha nos filtros paginados de ' + moduleKey, err); }
    return visibilityFilter(moduleKey, list);
  }

  function signature(moduleKey, list){
    let filterValues = '';
    try { filterValues = JSON.stringify(window.FiltersManager ? FiltersManager.getFilterValues(moduleKey) : {}); } catch(_) {}
    const ids = (list || []).slice(0, 60).map(x => x && (x.id || x.os || x.codigo || x.created_at || x.date)).join('|');
    return `${filterValues}::${(list || []).length}::${ids}`;
  }

  function renderPagination(moduleKey, total, start, end){
    const cfg = TARGETS[moduleKey];
    const tbody = document.getElementById(cfg.tbodyId);
    if (!tbody) return;
    const tableBox = tbody.closest('.table-responsive') || tbody.closest('table');
    if (!tableBox) return;
    let pager = document.getElementById(`cc-pager-${moduleKey}`);
    if (!pager) {
      pager = document.createElement('div');
      pager.id = `cc-pager-${moduleKey}`;
      pager.className = 'cc-list-pager no-print';
      tableBox.insertAdjacentElement('afterend', pager);
    }
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(Math.max(1, state[moduleKey].page || 1), totalPages);
    const disablePrev = page <= 1 ? 'disabled' : '';
    const disableNext = page >= totalPages ? 'disabled' : '';
    const text = total ? `Mostrando ${start + 1}–${end} de ${total} ${cfg.label}` : `Nenhum registro para mostrar.`;
    pager.innerHTML = `<div class="cc-pager-info">${esc(text)}</div>
      <div class="cc-pager-actions">
        <button type="button" class="btn btn-secondary btn-sm" ${disablePrev} onclick="window.__ccPagerGo('${moduleKey}', ${page - 1})">Anterior</button>
        <span class="cc-pager-page">Página ${page} de ${totalPages}</span>
        <button type="button" class="btn btn-secondary btn-sm" ${disableNext} onclick="window.__ccPagerGo('${moduleKey}', ${page + 1})">Próxima</button>
      </div>`;
  }

  window.__ccPagerGo = function(moduleKey, page){
    if (!TARGETS[moduleKey]) return;
    state[moduleKey].page = Math.max(1, Number(page) || 1);
    const method = TARGETS[moduleKey].renderMethod;
    if (window.UI && typeof UI[method] === 'function') UI[method](state[moduleKey].raw || []);
  };

  function paginatedItems(moduleKey, raw){
    const filtered = fullFilter(moduleKey, raw);
    const sig = signature(moduleKey, filtered);
    if (state[moduleKey].signature !== sig) {
      state[moduleKey].signature = sig;
      state[moduleKey].page = 1;
    }
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state[moduleKey].page > totalPages) state[moduleKey].page = totalPages;
    const start = (state[moduleKey].page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, filtered.length);
    return { filtered, pageItems: filtered.slice(start, end), start, end };
  }

  function renderExpensesLight(raw){
    if (window.UI && typeof UI.updateBalanceCards === 'function') {
      try { UI.updateBalanceCards(); } catch(_) {}
    }
    const body = document.getElementById('expenses-table-body');
    if (!body) return;
    const { filtered, pageItems, start, end } = paginatedItems('despesas', raw);
    if (!pageItems.length) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:18px;">Nenhuma despesa registrada.</td></tr>`;
      renderPagination('despesas', filtered.length, 0, 0);
      return;
    }
    body.innerHTML = pageItems.map(exp => {
      const finalidade = exp.finalidade === 'Outro' ? `Outro (${exp.descreva || ''})` : (exp.finalidade || '-');
      const id = String(exp.id || '').replace(/'/g, "\\'");
      return `<tr class="mobile-summary-row" onclick="window.__ccOpenExpenseDetails('${id}')">
        <td data-label="Data" style="white-space:nowrap;">${esc(dateTimeExpense(exp))}</td>
        <td data-label="Finalidade" class="normal-wrap"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span>${attachmentBadge(exp)}</span><span>${esc(finalidade)}</span></div></td>
        <td data-label="Operação">${esc(exp.operacao || '-')}</td>
        <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:.7rem;font-weight:500;">${esc(unitName(exp.unitId || exp.unit_id))}</span></td>
        <td data-label="Responsável"><span style="font-size:.75rem;color:var(--text-muted);">${esc(expenseUser(exp))}</span></td>
        <td data-label="Valor" style="font-weight:600;">${money(exp.value ?? exp.valor)}</td>
        <td data-label="Status"><span class="badge-status ${statusClass(exp.status)}">${esc(exp.status || 'Pendente')}</span></td>
        <td data-label="Ações">${actionButtonsExpense(exp)}</td>
      </tr>`;
    }).join('');
    renderPagination('despesas', filtered.length, start, end);
  }

  function renderWithBase(moduleKey, raw){
    const body = document.getElementById(TARGETS[moduleKey].tbodyId);
    if (!body) return;
    const { filtered, pageItems, start, end } = paginatedItems(moduleKey, raw);
    if (!pageItems.length) {
      const colspan = moduleKey === 'chamados' ? 12 : 11;
      const msg = moduleKey === 'chamados' ? 'Nenhum chamado mecânico encontrado.' : 'Nenhuma movimentação registrada.';
      body.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:var(--text-muted); padding:18px;">${msg}</td></tr>`;
      renderPagination(moduleKey, filtered.length, 0, 0);
      return;
    }
    const fn = baseRender[moduleKey];
    if (typeof fn === 'function') fn(pageItems);
    renderPagination(moduleKey, filtered.length, start, end);
  }

  function injectStyle(){
    if (document.getElementById('cc-paginacao-performance-style')) return;
    const style = document.createElement('style');
    style.id = 'cc-paginacao-performance-style';
    style.textContent = `
      .cc-list-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-top:1px solid var(--border-color);background:rgba(255,255,255,.015);color:var(--text-muted);font-size:.78rem;}
      .cc-pager-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
      .cc-pager-page{font-weight:700;color:var(--text-main);font-size:.76rem;}
      .cc-list-pager button[disabled]{opacity:.45;cursor:not-allowed;}
      @media(max-width:768px){.cc-list-pager{flex-direction:column;align-items:stretch;text-align:center;padding:10px 8px}.cc-pager-actions{justify-content:center}.cc-pager-actions .btn{flex:1;min-width:96px}.cc-pager-page{width:100%;order:-1;margin-bottom:2px}}
    `;
    document.head.appendChild(style);
  }

  function patchFiltersManager(){
    if (!window.FiltersManager || FiltersManager.__ccPaginationTriggerPatched) return;
    const originalTrigger = FiltersManager.triggerFiltering ? FiltersManager.triggerFiltering.bind(FiltersManager) : null;
    FiltersManager.triggerFiltering = function(moduleKey){
      if (TARGETS[moduleKey] && window.UI && typeof UI[TARGETS[moduleKey].renderMethod] === 'function') {
        state[moduleKey].page = 1;
        return UI[TARGETS[moduleKey].renderMethod](this.caches[moduleKey] || state[moduleKey].raw || []);
      }
      return originalTrigger ? originalTrigger(moduleKey) : undefined;
    };
    FiltersManager.__ccPaginationTriggerPatched = true;
  }

  function listFromStore(moduleKey){
    const method = TARGETS[moduleKey].storeMethod;
    try { return (window.Store && Store[method] && Store[method]()) || []; } catch(_) { return []; }
  }

  function install(){
    if (!window.UI || !window.Store) return false;
    injectStyle();
    patchFiltersManager();

    if (!baseRender.movimentacao) baseRender.movimentacao = (UI._original_renderMovements || UI.renderMovements || function(){}).bind(UI);
    if (!baseRender.chamados) baseRender.chamados = (UI.renderTickets || UI._original_renderTickets || function(){}).bind(UI);

    UI.renderExpenses = function(data){
      const raw = Array.isArray(data) ? data : listFromStore('despesas');
      state.despesas.raw = raw;
      return renderExpensesLight(raw);
    };
    UI.renderMovements = function(data){
      const raw = Array.isArray(data) ? data : listFromStore('movimentacao');
      state.movimentacao.raw = raw;
      return renderWithBase('movimentacao', raw);
    };
    UI.renderTickets = function(data){
      const raw = Array.isArray(data) ? data : listFromStore('chamados');
      state.chamados.raw = raw;
      return renderWithBase('chamados', raw);
    };

    // Atualiza a tela atual quando o patch entra, sem mexer no banco.
    setTimeout(function(){
      const hash = String(location.hash || '');
      if (hash.includes('despesas') && document.getElementById('expenses-table-body')) UI.renderExpenses(state.despesas.raw.length ? state.despesas.raw : listFromStore('despesas'));
      if (hash.includes('movimentacao') && document.getElementById('movements-table-body')) UI.renderMovements(state.movimentacao.raw.length ? state.movimentacao.raw : listFromStore('movimentacao'));
      if (hash.includes('chamados') && document.getElementById('tickets-table-body')) UI.renderTickets(state.chamados.raw.length ? state.chamados.raw : listFromStore('chamados'));
    }, 250);
    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 150); });
})();
