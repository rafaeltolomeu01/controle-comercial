/*
  Ajuste final 02/07 - sessão única, visibilidade de clientes pendentes e correção por notificação.
  Escopo controlado: não altera layout geral nem banco, apenas endurece regras de exibição/fluxo.
*/
(function(){
  'use strict';
  if (window.__ccClientesAprovacaoAjusteFinal0207) return;
  window.__ccClientesAprovacaoAjusteFinal0207 = true;

  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const user = () => { try { return (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {}; } catch(_) { return {}; } };
  const perms = (u) => {
    u = u || user();
    if (Array.isArray(u.permissions)) return u.permissions;
    try { return JSON.parse(u.permissions || '[]'); } catch(_) { return []; }
  };
  const clientOwnerId = (c) => String((c && (c.userId || c.user_id || c.vendedor_id || c.seller_id)) || '');
  const isOwner = (c, u) => String(clientOwnerId(c)) && String(clientOwnerId(c)) === String((u || user()).id || '');
  const statusNorm = (c) => norm(c && c.status);
  const isApproved = (c) => statusNorm(c).includes('aprov');
  const isCorrection = (c) => {
    const s = statusNorm(c);
    return s.includes('ajuste') || s.includes('correc') || s.includes('reprov');
  };
  const isDeleted = (c) => !c || c.deleted || c.excluido || c.active === false;

  function canApproveClients(u){
    u = u || user();
    const profile = norm(u.profile || u.role || u.perfil);
    const p = perms(u).map(norm);
    const text = [profile, ...p].join(' | ');
    if (profile.includes('admin') || profile.includes('administrador')) return true;
    if (profile.includes('responsavel') && profile.includes('equip')) return true;
    if (profile.includes('supervisor') || profile.includes('gerente')) return true;
    return [
      'aprovacao de clientes',
      'aprovar clientes',
      'liberacao de cadastro de clientes',
      'liberacao cadastro clientes',
      'liberacao de clientes',
      'movimentacao de equipamentos',
      'movimentacao equipamento',
      'liberacao de equipamentos',
      'liberacao de equipamento',
      'equipamentos',
      'estoque'
    ].some(x => text.includes(x));
  }

  function clientsForMainList(list){
    const u = user();
    const approver = canApproveClients(u);
    return (Array.isArray(list) ? list : []).filter(c => {
      if (isDeleted(c)) return false;
      if (approver) return true;
      // Vendedor e usuário sem permissão não veem pendentes, reprovados ou aguardando correção na lista principal.
      // Esses cadastros aparecem somente via notificação/botão Corrigir.
      return isApproved(c);
    });
  }

  function clientsForApprovalQueue(list){
    const u = user();
    const approver = canApproveClients(u);
    if (!approver) return [];
    return (Array.isArray(list) ? list : []).filter(c => {
      if (isDeleted(c)) return false;
      const s = statusNorm(c);
      return !s.includes('aprov') && (s.includes('pendent') || s.includes('aguard') || s.includes('ajuste') || s.includes('correc') || s.includes('reprov') || !s);
    });
  }

  function patchSessionAlert(){
    if (!window.App || App.__ccSessionAlertSinglePatched) return;
    App.__ccSessionAlertSinglePatched = true;
    App.sessionLogoutInProgress = false;
    App.sessionAlertShown = false;

    const originalForceLogout = App.forceLogout ? App.forceLogout.bind(App) : null;
    App.forceLogout = function(message){
      const hasMessage = !!message;
      if (this.sessionLogoutInProgress) {
        if (hasMessage && !this.sessionAlertShown) {
          this.sessionAlertShown = true;
          setTimeout(() => alert(message), 60);
        }
        return;
      }
      this.sessionLogoutInProgress = true;
      if (hasMessage) this.sessionAlertShown = true;
      try {
        if (this.autoSyncIntervalId) {
          clearInterval(this.autoSyncIntervalId);
          this.autoSyncIntervalId = null;
        }
      } catch(_) {}
      try { if (window.Store && Store.clearLoggedUser) Store.clearLoggedUser(); } catch(_) {}
      this.isLoggedIn = false;
      if (window.location.hash !== '#login') window.location.hash = '#login';
      if (hasMessage) setTimeout(() => alert(message), 60);
      if (!originalForceLogout) return;
    };

    if (window.Store && Store.setLoggedUser && !Store.__ccResetSessionFlagsPatched) {
      Store.__ccResetSessionFlagsPatched = true;
      const oldSetLoggedUser = Store.setLoggedUser.bind(Store);
      Store.setLoggedUser = function(){
        if (window.App) {
          App.sessionLogoutInProgress = false;
          App.sessionAlertShown = false;
        }
        return oldSetLoggedUser.apply(this, arguments);
      };
    }
  }

  function patchClientVisibility(){
    if (!window.UI || UI.__ccFinalClientVisibilityPatched) return;
    UI.__ccFinalClientVisibilityPatched = true;

    const baseRenderClients = UI.renderClients ? UI.renderClients.bind(UI) : null;
    UI.renderClients = function(input){
      const source = Array.isArray(input) ? input : ((window.Store && Store.getAllClients && Store.getAllClients()) || (window.Store && Store.getClients && Store.getClients()) || []);
      return baseRenderClients ? baseRenderClients(clientsForMainList(source)) : undefined;
    };

    const baseRenderApprovals = UI.renderApprovals ? UI.renderApprovals.bind(UI) : null;
    UI.renderApprovals = function(input){
      const source = Array.isArray(input) ? input : ((window.Store && Store.getAllClients && Store.getAllClients()) || (window.Store && Store.getClients && Store.getClients()) || []);
      const filtered = clientsForApprovalQueue(source);
      return baseRenderApprovals ? baseRenderApprovals(filtered) : undefined;
    };

    const oldApply = UI.applyPermissions ? UI.applyPermissions.bind(UI) : null;
    UI.applyPermissions = function(){
      if (oldApply) oldApply();
      const allowed = canApproveClients(user());
      ['tab-client-approvals','tab-client-approvals-queue'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = allowed ? '' : 'none';
      });
      const approvalNav = document.querySelector('.nav-link[href="#aprovacao"], .mobile-nav-item[href="#aprovacao"]');
      if (approvalNav) approvalNav.style.display = allowed ? '' : 'none';
      if (!allowed && window.location.hash === '#aprovacao') window.location.hash = '#clientes';
    };
  }

  function patchStoreRoutes(){
    if (!window.Store || Store.__ccFinalApprovalRoutesPatched) return;
    Store.__ccFinalApprovalRoutesPatched = true;
    const oldRoutes = Store.getUserAllowedRoutes ? Store.getUserAllowedRoutes.bind(Store) : null;
    Store.getUserAllowedRoutes = function(u){
      let routes = oldRoutes ? (oldRoutes(u) || []) : ['#dashboard'];
      routes = Array.from(new Set(routes));
      if (u && !routes.includes('#clientes')) routes.push('#clientes');
      if (canApproveClients(u)) {
        if (!routes.includes('#aprovacao')) routes.push('#aprovacao');
      } else {
        routes = routes.filter(r => r !== '#aprovacao');
      }
      return routes;
    };
  }

  async function ensureFreshClients(){
    try {
      if (window.Store && Store.syncAllFromBackend) await Store.syncAllFromBackend({ forceRemote: true });
    } catch(_) {}
  }

  function injectCorrectionPhotoPreview(client){
    const form = document.getElementById('client-form');
    if (!form || !client) return;
    document.getElementById('client-correction-photo-preview')?.remove();
    const photos = [
      ['Fachada', client.photoFachada],
      ['Interna 1', client.photoInterna01],
      ['Interna 2', client.photoInterna02],
      ['Interna 3', client.photoInterna03],
      ['Rua 1', client.photoRua01],
      ['Rua 2', client.photoRua02],
      ['CNPJ', client.photoCnpj]
    ].filter(([,src]) => !!src);
    const box = document.createElement('div');
    box.id = 'client-correction-photo-preview';
    box.style.cssText = 'border:1px solid var(--border-color);background:rgba(37,99,235,.06);border-radius:10px;padding:12px;margin:12px 0;';
    box.innerHTML = `<strong style="display:block;color:var(--primary-light);margin-bottom:8px;">Fotos atuais do cadastro</strong>` +
      (photos.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;">${photos.map(([label,src]) => `<div style="border:1px solid var(--border-color);border-radius:8px;padding:6px;background:rgba(15,23,42,.55);"><div style="font-size:.72rem;color:var(--text-muted);margin-bottom:5px;">${esc(label)}</div><img src="${esc(src)}" alt="${esc(label)}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;"></div>`).join('')}</div><p style="font-size:.72rem;color:var(--text-muted);margin-top:8px;">Se não escolher uma nova foto, a foto atual será mantida.</p>` : `<p style="font-size:.78rem;color:var(--text-muted);margin:0;">Este cadastro não possui fotos salvas ou elas ainda não sincronizaram. Ao reenviar, novas fotos podem ser anexadas normalmente.</p>`);
    const alertBox = document.getElementById('client-correction-alert');
    if (alertBox) alertBox.insertAdjacentElement('afterend', box);
    else form.prepend(box);
  }

  function patchCorrectionOpen(){
    if (!window.App || App.__ccFinalCorrectionOpenPatched) return;
    App.__ccFinalCorrectionOpenPatched = true;
    const oldEdit = App.editClientCorrection ? App.editClientCorrection.bind(App) : null;

    App.openClientCorrectionFromNotification = async function(notificationId, clientId){
      try { if (notificationId) await App.fetchFromApi(`/api/notificacoes/${encodeURIComponent(notificationId)}/read`, { method:'PUT' }).catch(()=>{}); } catch(_) {}
      await ensureFreshClients();
      const clients = (window.Store && Store.getAllClients && Store.getAllClients()) || [];
      let client = clients.find(c => String(c.id || c.cnpj || c.codigo || '') === String(clientId));
      if (!client) {
        client = clients.find(c => isOwner(c, user()) && isCorrection(c));
      }
      if (!client) return alert('Não encontrei este cadastro para correção. Atualize a tela e tente novamente.');
      if (!isOwner(client, user()) && !canApproveClients(user())) return alert('Somente o vendedor que cadastrou pode corrigir este cadastro.');
      if (oldEdit) oldEdit(client.id || client.cnpj || client.codigo);
      setTimeout(() => injectCorrectionPhotoPreview(client), 900);
    };

    if (oldEdit) {
      App.editClientCorrection = function(id){
        const clients = (window.Store && Store.getAllClients && Store.getAllClients()) || [];
        const client = clients.find(c => String(c.id || c.cnpj || c.codigo || '') === String(id) || String(c.cnpj || '') === String(id) || String(c.codigo || '') === String(id));
        const realId = client && client.id ? client.id : id;
        const result = oldEdit(realId);
        setTimeout(() => injectCorrectionPhotoPreview(client), 900);
        return result;
      };
    }

    const oldOpenNotification = App.openNotification ? App.openNotification.bind(App) : null;
    App.openNotification = async function(id, hash){
      let notif = null;
      try {
        const list = await App.fetchFromApi('/api/notificacoes');
        notif = (list || []).find(n => String(n.id) === String(id));
      } catch(_) {}
      const txt = norm(`${notif?.title || ''} ${notif?.body || ''}`);
      const isClientCorrection = notif && norm(notif.module).includes('cliente') && (txt.includes('correc') || txt.includes('reprov') || txt.includes('ajuste'));
      if (isClientCorrection && notif.record_id) {
        return App.openClientCorrectionFromNotification(id, notif.record_id);
      }
      if (oldOpenNotification) return oldOpenNotification(id, hash);
      try { await App.fetchFromApi(`/api/notificacoes/${encodeURIComponent(id)}/read`, { method:'PUT' }); } catch(_) {}
      if (hash) window.location.hash = hash;
    };
  }

  function enhanceNotificationButtons(){
    const box = document.getElementById('notif-page-list');
    if (!box) return;
    box.querySelectorAll('button[onclick*="App.openNotification"]').forEach(btn => {
      const card = btn.closest('div[style]') || btn.parentElement;
      const txt = norm(card ? card.textContent : '');
      if ((txt.includes('correc') || txt.includes('reprov') || txt.includes('ajuste')) && !btn.dataset.ccCorrectionLabel) {
        btn.dataset.ccCorrectionLabel = '1';
        btn.textContent = 'Corrigir';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-warning');
      }
    });
  }

  function patchRejectionModalLabels(){
    const title = document.querySelector('#modal-rejection-reason h3');
    if (title) title.textContent = 'Reprovar ou devolver cadastro para correção';
    const help = document.querySelector('#modal-rejection-reason p');
    if (help) help.textContent = 'Informe o motivo. Marcando correção, o vendedor receberá uma notificação e poderá editar o formulário preenchido para reenviar.';
    const check = document.getElementById('modal-rejection-send-to-correction');
    if (check && !check.dataset.ccDefaultChecked) {
      check.dataset.ccDefaultChecked = '1';
      check.checked = true;
    }
  }

  function refreshVisibleLists(){
    try {
      const all = (window.Store && Store.getAllClients && Store.getAllClients()) || [];
      if (window.UI && UI.renderClients) UI.renderClients(all);
      if (window.UI && UI.renderApprovals) UI.renderApprovals(all);
      if (window.UI && UI.applyPermissions) UI.applyPermissions();
    } catch(_) {}
  }

  function start(){
    patchSessionAlert();
    patchStoreRoutes();
    patchClientVisibility();
    patchCorrectionOpen();
    patchRejectionModalLabels();
    enhanceNotificationButtons();
  }

  start();
  document.addEventListener('DOMContentLoaded', () => { start(); setTimeout(refreshVisibleLists, 600); });
  window.addEventListener('hashchange', () => setTimeout(() => { start(); refreshVisibleLists(); }, 120));
  setInterval(() => { start(); enhanceNotificationButtons(); }, 1200);
})();
