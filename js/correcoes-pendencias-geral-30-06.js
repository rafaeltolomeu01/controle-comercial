/* Correções gerais 30/06 - permissões, notificações, correções pendentes e estabilidade */
(function(){
  'use strict';
  if (window.__ccPendenciasGeral3006) return;
  window.__ccPendenciasGeral3006 = true;

  const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const user = () => (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
  const perms = () => Array.isArray(user().permissions) ? user().permissions : [];
  const isAdmin = () => norm(user().profile) === 'administrador' || perms().some(p => norm(p).includes('administrador'));
  const hasPerm = (...names) => {
    if (isAdmin()) return true;
    const p = perms().map(norm);
    const role = norm(user().profile);
    return names.some(n => role === norm(n) || p.includes(norm(n)) || p.some(x => x.includes(norm(n))));
  };
  const api = (url, options={}) => (window.App && App.fetchFromApi) ? App.fetchFromApi(url, options) : fetch(url, {headers:{'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('authToken')}, ...options}).then(r=>r.json());

  function ensurePermissionOptions(){
    const checks = Array.from(document.querySelectorAll('.perm-checkbox')).map(cb => cb.value);
    const firstAdmin = document.querySelector('.perm-checkbox[value="Administrador"]')?.closest('label');
    const parent = firstAdmin?.parentElement || document.querySelector('#modal-user-permissions .modal-body') || document.querySelector('#modal-user-permissions');
    if (!parent) return;
    const add = (value, label) => {
      if (checks.includes(value) || document.querySelector(`.perm-checkbox[value="${CSS.escape(value)}"]`)) return;
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;min-height:32px;';
      wrap.innerHTML = `<input type="checkbox" class="perm-checkbox" value="${value}" style="width:18px;height:18px;cursor:pointer;"><span>${label}</span>`;
      parent.insertBefore(wrap, firstAdmin || null);
    };
    add('Simulador de Troca', 'Simulador de Troca');
    add('Confirmação de Troca', 'Confirmação de Troca');
    add('Movimentação', 'Movimentação de Equipamentos');
  }

  function applyQuickPermissions(){
    const map = [
      ['#dashboard .quick-actions-grid button[onclick*="prospeccao"]', ['Prospecção','Leads']],
      ['#dashboard .quick-actions-grid button[onclick*="clientes"]', ['Clientes']],
      ['#dashboard .quick-actions-grid button[onclick*="chamados"]', ['Chamados','Chamados Mecânicos']],
      ['#dashboard .quick-actions-grid button[onclick*="despesas"]', ['Despesas','Despesas de Campo']],
      ['.quick-actions-grid button[onclick*="simulador-troca"]', ['Simulador de Troca']],
      ['.quick-actions-grid button[onclick*="movimentacao"]', ['Movimentação','Equipamentos']]
    ];
    map.forEach(([sel, names]) => document.querySelectorAll(sel).forEach(el => { el.style.display = hasPerm(...names) ? '' : 'none'; }));
  }

  function addCorrectionButtons(){
    document.querySelectorAll('tr').forEach(tr => {
      const txt = norm(tr.textContent);
      if (!txt.includes('correcao solicitada') || tr.querySelector('.cc-btn-corrigir-despesa')) return;
      const idMatch = tr.innerHTML.match(/(DP-[0-9A-Za-z-]+)/) || tr.textContent.match(/(DP-[0-9A-Za-z-]+)/);
      let id = idMatch && idMatch[1];
      const details = tr.querySelector('button[onclick*="showExpense"],button[onclick*="Detalhes"],button[onclick*="Ver Detalhes"]');
      if (!id) {
        const onclick = details?.getAttribute('onclick') || '';
        const m = onclick.match(/['"]([^'"]*DP-[^'"]+)['"]/); id = m && m[1];
      }
      const cell = tr.querySelector('td:last-child') || tr;
      const btn = document.createElement('button');
      btn.className = 'btn btn-warning btn-sm cc-btn-corrigir-despesa';
      btn.type = 'button';
      btn.textContent = 'Corrigir Despesa';
      btn.style.marginLeft = '6px';
      btn.onclick = (e) => { e.stopPropagation(); App.correctExpenseAndResubmit(id); };
      cell.appendChild(btn);
    });
  }

  if (window.App && !App.correctExpenseAndResubmit) {
    App.correctExpenseAndResubmit = async function(id){
      if (!id) return alert('Não foi possível identificar a despesa. Abra os detalhes e tente novamente.');
      try {
        const current = await api(`/api/despesas-reembolsos/${encodeURIComponent(id)}`);
        const novoValor = prompt('Valor corrigido da despesa:', current.value || current.valor || '');
        if (novoValor === null) return;
        const obs = prompt('Observação da correção:', current.observation || '') || '';
        await api(`/api/despesas-reembolsos/${encodeURIComponent(id)}/correct`, {
          method: 'PUT',
          body: JSON.stringify({ value: novoValor, observation: obs })
        });
        alert('Despesa corrigida e reenviada para aprovação.');
        if (App.loadExpenses) await App.loadExpenses();
        if (window.UI && UI.renderDashboard) UI.renderDashboard();
      } catch (err) {
        alert('Erro ao corrigir despesa: ' + (err.message || err.error || err));
      }
    };
  }

  async function setupNotifications(){
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const keyResp = await api('/api/push/vapid-public-key').catch(()=>({publicKey:''}));
      if (keyResp && keyResp.publicKey && 'PushManager' in window) {
        const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (permission === 'granted') {
          const existing = await reg.pushManager.getSubscription();
          const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(keyResp.publicKey) });
          await api('/api/push/subscribe', { method:'POST', body: JSON.stringify({ subscription: sub }) });
        }
      }
    } catch (err) { console.warn('Push não habilitado neste ambiente:', err.message); }
  }
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)));
  }

  let lastNotifIds = new Set();
  async function pollNotifications(){
    try {
      const list = await api('/api/notificacoes');
      renderNotifications(list || []);
      (list || []).filter(n => !n.read).slice(0,5).forEach(n => {
        if (!lastNotifIds.has(n.id) && window.Notification && Notification.permission === 'granted') {
          new Notification(n.title || 'Controle de Campo', { body: n.body || '', tag: 'cc-'+n.id });
        }
        lastNotifIds.add(n.id);
      });
    } catch (_) {}
  }
  function renderNotifications(list){
    const unread = (list || []).filter(n => !n.read);
    let box = document.getElementById('cc-notifications-box');
    const dashboard = document.querySelector('#view-dashboard .view-content, #dashboard, .dashboard-content, main');
    if (!dashboard) return;
    if (!box) {
      box = document.createElement('div');
      box.id = 'cc-notifications-box';
      box.className = 'card';
      box.style.cssText = 'margin:16px 0;border-color:rgba(37,99,235,.35);';
      dashboard.prepend(box);
    }
    if (!unread.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = `<div class="card-header"><span class="card-title">Notificações pendentes (${unread.length})</span></div>` + unread.slice(0,6).map(n => `
      <div style="padding:10px 0;border-top:1px solid var(--border-color);display:flex;gap:10px;justify-content:space-between;align-items:flex-start;">
        <div><strong>${escapeHtml(n.title)}</strong><div style="color:var(--text-muted);font-size:.9rem;">${escapeHtml(n.body || '')}</div></div>
        <button class="btn btn-primary btn-sm" onclick="App.openNotification(${n.id}, '${escapeAttr(n.target_hash || '')}')">Abrir</button>
      </div>`).join('');
  }
  function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(v){ return String(v ?? '').replace(/'/g, '\\&#39;'); }
  if (window.App && !App.openNotification) {
    App.openNotification = async function(id, hash){
      await api(`/api/notificacoes/${id}/read`, { method:'PUT' }).catch(()=>{});
      if (hash) window.location.hash = hash;
      setTimeout(pollNotifications, 400);
    };
  }


  if (window.Store && Store.getUserAllowedRoutes && !Store.__ccRoutesPerm3006) {
    const oldRoutes = Store.getUserAllowedRoutes.bind(Store);
    Store.__ccRoutesPerm3006 = true;
    Store.getUserAllowedRoutes = function(u){
      const routes = oldRoutes(u) || ['#dashboard'];
      const pp = Array.isArray(u && u.permissions) ? u.permissions.map(norm) : [];
      const admin = norm(u && u.profile) === 'administrador' || pp.some(x => x.includes('administrador'));
      const allowSim = admin || pp.includes('simulador de troca');
      const clean = routes.filter(r => allowSim || r !== '#simulador-troca');
      if (allowSim && !clean.includes('#simulador-troca')) clean.push('#simulador-troca');
      return clean;
    };
  }

  const oldRenderDashboard = window.UI && UI.renderDashboard;
  if (oldRenderDashboard && !UI.__ccPermDash3006) {
    UI.__ccPermDash3006 = true;
    UI.renderDashboard = function(){ const ret = oldRenderDashboard.apply(this, arguments); setTimeout(()=>{applyQuickPermissions(); pollNotifications();},50); return ret; };
  }
  const oldOpenPerm = window.App && App.openUserPermissionsModal;
  if (oldOpenPerm && !App.__ccOpenPerm3006) {
    App.__ccOpenPerm3006 = true;
    App.openUserPermissionsModal = async function(){ const ret = await oldOpenPerm.apply(this, arguments); ensurePermissionOptions(); return ret; };
  }

  document.addEventListener('DOMContentLoaded', () => { ensurePermissionOptions(); applyQuickPermissions(); setupNotifications(); setTimeout(pollNotifications, 800); setInterval(pollNotifications, 60000); });
  window.addEventListener('hashchange', () => setTimeout(()=>{ ensurePermissionOptions(); applyQuickPermissions(); addCorrectionButtons(); pollNotifications(); }, 250));
  new MutationObserver(() => { applyQuickPermissions(); addCorrectionButtons(); ensurePermissionOptions(); }).observe(document.documentElement, { childList:true, subtree:true });
})();
