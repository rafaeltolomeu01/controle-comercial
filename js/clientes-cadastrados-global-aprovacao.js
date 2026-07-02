/*
  Correção controlada - clientes cadastrados globais + fila de aprovação restrita.
  Não altera layout geral. Apenas garante que cadastros feitos por qualquer usuário
  apareçam para todos e que a aprovação continue restrita.
*/
(function(){
  'use strict';
  if (window.__ccClientesCadastradosGlobalPatch) return;
  window.__ccClientesCadastradosGlobalPatch = true;

  const DATA_PREFIX = 'controle_campo_db_';
  const GLOBAL_CLIENTS_KEY = DATA_PREFIX + 'global_clients';

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const itemKey = (item, idx, prefix) => String(item && (item.id || item.codigo || item.cnpj || item.cpf || item.name || item.companyName) || `${prefix || 'row'}-${idx}`);

  function mergeLists() {
    const map = new Map();
    Array.from(arguments).forEach((list, listIdx) => {
      if (!Array.isArray(list)) return;
      list.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const key = itemKey(item, idx, 'client');
        const prev = map.get(key) || {};
        map.set(key, Object.assign({}, prev, item));
      });
    });
    return Array.from(map.values()).filter(c => c && !c.deleted && !c.excluido && c.active !== false);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function collectLocalClients() {
    const lists = [];
    const global = readJson(GLOBAL_CLIENTS_KEY, []);
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DATA_PREFIX) || !key.endsWith('_clients') || key === GLOBAL_CLIENTS_KEY) continue;
      const parsed = readJson(key, []);
      if (Array.isArray(parsed) && parsed.length) lists.push(parsed);
    }
    if (Array.isArray(global) && global.length) lists.push(global);
    return mergeLists.apply(null, lists);
  }

  function saveGlobalClients(list) {
    const clean = mergeLists(list || []);
    writeJson(GLOBAL_CLIENTS_KEY, clean);
    return clean;
  }

  function canApproveClients(user) {
    user = user || (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
    const profile = norm(user.profile);
    const perms = Array.isArray(user.permissions) ? user.permissions.map(norm) : [];
    const roles = ['administrador','admin','administrador sistema','administrador geral','supervisor','gerente','responsavel equipamentos','responsavel por equipamentos'];
    const allowedPerms = ['administrador','admin','equipamentos','estoque','movimentacao','movimentacao de equipamentos','liberacao de equipamento','liberacao de equipamentos','aprovacao de clientes'];
    return roles.includes(profile) || perms.some(p => allowedPerms.includes(p));
  }

  function installStorePatch() {
    if (!window.Store || Store.__clientesGlobalCadastradosPatched) return;
    Store.__clientesGlobalCadastradosPatched = true;
    Store.canApproveClients = canApproveClients;

    const originalSync = Store.syncAllFromBackend ? Store.syncAllFromBackend.bind(Store) : null;
    const originalAllowed = Store.getUserAllowedRoutes ? Store.getUserAllowedRoutes.bind(Store) : null;

    Store.getAllClients = function() {
      const local = collectLocalClients();
      if (local.length) saveGlobalClients(local);
      return local;
    };

    Store.getClients = function() {
      return this.getAllClients ? this.getAllClients() : collectLocalClients();
    };

    Store.saveClients = function(data) {
      const incoming = Array.isArray(data) ? data : [];
      const current = collectLocalClients();
      const merged = mergeLists(current, incoming);
      saveGlobalClients(merged);
      if (this.saveToBackend) this.saveToBackend('clients', merged);
      return true;
    };

    Store.deleteClient = async function(id) {
      const sid = String(id);
      const next = collectLocalClients().filter(c => String(c && c.id) !== sid);
      saveGlobalClients(next);
      // Remove também caches antigos por usuário para o registro não voltar na próxima sincronização.
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(DATA_PREFIX) || !key.endsWith('_clients')) continue;
        const list = readJson(key, []);
        if (!Array.isArray(list)) continue;
        writeJson(key, list.filter(c => String(c && c.id) !== sid));
      }
      try {
        if (this.backendRequest) await this.backendRequest('/api/clientes/' + encodeURIComponent(sid), { method: 'DELETE' });
      } catch (err) {
        console.error('Erro ao excluir cliente no backend:', err);
      }
    };

    Store.syncAllFromBackend = async function(options) {
      let ok = true;
      if (originalSync) ok = await originalSync(options);
      try {
        const localBefore = collectLocalClients();
        if (this.backendRequest && this.getToken && this.getToken()) {
          const response = await this.backendRequest('/api/store/clients');
          const remote = response && Array.isArray(response.data) ? response.data : [];
          const merged = mergeLists(remote, localBefore);
          saveGlobalClients(merged);
          if (localBefore.length && merged.length >= remote.length && merged.length !== remote.length && this.saveToBackend) {
            this.saveToBackend('clients', merged);
          }
        } else if (localBefore.length) {
          saveGlobalClients(localBefore);
        }
      } catch (err) {
        console.warn('Falha ao sincronizar clientes cadastrados globais:', err.message || err);
      }
      return ok;
    };

    Store.getUserAllowedRoutes = function(user) {
      let routes = originalAllowed ? (originalAllowed(user) || []) : ['#dashboard'];
      routes = Array.from(new Set(routes));
      if (user && !routes.includes('#clientes')) routes.push('#clientes');
      if (!canApproveClients(user)) {
        routes = routes.filter(r => r !== '#aprovacao');
      } else if (user && !routes.includes('#aprovacao')) {
        routes.push('#aprovacao');
      }
      return routes;
    };
  }

  function installUiPatch() {
    if (!window.UI || !window.Store || UI.__clientesGlobalRenderPatched) return;
    UI.__clientesGlobalRenderPatched = true;
    const originalApplyPermissions = UI.applyPermissions ? UI.applyPermissions.bind(UI) : null;

    UI.applyPermissions = function() {
      if (originalApplyPermissions) originalApplyPermissions();
      const user = Store.getLoggedUser && Store.getLoggedUser();
      const allowed = canApproveClients(user);
      ['tab-client-approvals','tab-client-approvals-queue'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = allowed ? 'flex' : 'none';
      });
      if (!allowed && window.location.hash === '#aprovacao') {
        window.location.hash = '#clientes';
      }
    };

    UI.renderClients = function(clients) {
      const body = document.getElementById('clients-table-body');
      if (!body) return;
      let list = Array.isArray(clients) ? clients.slice() : (Store.getAllClients ? Store.getAllClients() : []);
      const activeUnitId = Store.getActiveUnitId && Store.getActiveUnitId();
      if (activeUnitId && activeUnitId !== 'all') list = list.filter(c => String(c.unitId || '') === String(activeUnitId));
      list = list.filter(c => c && !c.deleted && !c.excluido && c.active !== false);

      const sellerName = (id) => (window.UI && UI.getUserName ? UI.getUserName(id) : (id || '-'));
      const scoreText = (c) => {
        const score = c.score ?? '';
        const cls = c.classification || c.scoreClassification || '';
        return `${score !== '' ? 'Score ' + esc(score) : 'Score -'}${cls ? ' • ' + esc(cls) : ''}`;
      };
      const isAdmin = UI.isAdminUser ? UI.isAdminUser(Store.getLoggedUser()) : canApproveClients(Store.getLoggedUser());

      body.innerHTML = list.map(c => {
        const adminBtn = isAdmin ? `<button class="btn btn-danger btn-xs" onclick="event.stopPropagation(); App.deleteClientAdmin ? App.deleteClientAdmin('${esc(c.id)}') : App.deleteClient('${esc(c.id)}', event)">Apagar</button>` : '';
        return `<tr class="cliente-compact-row mobile-summary-row" onclick="App.showClientDetails('${esc(c.id)}')"><td colspan="10"><div class="cliente-compact-card"><div class="cliente-compact-main"><div class="cliente-compact-name">${esc(c.name || c.nomeFantasia || c.companyName || 'Cliente sem nome')}</div><div class="cliente-compact-meta">${esc(sellerName(c.userId))} • ${esc(c.date || c.data_cadastro || c.created_at || c.createdAt || '-')} • ${scoreText(c)}</div></div><div class="cliente-compact-actions"><button class="btn btn-primary btn-xs" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button>${adminBtn}</div></div></td></tr>`;
      }).join('') || `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:12px;">Nenhum cliente cadastrado.</td></tr>`;
    };

    UI.renderApprovals = function(clients) {
      const body = document.getElementById('approvals-table-body');
      if (!body) return;
      const user = Store.getLoggedUser && Store.getLoggedUser();
      const allowed = canApproveClients(user);
      if (!allowed) {
        body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:14px;">Fila de aprovação restrita ao administrador ou responsáveis por equipamentos.</td></tr>`;
        return;
      }
      let list = Array.isArray(clients) ? clients.slice() : (Store.getAllClients ? Store.getAllClients() : []);
      const activeUnitId = Store.getActiveUnitId && Store.getActiveUnitId();
      if (activeUnitId && activeUnitId !== 'all') list = list.filter(c => String(c.unitId || '') === String(activeUnitId));
      const pending = list.filter(c => c && (c.status === 'Pendente' || c.status === 'Aguardando Ajuste'));
      if (!pending.length) {
        body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:14px;">Nenhum cadastro pendente de aprovação.</td></tr>`;
        return;
      }
      body.innerHTML = pending.map(c => {
        const badge = c.status === 'Aguardando Ajuste'
          ? `<span class="badge-status badge-primary" style="font-size:0.7rem;">Aguardando Ajuste</span>`
          : `<span class="badge-status badge-warning" style="font-size:0.7rem;">Pendente</span>`;
        return `<tr class="mobile-summary-row" onclick="App.showClientDetails('${esc(c.id)}')">
          <td data-label="Cliente" style="font-weight:600;">${esc(c.name || c.companyName || '-')}</td>
          <td data-label="CNPJ">${esc(c.cnpj || '-')}</td>
          <td data-label="Telefone">${esc(c.phone || '-')}</td>
          <td data-label="E-mail">${esc(c.email || '-')}</td>
          <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:0.7rem;font-weight:500;">${esc(UI.getUnitName ? UI.getUnitName(c.unitId) : c.unitId || '-')}</span></td>
          <td data-label="Vendedor"><span style="font-size:0.75rem;color:var(--text-muted);">${esc(UI.getUserName ? UI.getUserName(c.userId) : c.userId || '-')}</span></td>
          <td data-label="Score">${esc(UI.formatClientScore ? UI.formatClientScore(c) : (c.score || '-'))}</td>
          <td data-label="Status">${badge}</td>
          <td data-label="Ações">
            <button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:0.75rem;margin-right:4px;" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button>
            <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveClient('${esc(c.id)}', 'Aprovado')">Aprovar</button>
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.approveClient('${esc(c.id)}', 'Reprovado')">Reprovar</button>
          </td>
        </tr>`;
      }).join('');
    };
  }

  function installAppPatch() {
    if (!window.App || App.__clientesGlobalAppPatched) return;
    App.__clientesGlobalAppPatched = true;
    const oldApprove = App.approveClient && App.approveClient.bind(App);
    App.approveClient = function(id, newStatus) {
      const user = Store.getLoggedUser && Store.getLoggedUser();
      if (!canApproveClients(user)) {
        alert('Somente administrador ou responsável por equipamentos pode aprovar/reprovar clientes.');
        return;
      }
      if (oldApprove) return oldApprove(id, newStatus);
    };
  }

  function start() {
    installStorePatch();
    installUiPatch();
    installAppPatch();
    if (window.Store && Store.getAllClients) Store.getAllClients();
  }

  start();
  document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('hashchange', () => setTimeout(start, 50));
  setInterval(start, 2500);
})();
