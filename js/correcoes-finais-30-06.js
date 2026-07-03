/* ============================================================
   CORREÇÕES FINAIS - 30/06
   1. Exclusão correta de clientes (via API + local store)
   2. Filtro global de vendedor (dropdown populado e funcional)
   3. Datas formatadas no fuso de Brasília em toda a UI
   4. Notificações: banner para navegadores sem suporte
   ============================================================ */
(function () {
  'use strict';
  if (window.__ccCorrecoesFinal30) return;
  window.__ccCorrecoesFinal30 = true;

  /* utilitários */
  function formatBR(dateStr) {
    if (!dateStr) return '-';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour12: false,
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return dateStr; }
  }

  /* 1. EXCLUSÃO CORRETA DE CLIENTES */
  function injectDeleteClient() {
    if (!window.App || App.__ccDeleteClientFinal) return;
    App.__ccDeleteClientFinal = true;

    App.deleteClient = async function (id) {
      if (!id) return;
      if (!confirm('Deseja realmente excluir este cliente permanentemente? Esta acao nao pode ser desfeita.')) return;

      // Remove do localStorage usando lista COMPLETA (sem filtro de vendedor)
      if (window.Store && Store.getAllClients) {
        var updated = Store.getAllClients().filter(function(c){ return String(c.id) !== String(id); });
        Store.saveClients(updated);
      }

      // Remove do banco via API
      try {
        await App.fetchFromApi('/api/clientes/' + encodeURIComponent(id), { method: 'DELETE' });
        App.showToast && App.showToast('Cliente excluido com sucesso!');
      } catch (err) {
        console.error('Erro ao excluir cliente no backend:', err);
        App.showToast && App.showToast('Erro ao excluir: ' + (err.message || err));
      }

      // Força sincronização do banco para não trazer o cliente de volta
      if (window.Store && Store.syncAllFromBackend) {
        await Store.syncAllFromBackend({ forceRemote: true }).catch(function(){});
      }

      App.refreshAllLists && App.refreshAllLists();
    };
  }

  // Injeta botão Excluir nas linhas de clientes (somente admin)
  function addDeleteButtonToClientRows() {
    return;
  }
  function _old_addDeleteButtonToClientRows() {
    var loggedUser = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
    var isAdmin = loggedUser && (loggedUser.profile === 'Administrador');
    if (!isAdmin) return;
    if (window.location.hash !== '#clientes') return;

    document.querySelectorAll('tr[data-id]').forEach(function(tr) {
      if (!tr.closest('tbody')) return;
      if (tr.querySelector('.cc-btn-delete-client')) return;
      var id = tr.dataset.id;
      if (!id) return;
      var lastTd = tr.querySelector('td:last-child');
      if (!lastTd) return;

      var btn = document.createElement('button');
      btn.className = 'btn btn-danger btn-sm cc-btn-delete-client';
      btn.type = 'button';
      btn.textContent = 'Excluir';
      btn.style.cssText = 'margin-left:4px;padding:2px 8px;font-size:0.72rem;';
      btn.onclick = function(e) { e.stopPropagation(); App.deleteClient(id); };
      lastTd.appendChild(btn);
    });
  }

  /* 2. FILTRO GLOBAL DE VENDEDOR */
  function populateSellerFilter() {
    var sel = document.getElementById('seller-filter');
    if (!sel || !window.Store) return;

    var users = Store.getList ? Store.getList('users', []) : [];
    var sellers = users.filter(function(u){ return u.profile === 'Vendedor'; });
    if (!sellers.length) return;

    var currentVal = sel.value || (Store.getCurrentSellerId ? Store.getCurrentSellerId() : '');
    sel.innerHTML = '<option value="">Todos Vendedores</option>';
    sellers.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = String(s.id);
      opt.textContent = s.name || s.username || s.id;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;

    if (!sel.dataset.listenerAdded) {
      sel.dataset.listenerAdded = '1';
      sel.addEventListener('change', function() {
        if (Store.setCurrentSellerId) Store.setCurrentSellerId(sel.value);
        App.refreshAllLists && App.refreshAllLists();
        applySellerFilterToTables();
      });
    }
  }

  function applySellerFilterToTables() {
    var sellerId = window.Store && Store.getCurrentSellerId ? Store.getCurrentSellerId() : '';
    if (!sellerId) {
      document.querySelectorAll('tr[data-hidden-by-seller]').forEach(function(tr) {
        tr.style.display = '';
        delete tr.dataset.hiddenBySeller;
      });
      return;
    }

    var users = window.Store ? Store.getList('users', []) : [];
    var seller = users.find(function(u){ return String(u.id) === String(sellerId); });
    if (!seller) return;
    var sellerName = (seller.name || seller.username || '').toLowerCase().trim();

    ['expenses-table-body', 'despesas-solicitacoes-table-body', 'balances-table-body'].forEach(function(tbId) {
      var tbody = document.getElementById(tbId);
      if (!tbody) return;
      tbody.querySelectorAll('tr').forEach(function(tr) {
        var txt = tr.textContent.toLowerCase();
        var match = sellerName && txt.includes(sellerName);
        if (!match) {
          tr.style.display = 'none';
          tr.dataset.hiddenBySeller = '1';
        } else {
          tr.style.display = '';
          delete tr.dataset.hiddenBySeller;
        }
      });
    });
  }

  /* 3. DATAS EM BRASILIA */
  function patchGlobalDateFormatters() {
    if (!window.Store) return;
    if (Store.__ccDatePatched) return;
    Store.__ccDatePatched = true;

    Store.formatBRDate = function(dateStr) {
      if (!dateStr) return '-';
      try {
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch(e) { return dateStr; }
    };
    Store.formatBRDateOnly = function(dateStr) {
      if (!dateStr) return '-';
      try {
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch(e) { return dateStr; }
    };
    window.formatBRDate = Store.formatBRDate.bind(Store);
    window.formatBRDateOnly = Store.formatBRDateOnly.bind(Store);
  }

  function patchDatesInDOM() {
    var isoRe = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)\b/g;
    document.querySelectorAll('td, .date-cell, [data-date]').forEach(function(el) {
      if (el.children.length > 0) return;
      var txt = el.textContent;
      isoRe.lastIndex = 0;
      if (!isoRe.test(txt)) return;
      isoRe.lastIndex = 0;
      el.textContent = txt.replace(isoRe, function(m) { return formatBR(m); });
    });
  }

  /* 4. BANNER PARA NAVEGADORES SEM SUPORTE A PUSH */
  function setupNotificationBanner() {
    var hasPush = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
    if (hasPush) return;
    if (document.getElementById('cc-no-push-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'cc-no-push-banner';
    banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;background:#1e3a5f;color:#93c5fd;border:1px solid #2563eb;border-radius:10px;padding:10px 18px;font-size:0.8rem;max-width:94vw;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:flex;align-items:center;gap:10px;';
    banner.innerHTML = '<span>\uD83D\uDD14 Notificacoes push nao suportadas neste dispositivo/navegador. As notificacoes serao exibidas dentro do sistema automaticamente.</span><button onclick="this.parentElement.remove()" style="background:transparent;border:none;color:#93c5fd;cursor:pointer;font-size:1.1rem;line-height:1;">\u2715</button>';
    document.body.appendChild(banner);
    setTimeout(function(){ if (banner && banner.parentElement) banner.remove(); }, 10000);
  }

  /* INICIALIZACAO */
  function init() {
    patchGlobalDateFormatters();
    injectDeleteClient();
    populateSellerFilter();
    addDeleteButtonToClientRows();
    patchDatesInDOM();
    applySellerFilterToTables();
    setupNotificationBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 600); });
  } else {
    setTimeout(init, 600);
  }

  window.addEventListener('hashchange', function(){
    setTimeout(function(){
      populateSellerFilter();
      addDeleteButtonToClientRows();
      patchDatesInDOM();
      applySellerFilterToTables();
    }, 350);
  });

  var obsTimer = null;
  new MutationObserver(function(){
    clearTimeout(obsTimer);
    obsTimer = setTimeout(function(){
      populateSellerFilter();
      addDeleteButtonToClientRows();
      patchDatesInDOM();
    }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });

})();
