/* Correção emergencial 30/06 - navegação das abas de Despesas sem duplicar/piscar */
(function(){
  'use strict';
  if (window.__ccFixTabsNav3006) return;
  window.__ccFixTabsNav3006 = true;

  const TAB_CONFIG = [
    { id:'tab-despesas-campo', label:'Despesas de Campo', hash:'#despesas', mode:'' },
    { id:'tab-balance-solicitation', label:'Solicitação de Saldo', hash:'#solicitacao-despesas', mode:'' },
    { id:'tab-balance-approvals', label:'Aprovação de Saldo', hash:'#despesas-dashboard', mode:'' },
    { id:'tab-expense-approvals', label:'Aprovação de Despesas', hash:'#despesas', mode:'approval' }
  ];

  function txt(el){ return (el.textContent || '').replace(/\s+/g,' ').trim(); }
  function canApproveExpense(){
    const u = (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
    const p = Array.isArray(u.permissions) ? u.permissions : [];
    return u.profile === 'Administrador' || u.profile === 'Financeiro' ||
      p.includes('Administrador') || p.includes('Administrador (Acesso Total)') ||
      p.includes('Financeiro') || p.includes('Aprovação de Despesas');
  }

  function activateTarget(hash, mode){
    if (mode === 'approval') sessionStorage.setItem('cc_expense_approval_mode','1');
    else sessionStorage.removeItem('cc_expense_approval_mode');

    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      // Quando o hash é o mesmo (#despesas), o navegador não dispara hashchange.
      // Força o recarregamento correto da tela.
      try { window.App && App.onRouteChanged && App.onRouteChanged(hash); } catch(e) { console.warn(e); }
      try {
        if (hash === '#despesas') App.loadExpenses && App.loadExpenses();
        if (hash === '#despesas-dashboard') App.loadDespesasDashboard && App.loadDespesasDashboard();
        if (hash === '#solicitacao-despesas') App.loadBalances && App.loadBalances();
      } catch(e) { console.warn(e); }
      window.dispatchEvent(new Event('cc-tabs-updated'));
    }
    setTimeout(normalizeExpenseTabs, 80);
  }

  function normalizeExpenseTabs(){
    document.querySelectorAll('.view-tabs').forEach(host => {
      const tabs = Array.from(host.querySelectorAll('a,button'));
      const byLabel = new Map();

      // Remove duplicados por texto, mas preserva os quatro botões oficiais.
      tabs.forEach(el => {
        const label = txt(el);
        const cfg = TAB_CONFIG.find(t => t.label === label);
        if (!cfg) return;
        if (byLabel.has(label)) {
          el.remove();
        } else {
          byLabel.set(label, el);
        }
      });

      // Garante que cada aba oficial exista uma única vez.
      TAB_CONFIG.forEach(cfg => {
        let el = byLabel.get(cfg.label) || host.querySelector('#' + cfg.id);
        if (!el) {
          el = document.createElement('a');
          el.className = 'view-tab-btn';
          el.textContent = cfg.label;
          host.appendChild(el);
        }
        el.id = cfg.id;
        el.href = cfg.hash;
        el.dataset.ccHash = cfg.hash;
        el.dataset.ccMode = cfg.mode;
        el.style.display = (cfg.id === 'tab-expense-approvals' && !canApproveExpense()) ? 'none' : 'flex';
        if (!el.dataset.ccTabBound) {
          el.dataset.ccTabBound = '1';
          el.addEventListener('click', function(ev){
            ev.preventDefault();
            ev.stopPropagation();
            activateTarget(this.dataset.ccHash, this.dataset.ccMode || '');
          }, true);
        }
      });

      // Ordena sem recriar, evitando piscar.
      TAB_CONFIG.forEach(cfg => {
        const el = host.querySelector('#' + cfg.id);
        if (el) host.appendChild(el);
      });

      // Estado ativo correto.
      host.querySelectorAll('a,button').forEach(el => el.classList.remove('active'));
      const isExpenseApproval = window.location.hash === '#despesas' && sessionStorage.getItem('cc_expense_approval_mode') === '1';
      let activeId = null;
      if (isExpenseApproval) activeId = 'tab-expense-approvals';
      else if (window.location.hash === '#despesas') activeId = 'tab-despesas-campo';
      else if (window.location.hash === '#solicitacao-despesas') activeId = 'tab-balance-solicitation';
      else if (window.location.hash === '#despesas-dashboard') activeId = 'tab-balance-approvals';
      const active = activeId && host.querySelector('#' + activeId);
      if (active) active.classList.add('active');
    });
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(normalizeExpenseTabs, 100));
  window.addEventListener('hashchange', () => setTimeout(normalizeExpenseTabs, 80));
  window.addEventListener('cc-tabs-updated', () => setTimeout(normalizeExpenseTabs, 80));
  new MutationObserver(() => {
    clearTimeout(window.__ccFixTabsNavTimer);
    window.__ccFixTabsNavTimer = setTimeout(normalizeExpenseTabs, 80);
  }).observe(document.documentElement, {childList:true, subtree:true});
})();
