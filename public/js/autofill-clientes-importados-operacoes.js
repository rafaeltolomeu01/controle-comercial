/*
 * Integração segura com Clientes Importador do Sistema
 * - Oculta o seletor global de vendedor do topo da barra lateral.
 * - Usa a base de clientes importados para autopreencher Movimentação, Chamados e Simulador de Troca.
 * - Campos preenchidos automaticamente ficam somente leitura.
 * - Se o código não existir, os campos do cliente permanecem editáveis para digitação manual.
 */
(function () {
  'use strict';

  const STORE_KEY = 'clientes_importador_sistema';
  const CENTRAL_STORAGE_KEY = 'controle_campo_db_global_' + STORE_KEY;
  const LEGACY_STORAGE_KEY = 'controle_comercial_clientes_importador_sistema_v1';

  const state = {
    lastRemoteLoadAt: 0,
    remoteLoading: false
  };

  function injectStyle() {
    if (document.getElementById('cc-clientes-importados-operacoes-style')) return;
    const style = document.createElement('style');
    style.id = 'cc-clientes-importados-operacoes-style';
    style.textContent = `
      /* Remove o seletor antigo de vendedor da barra lateral, sem apagar dados nem lógica interna. */
      #seller-filter { display: none !important; }
      .global-unit-container { display: none !important; }

      .cc-autofill-locked {
        background-color: rgba(255,255,255,0.035) !important;
        color: var(--text-main) !important;
        cursor: not-allowed !important;
        border-color: rgba(59,130,246,.28) !important;
      }

      .cc-fixed-hidden-select {
        display: none !important;
      }

      .cc-fixed-display-input {
        width: 100%;
        height: 44px;
        padding: 0 14px;
        background-color: rgba(255,255,255,0.035) !important;
        color: var(--text-main) !important;
        border: 1px solid rgba(59,130,246,.28) !important;
        border-radius: 8px;
        font-weight: 600;
        cursor: not-allowed;
      }

      .cc-client-code-hint {
        margin-top: 4px;
        font-size: .72rem;
        color: var(--text-muted);
        line-height: 1.25;
      }

      .cc-client-code-hint.found { color: #22c55e; }
      .cc-client-code-hint.not-found { color: #fbbf24; }

      @media (max-width: 768px) {
        .cc-fixed-display-input { height: 40px; font-size: .85rem; }
        .cc-client-code-hint { font-size: .68rem; }
      }
    `;
    document.head.appendChild(style);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function cleanCode(value) {
    return normalize(value).replace(/[^a-z0-9]/g, '');
  }

  function numericCode(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return String(Number(digits));
  }

  function readJsonArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeRowsCache(rows) {
    const safe = Array.isArray(rows) ? rows : [];
    try { localStorage.setItem(CENTRAL_STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}
    try { localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}
  }

  function getRowsLocal() {
    try {
      if (window.ClientesImportadorSistema && typeof window.ClientesImportadorSistema.getRows === 'function') {
        const rows = window.ClientesImportadorSistema.getRows();
        if (Array.isArray(rows) && rows.length) return rows;
      }
    } catch (_) {}

    const central = readJsonArray(CENTRAL_STORAGE_KEY);
    if (central.length) return central;

    try {
      if (window.Store && typeof Store.getList === 'function') {
        const rows = Store.getList(STORE_KEY, []);
        if (Array.isArray(rows) && rows.length) return rows;
      }
    } catch (_) {}

    return readJsonArray(LEGACY_STORAGE_KEY);
  }

  async function ensureRowsLoaded(force = false) {
    const local = getRowsLocal();
    const now = Date.now();
    const shouldFetch = force || !local.length || (now - state.lastRemoteLoadAt > 60000);

    if (!shouldFetch || state.remoteLoading || !window.Store || typeof Store.backendRequest !== 'function' || !Store.getToken || !Store.getToken()) {
      return local;
    }

    state.remoteLoading = true;
    try {
      const response = await Store.backendRequest(`/api/store/${encodeURIComponent(STORE_KEY)}`);
      const rows = response && Array.isArray(response.data) ? response.data : [];
      if (rows.length) writeRowsCache(rows);
      state.lastRemoteLoadAt = Date.now();
      return rows.length ? rows : local;
    } catch (err) {
      console.warn('Clientes importados: não foi possível atualizar cache do banco.', err.message || err);
      return local;
    } finally {
      state.remoteLoading = false;
    }
  }

  function findImportedClientByCodeFromRows(code, rows) {
    const codeClean = cleanCode(code);
    const codeNum = numericCode(code);
    if (!codeClean && !codeNum) return null;

    return (rows || []).find(row => {
      const rowCode = row && row.codigo != null ? row.codigo : '';
      const rowClean = cleanCode(rowCode);
      const rowNum = numericCode(rowCode);
      return (codeClean && rowClean && rowClean === codeClean) || (codeNum && rowNum && rowNum === codeNum);
    }) || null;
  }

  async function findImportedClientByCode(code) {
    let rows = getRowsLocal();
    let found = findImportedClientByCodeFromRows(code, rows);
    if (found) return found;

    rows = await ensureRowsLoaded(true);
    return findImportedClientByCodeFromRows(code, rows);
  }

  function buildAddress(row) {
    if (!row) return '';
    if (row.enderecoCompleto) return String(row.enderecoCompleto).trim();
    const main = [row.logradouro, row.endereco].filter(Boolean).join(' ').trim();
    const number = row.numero ? `, ${row.numero}` : '';
    const complemento = row.complemento ? ` - ${row.complemento}` : '';
    const bairro = row.bairro ? ` - ${row.bairro}` : '';
    const cep = row.cep ? ` - CEP ${row.cep}` : '';
    return `${main}${number}${complemento}${bairro}${cep}`.trim();
  }

  function getImportedSellerName(row) {
    if (!row) return '';
    return String(row.vendedor || row.vendedorResponsavel || row.vendedor_responsavel || row.seller || '').trim();
  }

  function setHiddenValue(id, value) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('input');
      el.type = 'hidden';
      el.id = id;
      el.name = id;
      const form = document.getElementById('ticket-open-form') || document.getElementById('exchange-client-form') || document.body;
      form.appendChild(el);
    }
    el.value = value || '';
  }

  function getLoggedUser() {
    try {
      return window.Store && typeof Store.getLoggedUser === 'function' ? (Store.getLoggedUser() || {}) : {};
    } catch (_) {
      return {};
    }
  }

  function getUnitName(unitId) {
    if (!unitId || unitId === 'all') return '';
    try {
      if (window.UI && typeof UI.getUnitName === 'function') return UI.getUnitName(unitId);
    } catch (_) {}
    try {
      const units = window.Store && typeof Store.getUnits === 'function' ? Store.getUnits() : [];
      const unit = units.find(u => String(u.id) === String(unitId));
      return unit ? unit.name : '';
    } catch (_) {
      return '';
    }
  }

  function getFixedUnitId() {
    const user = getLoggedUser();
    if (user.unitId && user.unitId !== 'all') return String(user.unitId);
    try {
      const active = window.Store && Store.getActiveUnitId ? Store.getActiveUnitId() : '';
      if (active && active !== 'all') return String(active);
    } catch (_) {}
    return '';
  }

  function getFixedCompanyText() {
    const user = getLoggedUser();
    const unitName = getUnitName(getFixedUnitId());
    return unitName || user.empresa_name || user.company_name || user.empresa_id || 'Empresa do usuário';
  }

  function getFixedSellerName() {
    const user = getLoggedUser();
    return user.name || user.nome || user.username || 'Usuário logado';
  }

  function setValue(id, value, locked = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value || '';
    setLocked(el, locked);
  }

  function setLocked(el, locked) {
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.disabled = !!locked;
    } else {
      el.readOnly = !!locked;
    }
    el.classList.toggle('cc-autofill-locked', !!locked);
  }

  function unlockClientFields(ids) {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      setLocked(el, false);
    });
  }

  function lockClientFields(ids) {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      setLocked(el, true);
    });
  }

  function ensureHint(input, id) {
    if (!input) return null;
    let hint = document.getElementById(id);
    if (!hint) {
      hint = document.createElement('div');
      hint.id = id;
      hint.className = 'cc-client-code-hint';
      input.insertAdjacentElement('afterend', hint);
    }
    return hint;
  }

  function setHint(input, id, type, text) {
    const hint = ensureHint(input, id);
    if (!hint) return;
    hint.className = 'cc-client-code-hint ' + (type || '');
    hint.textContent = text || '';
  }

  function ensureOption(select, value, label) {
    if (!select || !value) return;
    let option = Array.from(select.options || []).find(opt => String(opt.value) === String(value));
    if (!option) {
      option = document.createElement('option');
      option.value = String(value);
      option.textContent = label || String(value);
      select.appendChild(option);
    } else if (label && (!option.textContent || option.textContent === option.value)) {
      option.textContent = label;
    }
    select.value = String(value);
  }

  function ensureFixedDisplayForSelect(select, displayValue) {
    if (!select) return;
    const displayId = select.id + '-fixed-display';
    let display = document.getElementById(displayId);
    if (!display) {
      display = document.createElement('input');
      display.type = 'text';
      display.id = displayId;
      display.className = 'cc-fixed-display-input';
      display.readOnly = true;
      display.setAttribute('aria-label', 'Valor fixo');
      select.insertAdjacentElement('afterend', display);
    }
    display.value = displayValue || '';
    select.classList.add('cc-fixed-hidden-select');
    select.disabled = true;
  }

  function fixMovementIdentityFields() {
    const form = document.getElementById('movement-form');
    if (!form) return;

    const user = getLoggedUser();
    const unitId = getFixedUnitId();
    const companyText = getFixedCompanyText();

    const sellerInput = document.getElementById('mov-vendedor-solicitante');
    if (sellerInput) {
      sellerInput.value = getFixedSellerName();
      setLocked(sellerInput, true);
    }

    const companySelect = document.getElementById('mov-empresa');
    if (companySelect) {
      if (unitId) ensureOption(companySelect, unitId, companyText);
      ensureFixedDisplayForSelect(companySelect, companyText);
    }

    const clientSeller = document.getElementById('mov-client-seller');
    if (clientSeller && clientSeller.dataset.ccImportedLocked === '1') {
      setLocked(clientSeller, true);
    }
  }

  async function handleMovementClientCode() {
    const input = document.getElementById('mov-client-id');
    if (!input) return;
    const code = input.value.trim();
    fixMovementIdentityFields();

    if (!code) {
      unlockClientFields(['mov-client-name', 'mov-client-city', 'mov-client-address', 'mov-client-seller']);
      const sellerManual = document.getElementById('mov-client-seller');
      if (sellerManual) { delete sellerManual.dataset.ccImportedLocked; }
      setHint(input, 'mov-client-id-hint', '', 'Digite o código para buscar na base de clientes importados. Se não encontrar, preencha manualmente.');
      return;
    }

    const row = await findImportedClientByCode(code);
    if (!row) {
      unlockClientFields(['mov-client-name', 'mov-client-city', 'mov-client-address', 'mov-client-seller']);
      const sellerManual = document.getElementById('mov-client-seller');
      if (sellerManual) { delete sellerManual.dataset.ccImportedLocked; }
      setHint(input, 'mov-client-id-hint', 'not-found', 'Código não encontrado. Você pode preencher os dados do cliente manualmente.');
      return;
    }

    setValue('mov-client-name', row.fantasia || '', true);
    setValue('mov-client-city', row.cidade || '', true);
    setValue('mov-client-address', buildAddress(row), true);
    const importedSeller = getImportedSellerName(row);
    const movClientSeller = document.getElementById('mov-client-seller');
    if (movClientSeller) movClientSeller.dataset.ccImportedLocked = '1';
    setValue('mov-client-seller', importedSeller || getFixedSellerName(), true);
    setHint(input, 'mov-client-id-hint', 'found', 'Cliente localizado na base importada. Os dados automáticos ficaram bloqueados.');
  }

  function bindMovementAutofill() {
    const input = document.getElementById('mov-client-id');
    if (!input || input.dataset.ccImportedAutofillBound === '1') return;
    input.dataset.ccImportedAutofillBound = '1';
    input.addEventListener('input', debounce(handleMovementClientCode, 250));
    input.addEventListener('blur', handleMovementClientCode);
    setHint(input, 'mov-client-id-hint', '', 'Digite o código para buscar na base de clientes importados.');
    fixMovementIdentityFields();
  }

  function ensureTicketClientCodeField() {
    const clientInput = document.getElementById('ticket-open-client');
    if (!clientInput) return null;
    if (document.getElementById('ticket-open-client-code')) return document.getElementById('ticket-open-client-code');

    const clientGroup = clientInput.closest('.form-group');
    if (!clientGroup) return null;

    const codeGroup = document.createElement('div');
    codeGroup.className = 'form-group';
    codeGroup.innerHTML = `
      <label for="ticket-open-client-code">Código do Cliente</label>
      <input type="text" id="ticket-open-client-code" placeholder="Digite o código, se houver...">
    `;
    clientGroup.parentElement.insertBefore(codeGroup, clientGroup);
    return codeGroup.querySelector('#ticket-open-client-code');
  }

  function ensureTicketImportedHiddenFields() {
    const form = document.getElementById('ticket-open-form');
    if (!form) return;
    ['ticket-open-client-code-hidden', 'ticket-open-client-seller-imported'].forEach(id => {
      if (!document.getElementById(id)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.id = id;
        input.name = id;
        form.appendChild(input);
      }
    });
  }

  function fixTicketIdentityFields() {
    const form = document.getElementById('ticket-open-form');
    if (!form) return;
    ensureTicketImportedHiddenFields();

    const user = getLoggedUser();
    const unitId = getFixedUnitId() || user.unitId || '';
    const companyText = getFixedCompanyText();

    const unitSelect = document.getElementById('ticket-open-unit');
    if (unitSelect) {
      if (unitId && unitId !== 'all') ensureOption(unitSelect, unitId, companyText);
      ensureFixedDisplayForSelect(unitSelect, companyText);
    }

    const sellerSelect = document.getElementById('ticket-open-seller');
    if (sellerSelect) {
      const userId = user.id || user.username || '';
      if (userId) ensureOption(sellerSelect, userId, getFixedSellerName());
      ensureFixedDisplayForSelect(sellerSelect, getFixedSellerName());
    }
  }

  async function handleTicketClientCode() {
    const input = document.getElementById('ticket-open-client-code');
    if (!input) return;
    const code = input.value.trim();
    fixTicketIdentityFields();

    if (!code) {
      unlockClientFields(['ticket-open-client', 'ticket-open-fantasy', 'ticket-open-city', 'ticket-open-address']);
      setHiddenValue('ticket-open-client-code-hidden', '');
      setHiddenValue('ticket-open-client-seller-imported', '');
      setHint(input, 'ticket-open-client-code-hint', '', 'Digite o código para buscar na base importada. Se não encontrar, preencha manualmente.');
      return;
    }

    const row = await findImportedClientByCode(code);
    if (!row) {
      unlockClientFields(['ticket-open-client', 'ticket-open-fantasy', 'ticket-open-city', 'ticket-open-address']);
      setHiddenValue('ticket-open-client-code-hidden', code);
      setHiddenValue('ticket-open-client-seller-imported', '');
      setHint(input, 'ticket-open-client-code-hint', 'not-found', 'Código não encontrado. Você pode preencher os dados do cliente manualmente.');
      return;
    }

    setValue('ticket-open-client', row.fantasia || '', true);
    setValue('ticket-open-fantasy', row.fantasia || '', true);
    setValue('ticket-open-city', row.cidade || '', true);
    setValue('ticket-open-address', buildAddress(row), true);
    setHiddenValue('ticket-open-client-code-hidden', row.codigo || code);
    setHiddenValue('ticket-open-client-seller-imported', getImportedSellerName(row));
    setHint(input, 'ticket-open-client-code-hint', 'found', 'Cliente localizado na base importada. Os dados automáticos ficaram bloqueados.');
  }

  function bindTicketAutofill() {
    const input = ensureTicketClientCodeField();
    if (!input || input.dataset.ccImportedAutofillBound === '1') {
      fixTicketIdentityFields();
      return;
    }
    input.dataset.ccImportedAutofillBound = '1';
    input.addEventListener('input', debounce(handleTicketClientCode, 250));
    input.addEventListener('blur', handleTicketClientCode);

    // Se o patrimônio preencher algum dado pelo histórico, mantém unidade e vendedor travados no usuário logado.
    const serial = document.getElementById('ticket-open-serial');
    if (serial && serial.dataset.ccFixedUserReapplyBound !== '1') {
      serial.dataset.ccFixedUserReapplyBound = '1';
      serial.addEventListener('change', () => setTimeout(fixTicketIdentityFields, 500));
    }

    setHint(input, 'ticket-open-client-code-hint', '', 'Digite o código para buscar na base de clientes importados.');
    fixTicketIdentityFields();
  }

  async function handleExchangeClientCode() {
    const input = document.getElementById('exchange-client-code');
    const nameInput = document.getElementById('exchange-client-name');
    if (!input || !nameInput) return;

    const code = input.value.trim();
    if (!code) {
      setLocked(nameInput, false);
      setHiddenValue('exchange-client-seller-imported', '');
      setHint(input, 'exchange-client-code-hint', '', 'Digite o código para buscar o nome fantasia automaticamente.');
      return;
    }

    const row = await findImportedClientByCode(code);
    if (!row) {
      setLocked(nameInput, false);
      setHiddenValue('exchange-client-seller-imported', '');
      setHint(input, 'exchange-client-code-hint', 'not-found', 'Código não encontrado. Você pode digitar o nome fantasia normalmente.');
      return;
    }

    nameInput.value = row.fantasia || '';
    setHiddenValue('exchange-client-seller-imported', getImportedSellerName(row));
    setLocked(nameInput, true);
    setHint(input, 'exchange-client-code-hint', 'found', 'Cliente localizado. Nome fantasia preenchido automaticamente e bloqueado.');
  }

  function bindExchangeAutofill() {
    const input = document.getElementById('exchange-client-code');
    if (!input || input.dataset.ccImportedAutofillBound === '1') return;
    input.dataset.ccImportedAutofillBound = '1';
    input.addEventListener('input', debounce(handleExchangeClientCode, 250));
    input.addEventListener('blur', handleExchangeClientCode);
    setHint(input, 'exchange-client-code-hint', '', 'Digite o código para buscar na base de clientes importados.');
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, arguments), wait);
    };
  }

  function bindSubmitSafeguards() {
    const movementForm = document.getElementById('movement-form');
    if (movementForm && movementForm.dataset.ccSubmitSafeguardBound !== '1') {
      movementForm.dataset.ccSubmitSafeguardBound = '1';
      movementForm.addEventListener('submit', () => {
        // Garante que campos fixos/automáticos tenham valor antes do envio, inclusive em navegadores mobile/PWA.
        fixMovementIdentityFields();
        const tipo = document.getElementById('mov-tipo-solicitacao');
        if (tipo) tipo.disabled = false;
      }, true);
    }

    const ticketForm = document.getElementById('ticket-open-form');
    if (ticketForm && ticketForm.dataset.ccSubmitSafeguardBound !== '1') {
      ticketForm.dataset.ccSubmitSafeguardBound = '1';
      ticketForm.addEventListener('submit', () => {
        fixTicketIdentityFields();
        ensureTicketImportedHiddenFields();
      }, true);
    }
  }

  function bindFormResetReapply() {
    ['movement-form', 'ticket-open-form', 'exchange-client-form'].forEach(formId => {
      const form = document.getElementById(formId);
      if (!form || form.dataset.ccResetReapplyBound === '1') return;
      form.dataset.ccResetReapplyBound = '1';
      form.addEventListener('reset', () => {
        setTimeout(() => {
          fixMovementIdentityFields();
          fixTicketIdentityFields();
          const exchangeName = document.getElementById('exchange-client-name');
          if (exchangeName) setLocked(exchangeName, false);
        }, 80);
      });
    });
  }

  function applyAll() {
    injectStyle();
    bindMovementAutofill();
    bindTicketAutofill();
    bindExchangeAutofill();
    bindSubmitSafeguards();
    bindFormResetReapply();
    fixMovementIdentityFields();
    fixTicketIdentityFields();
  }

  let scheduled = null;
  function scheduleApply(delay = 120) {
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(() => {
      scheduled = null;
      applyAll();
    }, delay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleApply(0));
  } else {
    scheduleApply(0);
  }

  window.addEventListener('hashchange', () => {
    ensureRowsLoaded(false);
    scheduleApply(250);
  });
  window.addEventListener('load', () => {
    ensureRowsLoaded(false);
    scheduleApply(500);
  });

  const observer = new MutationObserver(() => scheduleApply(180));
  function startObserver() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  // Reaplica periodicamente porque algumas telas recarregam formulários após buscar dados da API.
  setInterval(() => {
    if (document.getElementById('movement-form') || document.getElementById('ticket-open-form') || document.getElementById('exchange-client-form')) {
      scheduleApply(0);
    }
  }, 2500);

  window.ClientesImportadosOperacoes = {
    findImportedClientByCode,
    ensureRowsLoaded,
    applyAll
  };
})();
