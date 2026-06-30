/* Correção definitiva 30/06 - abas de Despesas sem duplicar, sem piscar e com navegação funcional */
(function(){
  'use strict';
  if (window.__ccStableExpenseTabs3006) return;
  window.__ccStableExpenseTabs3006 = true;

  const TABS = [
    { id:'tab-despesas-campo', label:'Despesas de Campo', hash:'#despesas', mode:'normal' },
    { id:'tab-balance-solicitation', label:'Solicitação de Saldo', hash:'#solicitacao-despesas', mode:'' },
    { id:'tab-balance-approvals', label:'Aprovação de Saldo', hash:'#despesas-dashboard', mode:'' },
    { id:'tab-expense-approvals', label:'Aprovação de Despesas', hash:'#despesas', mode:'approval' }
  ];

  const normalizeText = el => (el && el.textContent ? el.textContent : '').replace(/\s+/g,' ').trim();
  const perms = () => {
    try {
      const u = (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
      return { user:u, list:Array.isArray(u.permissions) ? u.permissions : [] };
    } catch(e) { return {user:{}, list:[]}; }
  };
  const canApproveExpense = () => {
    const {user:u, list:p} = perms();
    return u.profile === 'Administrador' || u.profile === 'Financeiro' ||
      p.includes('Administrador') || p.includes('Administrador (Acesso Total)') ||
      p.includes('Financeiro') || p.includes('Aprovação de Despesas');
  };
  const canApproveBalance = () => {
    const {user:u, list:p} = perms();
    return u.profile === 'Administrador' || u.profile === 'Financeiro' ||
      p.includes('Administrador') || p.includes('Administrador (Acesso Total)') ||
      p.includes('Financeiro') || p.includes('Aprovação de Saldo');
  };
  const canSolicitBalance = () => {
    const {user:u, list:p} = perms();
    return u.profile === 'Administrador' || u.profile === 'Financeiro' ||
      p.includes('Administrador') || p.includes('Administrador (Acesso Total)') ||
      p.includes('Financeiro') || p.includes('Solicitação de Saldo') || p.includes('Despesas') || p.includes('Despesas de Campo');
  };

  function navigateTab(hash, mode){
    if (mode === 'approval') sessionStorage.setItem('cc_expense_approval_mode','1');
    else sessionStorage.removeItem('cc_expense_approval_mode');

    if (window.location.hash !== hash) {
      window.location.hash = hash;
      return;
    }
    // Mesmo hash (#despesas) precisa recarregar o modo correto.
    try { window.App && App.onRouteChanged && App.onRouteChanged(hash); } catch(e) { console.warn(e); }
    try {
      if (hash === '#despesas') window.App && App.loadExpenses && App.loadExpenses();
      if (hash === '#despesas-dashboard') window.App && App.loadDespesasDashboard && App.loadDespesasDashboard();
      if (hash === '#solicitacao-despesas') window.App && App.initSolicitacaoForm && App.initSolicitacaoForm();
    } catch(e) { console.warn(e); }
    scheduleTabs();
  }

  function allowed(tab){
    if (tab.id === 'tab-expense-approvals') return canApproveExpense();
    if (tab.id === 'tab-balance-approvals') return canApproveBalance();
    if (tab.id === 'tab-balance-solicitation') return canSolicitBalance();
    return true;
  }

  function getExpenseTabHosts(){
    return Array.from(document.querySelectorAll('#view-despesas .view-tabs, #view-solicitacao-despesas .view-tabs, #view-despesas-dashboard .view-tabs'));
  }

  function ensureHost(host){
    if (!host || host.dataset.ccStableTabsWorking === '1') return;
    host.dataset.ccStableTabsWorking = '1';
    try {
      // Remove duplicados pelos textos conhecidos, preservando o primeiro encontrado.
      const seen = new Set();
      Array.from(host.querySelectorAll('a,button')).forEach(el => {
        const label = normalizeText(el);
        if (!TABS.some(t => t.label === label)) return;
        if (seen.has(label)) el.remove();
        else seen.add(label);
      });

      TABS.forEach(tab => {
        let el = host.querySelector('#' + tab.id) || Array.from(host.querySelectorAll('a,button')).find(x => normalizeText(x) === tab.label);
        if (!el) {
          el = document.createElement('a');
          el.className = 'view-tab-btn';
          el.textContent = tab.label;
          host.appendChild(el);
        }
        // Remove listeners antigos uma única vez.
        if (el.dataset.ccStableBound !== '1') {
          const clone = el.cloneNode(true);
          el.replaceWith(clone);
          el = clone;
        }
        el.id = tab.id;
        el.className = (el.className || 'view-tab-btn').replace(/\bactive\b/g,'').trim() || 'view-tab-btn';
        if (!el.classList.contains('view-tab-btn')) el.classList.add('view-tab-btn');
        el.textContent = tab.label;
        el.href = tab.hash;
        el.dataset.ccStableBound = '1';
        el.dataset.ccHash = tab.hash;
        el.dataset.ccMode = tab.mode || '';
        el.style.display = allowed(tab) ? 'flex' : 'none';
        el.onclick = function(ev){
          ev.preventDefault();
          ev.stopPropagation();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          navigateTab(this.dataset.ccHash, this.dataset.ccMode || '');
          return false;
        };
      });

      // Ordem fixa sem ficar reapendando os mesmos nós a cada MutationObserver.
      // Reapendar sempre causava childList mutation em loop (pisca-pisca das abas).
      const ordered = TABS.map(tab => host.querySelector('#' + tab.id)).filter(Boolean);
      const current = Array.from(host.children).filter(el => ordered.includes(el));
      const sameOrder = ordered.length === current.length && ordered.every((el, i) => current[i] === el);
      if (!sameOrder) ordered.forEach(el => host.appendChild(el));

      // Estado ativo correto.
      const isApproval = window.location.hash === '#despesas' && sessionStorage.getItem('cc_expense_approval_mode') === '1';
      const activeId = isApproval ? 'tab-expense-approvals' :
        window.location.hash === '#despesas' ? 'tab-despesas-campo' :
        window.location.hash === '#solicitacao-despesas' ? 'tab-balance-solicitation' :
        window.location.hash === '#despesas-dashboard' ? 'tab-balance-approvals' : null;
      Array.from(host.querySelectorAll('a,button')).forEach(el => el.classList.remove('active'));
      if (activeId) {
        const active = host.querySelector('#' + activeId);
        if (active) active.classList.add('active');
      }
    } finally {
      host.dataset.ccStableTabsWorking = '0';
    }
  }

  function normalizeAllTabs(){
    getExpenseTabHosts().forEach(ensureHost);
  }

  function scheduleTabs(){
    clearTimeout(window.__ccStableExpenseTabsTimer);
    window.__ccStableExpenseTabsTimer = setTimeout(normalizeAllTabs, 60);
  }

  document.addEventListener('DOMContentLoaded', scheduleTabs);
  window.addEventListener('hashchange', scheduleTabs);
  const oldRoute = window.App && App.onRouteChanged;
  if (oldRoute && !App.__ccStableTabsRouteWrapped) {
    App.__ccStableTabsRouteWrapped = true;
    App.onRouteChanged = function(hash){
      if (hash !== '#despesas') sessionStorage.removeItem('cc_expense_approval_mode');
      const ret = oldRoute.apply(this, arguments);
      scheduleTabs();
      return ret;
    };
  }
  // Não observar o documento inteiro: isso fazia as abas serem reconstruídas quando qualquer lista mudava.
  // Basta atualizar em carregamento, troca de rota e poucos cliques de navegação.
  document.addEventListener('click', function(ev){
    if (ev.target && ev.target.closest && ev.target.closest('.view-tabs')) setTimeout(scheduleTabs, 30);
  }, true);
  scheduleTabs();
})();
