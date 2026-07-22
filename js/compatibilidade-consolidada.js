/* Compatibilidade consolidada - gerado em 09/07/2026. Mantem as correcoes historicas em uma unica entrada de script. */


/* ===== final-updates-29-06.js ===== */

/* ============================================================
   Atualizações 01-13 - Correções pontuais sem alterar estrutura
   ============================================================ */
(function(){
  if (window.__ccUpdates_2906_round2) return;
  window.__ccUpdates_2906_round2 = true;

  const money = (v) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(Number(v)||0);
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    let raw = String(v).trim().replace(/[^0-9,.-]/g,'');
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',','.');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  window.CC_num = num;
  window.CC_money = money;

  function isAdmin(user){
    user = user || (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return user.profile === 'Administrador' || perms.includes('Administrador');
  }
  function userUnitId(user){ return String((user||{}).unitId || (user||{}).unit_id || 'all'); }
  function allowedUnitsFor(user){
    const units = (window.Store && Store.getUnits ? Store.getUnits() : []) || [];
    user = user || (Store.getLoggedUser ? Store.getLoggedUser() : {});
    if (isAdmin(user) || userUnitId(user) === 'all') return units;
    return units.filter(u => String(u.id) === userUnitId(user));
  }
  function getUnitById(id){ return ((Store.getUnits && Store.getUnits())||[]).find(u => String(u.id) === String(id)); }
  function getCurrentUnit(){
    const user = Store.getLoggedUser ? Store.getLoggedUser() : {};
    const active = Store.getActiveUnitId ? Store.getActiveUnitId() : userUnitId(user);
    return getUnitById(active !== 'all' ? active : userUnitId(user)) || allowedUnitsFor(user)[0] || {};
  }
  function roleKey(profile){
    const p = String(profile || '').toLowerCase();
    if (p.includes('gerente')) return 'gerente';
    if (p.includes('supervisor')) return 'supervisor';
    return 'vendedor';
  }
  function getDailyRate(unit, profile){
    unit = unit || getCurrentUnit();
    const key = roleKey(profile || (Store.getLoggedUser()||{}).profile);
    const cfg = unit.travelConfig || unit.financeConfig || {};
    return num(unit['diaria_'+key] ?? cfg['daily_'+key] ?? cfg[key] ?? unit['daily_'+key] ?? (key==='gerente' ? 180 : key==='supervisor' ? 150 : 120));
  }
  function maxNights(unit){
    const cfg = (unit||{}).travelConfig || (unit||{}).financeConfig || {};
    const v = parseInt((unit||{}).maximo_diarias ?? cfg.maxNights ?? (unit||{}).maxNights ?? 4, 10);
    return Number.isFinite(v) && v > 0 ? v : 4;
  }
  window.CC_getDailyRate = getDailyRate;

  // 01 - Limpa dados temporários de formulários por login/rota/envio.
  const transientKeys = ['prospect','cliente','client','mov','ticket','despesa','saldo','simulador','exchange'];
  function clearTemporaryFormCache(){
    try {
      Object.keys(localStorage).forEach(k => {
        const lk = k.toLowerCase();
        if ((lk.includes('draft') || lk.includes('rascunho') || lk.includes('form')) && transientKeys.some(t => lk.includes(t))) localStorage.removeItem(k);
      });
      Object.keys(sessionStorage).forEach(k => {
        const lk = k.toLowerCase();
        if ((lk.includes('draft') || lk.includes('rascunho') || lk.includes('form')) && transientKeys.some(t => lk.includes(t))) sessionStorage.removeItem(k);
      });
    } catch(e) {}
  }
  function markFormsNoAutocomplete(){
    document.querySelectorAll('form').forEach(f => f.setAttribute('autocomplete','off'));
  }
  document.addEventListener('submit', (e) => {
    const id = (e.target && e.target.id || '').toLowerCase();
    // Fotos podem estar sendo enviadas: o fluxo da movimentação limpa o
    // formulário somente depois da confirmação de gravação do servidor.
    if (id === 'movement-form') return;
    if (/prospect|client|cliente|mov|ticket|despesa|saldo|simulador|exchange/.test(id) && !/user|usuario|unit|config|login/.test(id)) {
      setTimeout(() => {
        if (!document.body.contains(e.target)) return;
        try { e.target.reset(); } catch(_){ }
        e.target.querySelectorAll('input[type=file]').forEach(i => i.value = '');
        clearTemporaryFormCache();
      }, 900);
    }
  }, true);
  window.addEventListener('hashchange', () => { clearTemporaryFormCache(); setTimeout(markFormsNoAutocomplete, 200); });

  // 02 - PWA instalável (registro seguro do service worker existente).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
  }

  // 07 - Permissões estritas: se houver checkboxes salvos, não liberar módulos por perfil.
  if (window.Store) {
    Store.getUserAllowedRoutes = function(user){
      if (!user) return ['#dashboard'];
      const perms = Array.isArray(user.permissions) ? user.permissions : [];
      if (isAdmin(user)) return ['#dashboard','#prospeccao','#clientes','#aprovacao','#equipamentos','#movimentacao','#chamados','#despesas','#solicitacao-despesas','#despesas-dashboard','#unidades','#usuarios','#empresa','#configuracoes','#pdf','#simulador-troca','#historico-exclusoes'];
      const add = (arr, ...xs) => xs.forEach(x => { if (!arr.includes(x)) arr.push(x); });
      const allowed = ['#dashboard','#pdf'];
      if (perms.length > 0) {
        if (perms.includes('Painel Geral')) add(allowed, '#dashboard');
        if (perms.includes('Prospecção') || perms.includes('Prospecção (Leads)')) add(allowed, '#prospeccao');
        if (perms.includes('Clientes')) add(allowed, '#clientes');
        if (perms.includes('Equipamentos') || perms.includes('Estoque')) add(allowed, '#equipamentos','#movimentacao');
        if (perms.includes('Chamados') || perms.includes('Chamados Mecânicos')) add(allowed, '#chamados');
        if (perms.includes('Despesas') || perms.includes('Despesas de Campo')) add(allowed, '#despesas');
        if (perms.includes('Solicitação de Saldo')) add(allowed, '#solicitacao-despesas','#despesas');
        if (perms.includes('Aprovação de Saldo') || perms.includes('Aprovação de Despesas') || perms.includes('Financeiro')) add(allowed, '#despesas-dashboard','#despesas','#solicitacao-despesas');
        if (perms.includes('Simulador de Troca')) add(allowed, '#simulador-troca');
        if (perms.includes('Usuários') || perms.includes('Usuários e Permissões')) add(allowed, '#usuarios');
        if (perms.includes('Configurações') || perms.includes('Configurações Gerais')) add(allowed, '#configuracoes','#empresa','#unidades');
        return allowed;
      }
      if (user.profile === 'Financeiro') add(allowed,'#despesas','#solicitacao-despesas','#despesas-dashboard');
      if (user.profile === 'Vendedor') add(allowed,'#prospeccao','#clientes','#movimentacao','#chamados','#despesas','#solicitacao-despesas','#simulador-troca');
      if (user.profile === 'Supervisor' || user.profile === 'Gerente') add(allowed,'#prospeccao','#clientes','#aprovacao','#equipamentos','#movimentacao','#chamados','#despesas','#solicitacao-despesas','#despesas-dashboard','#usuarios','#simulador-troca');
      if (user.profile === 'Mecânico') add(allowed,'#chamados');
      if (user.profile === 'Responsável Equipamentos') add(allowed,'#equipamentos','#movimentacao','#chamados');
      return allowed;
    };
    const oldSet = Store.setLoggedUser ? Store.setLoggedUser.bind(Store) : null;
    if (oldSet) Store.setLoggedUser = function(user, token){
      clearTemporaryFormCache();
      const clean = Object.assign({}, user || {});
      clean.permissions = Array.isArray(clean.permissions) ? clean.permissions : [];
      oldSet(clean, token);
      if (!isAdmin(clean) && userUnitId(clean) !== 'all' && Store.setActiveUnitId) Store.setActiveUnitId(userUnitId(clean));
    };
    const oldClear = Store.clearLoggedUser ? Store.clearLoggedUser.bind(Store) : null;
    if (oldClear) Store.clearLoggedUser = function(){ clearTemporaryFormCache(); oldClear(); };
  }

  // 08 - Dropdowns de empresas/unidades somente com unidades oficiais e conforme vínculo.
  if (window.UI) {
    UI.populateUnitDropdowns = async function(){
      const user = Store.getLoggedUser ? Store.getLoggedUser() : {};
      const allUnits = Store.getUnits ? Store.getUnits() : [];
      const units = allowedUnitsFor(user);
      const fixed = !isAdmin(user) && userUnitId(user) !== 'all';
      const active = fixed ? userUnitId(user) : (Store.getActiveUnitId ? Store.getActiveUnitId() : 'all');
      const ids = ['prosp-unit','client-unit','ticket-unit','exp-unit','bal-unit','user-unit','ticket-open-unit','perm-user-unit'];
      ids.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const isUserField = id === 'user-unit' || id === 'perm-user-unit';
        const source = isUserField && isAdmin(user) ? allUnits : units;
        sel.innerHTML = (isUserField && isAdmin(user) ? '<option value="all">Todas as Unidades (Geral)</option>' : '<option value="" disabled>Selecione...</option>') + source.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        if (fixed && !isUserField) { sel.value = userUnitId(user); sel.disabled = true; }
        else { sel.disabled = false; if (sel.querySelector(`option[value="${active}"]`)) sel.value = active; }
      });
      const solEmpresa = document.getElementById('sol-empresa');
      if (solEmpresa) {
        solEmpresa.innerHTML = units.map(u => `<option value="${u.name}" data-unit-id="${u.id}">${u.name}</option>`).join('');
        const unit = fixed ? getUnitById(userUnitId(user)) : getCurrentUnit();
        if (unit && unit.name) solEmpresa.value = unit.name;
        solEmpresa.disabled = fixed;
      }
      const global = document.getElementById('global-unit-selector');
      if (global) {
        global.innerHTML = (fixed ? '' : '<option value="all">Todas as Unidades</option>') + units.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        global.value = fixed ? userUnitId(user) : (active || 'all');
        global.disabled = fixed;
      }
      // vendedores/solicitantes só da unidade permitida
      try {
        const users = await (window.App && App.fetchFromApi ? App.fetchFromApi('/api/usuarios').catch(()=>Store.getUsers ? Store.getUsers() : []) : Promise.resolve(Store.getUsers ? Store.getUsers() : []));
        const visibleIds = new Set(units.map(u => String(u.id)));
        const sellers = (users || []).filter(u => (u.status || 'LIBERADO') === 'LIBERADO' && (u.unitId === 'all' || visibleIds.has(String(u.unitId))) && ['Vendedor','Supervisor','Gerente'].includes(u.profile));
        ['prosp-seller','client-seller','ticket-seller','bal-seller','ticket-open-seller'].forEach(id => {
          const sel = document.getElementById(id); if (!sel) return;
          sel.innerHTML = '<option value="" selected disabled>Selecione...</option>' + sellers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        });
      } catch(e) {}
    };
  }


  if (window.App) {
    function getSelectedSolicitacaoUnit() {
      const sel = document.getElementById('sol-empresa');
      if (!sel) return getCurrentUnit();
      const opt = sel.options[sel.selectedIndex];
      const unitId = opt ? opt.getAttribute('data-unit-id') : null;
      if (unitId) return getUnitById(unitId) || getCurrentUnit();
      return getCurrentUnit();
    }

    // 08/09/10 - Solicitação de saldo usa empresa oficial e diária por unidade/perfil.
    App.buildHotelOptions = function(){
      const unit = getSelectedSolicitacaoUnit();
      const user = Store.getLoggedUser ? Store.getLoggedUser() : {};
      const profile = (user.profile || '').toLowerCase();
      const rate = getDailyRate(unit, user.profile);
      const max = maxNights(unit);
      const container = document.querySelector('input[name="sol-noites"]')?.closest('div[style*="grid-template-columns"]');
      if (!container) return;
      const allowNo = (unit.permitir_sem_hospedagem !== false && (unit.travelConfig||{}).allowNoHotel !== false);
      let html = '';
      if (allowNo) html += `<label style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;background:var(--bg-input);"><input type="radio" name="sol-noites" value="0" checked style="margin-bottom:6px;"><span style="font-size:.8rem;font-weight:600;">Sem Hospedagem</span><span style="font-size:.7rem;color:var(--text-muted);">${money(0)}</span></label>`;
      for(let i=1;i<=max;i++) html += `<label style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;background:var(--bg-input);"><input type="radio" name="sol-noites" value="${i}" ${!allowNo&&i===1?'checked':''} style="margin-bottom:6px;"><span style="font-size:.8rem;font-weight:600;">${i} Noite${i>1?'s':''}</span><span style="font-size:.7rem;color:var(--text-muted);">${money(rate*i)}</span></label>`;
      container.innerHTML = html;
      document.getElementsByName('sol-noites').forEach(r => r.addEventListener('change', () => App.updateSolicitacaoTotal()));
    };
    const oldInitSol = App.initSolicitacaoForm ? App.initSolicitacaoForm.bind(App) : null;
    if (oldInitSol) App.initSolicitacaoForm = function(){
      oldInitSol();
      UI.populateUnitDropdowns();

      // Preencher sol-empresa com unidades reais do banco
      const solEmpresa = document.getElementById('sol-empresa');
      if (solEmpresa) {
        const units = Store.getUnits ? Store.getUnits() : [];
        solEmpresa.innerHTML = '<option value="">Selecione uma Empresa...</option>' +
          units.map(u => `<option value="${u.name}" data-unit-id="${u.id}">${u.name}</option>`).join('');
      }

      const user = Store.getLoggedUser() || {};

      // Admin ou usuários com acesso a "Todas as Unidades" (unitId === 'all') podem escolher empresa
      if (solEmpresa) {
        const canChooseUnit = isAdmin(user) || String(user.unitId || '').toLowerCase() === 'all';
        if (canChooseUnit) {
          // Mostrar seletor, preencher com todas as unidades
          solEmpresa.style.display = '';
          const labelEmpresa = document.querySelector('label[for="sol-empresa"]');
          if (labelEmpresa) labelEmpresa.style.display = '';
          const wrap = document.getElementById('sol-empresa-nao-admin-wrap');
          if (wrap) wrap.remove();
        } else {
          // Restringe à própria empresa do usuário
          const userUnit = (Store.getUnits() || []).find(u => String(u.id) === String(user.unitId));
          if (userUnit) {
            // Selecionar automaticamente a unidade do usuário
            for (let i = 0; i < solEmpresa.options.length; i++) {
              if (solEmpresa.options[i].getAttribute('data-unit-id') === String(userUnit.id) ||
                  solEmpresa.options[i].value === userUnit.name) {
                solEmpresa.selectedIndex = i;
                break;
              }
            }
          }
          // Esconder o select e mostrar o nome da empresa como texto
          const wrapId = 'sol-empresa-nao-admin-wrap';
          let wrap = document.getElementById(wrapId);
          if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = wrapId;
            wrap.style.cssText = 'padding:8px 12px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-input); color:var(--text-color); font-size:.9rem;';
            solEmpresa.parentNode.insertBefore(wrap, solEmpresa);
          }
          wrap.textContent = userUnit ? userUnit.name : (user.unit || '—');
          solEmpresa.style.display = 'none';
        }

        if (!solEmpresa.dataset.ccBound) {
          solEmpresa.dataset.ccBound = '1';
          solEmpresa.addEventListener('change', () => {
            App.buildHotelOptions();
            App.updateSolicitacaoTotal();
          });
        }
      }

      App.buildHotelOptions();
      const sol = document.getElementById('sol-solicitante'); if (sol) sol.value = user.name || '';
      App.updateSolicitacaoTotal();
    };
    App.updateSolicitacaoTotal = function(){
      let noites = 0;
      document.getElementsByName('sol-noites').forEach(r => { if (r.checked) noites = parseInt(r.value)||0; });
      const unit = getSelectedSolicitacaoUnit();
      const hotel = getDailyRate(unit, (Store.getLoggedUser()||{}).profile) * noites;
      const disp = document.getElementById('sol-hotel-alim-display'); if (disp) disp.textContent = money(hotel);
      let extras = 0; document.querySelectorAll('.extra-val').forEach(i => extras += num(i.value));
      const total = hotel + num(document.getElementById('sol-abastecimento')?.value) + extras;
      const totalEl = document.getElementById('sol-total-geral'); if (totalEl) totalEl.textContent = money(total);
    };
    const oldSubmitSol = App.submitSolicitacaoDespesas ? App.submitSolicitacaoDespesas.bind(App) : null;
    if (oldSubmitSol) App.submitSolicitacaoDespesas = async function(){
      const unit = getSelectedSolicitacaoUnit();
      const rate = getDailyRate(unit, (Store.getLoggedUser()||{}).profile);
      const selected = [...document.getElementsByName('sol-noites')].find(r=>r.checked);
      const noites = selected ? parseInt(selected.value)||0 : 0;
      const oldFetch = this.fetchFromApi.bind(this);
      this.fetchFromApi = (url, opts={}) => {
        if (url === '/api/despesas' && opts.body) {
          const body = JSON.parse(opts.body);
          body.empresa = (document.getElementById('sol-empresa')?.value || unit.name || body.empresa || '').trim();
          body.unitId = unit.id || body.unitId;
          body.empresa_id = unit.id || body.empresa_id;
          body.valor_hotel_alim = rate * noites;
          opts.body = JSON.stringify(body);
        }
        return oldFetch(url, opts);
      };
      try { return await oldSubmitSol(); } finally { this.fetchFromApi = oldFetch; }
    };
  }

  // 03/04/05/06 - Exclusão em massa, somente Admin. Implementação segura para principais listas locais/API.
  function addBulkForTable(tbodyId, storeGetter, storeSaver, label){
    if (!isAdmin()) return;
    const tbody = document.getElementById(tbodyId); if (!tbody) return;
    const table = tbody.closest('table'); if (!table) return;
    table.classList.add('cc-bulk-table');
    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('.cc-bulk-all')) headRow.insertAdjacentHTML('afterbegin','<th class="cc-bulk-cell"><input type="checkbox" class="cc-bulk-all" aria-label="Selecionar todos"></th>');
    [...tbody.querySelectorAll('tr')].forEach(tr => {
      if (tr.querySelector('.cc-bulk-row')) return;
      const onclick = tr.getAttribute('onclick') || '';
      const m = onclick.match(/['"]([^'"]+)['"]\)/);
      const id = tr.dataset.id || (m && m[1]) || (tr.children[0] && tr.children[0].textContent.replace('#','').trim());
      tr.insertAdjacentHTML('afterbegin', `<td class="cc-bulk-cell" data-label="Selecionar" onclick="event.stopPropagation()"><input type="checkbox" class="cc-bulk-row" aria-label="Selecionar registro ${id||''}" value="${id||''}"></td>`);
    });
    let btn = table.parentElement.querySelector('.cc-bulk-delete-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'btn btn-danger btn-sm cc-bulk-delete-btn';
      btn.textContent = 'Excluir Selecionados';
      btn.style.cssText = 'display:none;margin:8px 0;float:right;';
      table.parentElement.insertBefore(btn, table);
    }
    const update = () => { btn.style.display = tbody.querySelectorAll('.cc-bulk-row:checked').length ? 'inline-block' : 'none'; };
    if (tbody.dataset.bulkReady !== '1') {
      tbody.dataset.bulkReady = '1';
      table.querySelector('.cc-bulk-all')?.addEventListener('change', e => { tbody.querySelectorAll('.cc-bulk-row').forEach(c => c.checked = e.target.checked); update(); });
      tbody.addEventListener('change', update);
    }
    update();
    btn.onclick = async () => {
      if (!isAdmin()) return alert('Somente administrador pode excluir registros.');
      const ids = [...tbody.querySelectorAll('.cc-bulk-row:checked')].map(c => String(c.value)).filter(Boolean);
      if (!ids.length) return;
      if (!confirm('Tem certeza que deseja excluir os registros selecionados? Esta ação não poderá ser desfeita.')) return;
      try {
        if (storeGetter && storeSaver && Store[storeGetter] && Store[storeSaver]) {
          const list = Store[storeGetter]().filter(x => !ids.includes(String(x.id || x.codigo || x.username || x.name)));
          Store[storeSaver](list);
        }
        if (tbodyId === 'despesas-solicitacoes-table-body' && App.fetchFromApi) {
          for (const id of ids) await App.fetchFromApi(`/api/despesas/${id}`, {method:'DELETE'}).catch(()=>{});
        }
        if (window.App && App.refreshAllLists) App.refreshAllLists();
        if (window.App && App.loadDespesasDashboard && window.location.hash === '#despesas-dashboard') App.loadDespesasDashboard();
      } catch(e) { alert('Erro ao excluir selecionados: ' + e.message); }
    };
  }
  function enhanceBulkDeletes(){
    addBulkForTable('clients-table-body','getClients','saveClients','clientes');
    // movements has its own native bulk delete implementation, do not duplicate:
    // addBulkForTable('movements-table-body','getMovements','saveMovements','movimentações');
    addBulkForTable('tickets-table-body','getTickets','saveTickets','chamados');
    addBulkForTable('expenses-table-body','getExpenses','saveExpenses','despesas');
    addBulkForTable('balances-table-body','getBalanceRequests','saveBalances','saldos');
    addBulkForTable('users-table-body','getUsers','saveUsers','usuários');
    addBulkForTable('units-table-body','getUnits','saveUnits','unidades');
    addBulkForTable('despesas-solicitacoes-table-body',null,null,'solicitações');
    // Prospecção usa container customizado
    const cont = document.getElementById('prospect-list-container');
    const tbody = cont && cont.querySelector('tbody');
    if (tbody && !tbody.id) tbody.id = 'prospects-table-body';
    addBulkForTable('prospects-table-body','getProspects','saveProspects','leads');
  }
  const bulkObserver = new MutationObserver(() => setTimeout(enhanceBulkDeletes, 50));
  bulkObserver.observe(document.documentElement, {childList:true, subtree:true});
  setTimeout(enhanceBulkDeletes, 1000);

  // 06 - Oculta botões individuais de excluir para não administradores.
  function hideDeleteForNonAdmin(){
    if (isAdmin()) return;
    document.querySelectorAll('button, a').forEach(el => {
      const t = (el.textContent || '').trim().toLowerCase();
      const oc = (el.getAttribute('onclick') || '').toLowerCase();
      if (t.includes('excluir') || oc.includes('delete')) el.style.display = 'none';
    });
  }
  new MutationObserver(() => setTimeout(hideDeleteForNonAdmin, 80)).observe(document.documentElement,{childList:true,subtree:true});

  // 11 - Corrige .toFixed em valores string na aprovação de saldo.
  function fixToFixedDisplays(){
    document.querySelectorAll('[data-item-val-sol]').forEach(el => { el.dataset.itemValSol = String(num(el.dataset.itemValSol)); });
  }
  setInterval(fixToFixedDisplays, 1000);

  // 12/13 - PDFs: emissão válida e empresa correta.
  window.CC_pdfEmissionText = function(dateLike){
    let d = new Date(dateLike);
    if (String(d) === 'Invalid Date' || isNaN(d.getTime())) d = new Date();
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR');
  };
  window.CC_pdfCompanyName = function(record){
    record = record || {};
    if (record.empresa && !/não informada/i.test(record.empresa)) return record.empresa;
    const unit = getUnitById(record.unitId || record.unit_id || record.empresa_id) || getCurrentUnit();
    return unit.name || 'Não informada';
  };

  document.addEventListener('DOMContentLoaded', () => { clearTemporaryFormCache(); markFormsNoAutocomplete(); });
})();


/* ===== rodada-14-19.js ===== */


/* Rodada 14-19 - correções pontuais sem alterar fluxos existentes */
(function(){
  'use strict';
  const money = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
  const num = (v) => { const n = Number(String(v ?? '').replace(/\./g,'').replace(',','.')); return Number.isFinite(n) ? n : 0; };
  const isAdmin = () => { const u = Store.getLoggedUser() || {}; const p = u.permissions || []; return u.profile === 'Administrador' || p.includes('Administrador') || p.includes('Administrador (Acesso Total)'); };
  const canApproveExpenses = () => { const u = Store.getLoggedUser() || {}; const p = u.permissions || []; return isAdmin() || u.profile === 'Financeiro' || p.includes('Financeiro') || p.includes('Aprovação de Despesas'); };
  const safeDate = (value, withTime=false) => {
    if (!value) return '--';
    let raw = String(value);
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) d = new Date(raw + 'T00:00:00'); else d = new Date(raw);
    if (!d || Number.isNaN(d.getTime())) return '--';
    return withTime ? d.toLocaleString('pt-BR') : d.toLocaleDateString('pt-BR');
  };
  const nextUnitId = (units) => {
    const numericIds = (units || []).map(u => parseInt(u.id, 10)).filter(n => Number.isFinite(n) && n < 1000000);
    const max = numericIds.length ? Math.max(...numericIds) : 0;
    return String(max + 1);
  };
  const getUnitConfigDefaults = () => ({ diaria_vendedor:120, diaria_supervisor:150, diaria_gerente:180, maximo_diarias:4, permitir_sem_hospedagem:true });
  const normalizeUnit = (u, idx=0) => ({ ...getUnitConfigDefaults(), ...u, id: String(u.id ?? (idx+1)) });

  // ensureUnitFinanceFields: campos agora fixos no HTML do template (pages/unidades.html)
  // Função mantida apenas para compatibilidade com chamadas legadas.
  function ensureUnitFinanceFields(){
    // Os campos de hospedagem já estão no HTML — nada a criar.
  }
  function readUnitFinanceFields(){
    return {
      diaria_vendedor: num(document.getElementById('unit-diaria-vendedor')?.value || 120),
      diaria_supervisor: num(document.getElementById('unit-diaria-supervisor')?.value || 150),
      diaria_gerente: num(document.getElementById('unit-diaria-gerente')?.value || 180),
      maximo_diarias: parseInt(document.getElementById('unit-maximo-diarias')?.value || '4',10) || 4,
      permitir_sem_hospedagem: String(document.getElementById('unit-permitir-sem-hospedagem')?.value || 'true') === 'true'
    };
  }
  function fillUnitFinanceFields(unit){
    ensureUnitFinanceFields();
    unit = { ...getUnitConfigDefaults(), ...(unit||{}) };
    const set = (id,val) => { const el=document.getElementById(id); if(el) el.value = val; };
    set('unit-diaria-vendedor', unit.diaria_vendedor);
    set('unit-diaria-supervisor', unit.diaria_supervisor);
    set('unit-diaria-gerente', unit.diaria_gerente);
    set('unit-maximo-diarias', unit.maximo_diarias);
    set('unit-permitir-sem-hospedagem', String(unit.permitir_sem_hospedagem !== false));
  }

  // 16/17/18 - Unidades: salvar config financeira, ID sequencial e excluir unidade com proteção simples.
  const oldGetUnits = Store.getUnits?.bind(Store);
  if (oldGetUnits) Store.getUnits = function(){ return (oldGetUnits() || []).map(normalizeUnit); };
  const oldSaveUnits = Store.saveUnits?.bind(Store);
  if (oldSaveUnits) Store.saveUnits = function(units){ return oldSaveUnits((units || []).map(normalizeUnit)); };

  App.editUnit = function(unitId){
    const units = Store.getUnits ? Store.getUnits() : [];
    const unit = units.find(u => String(u.id) === String(unitId));
    if (!unit) { console.error('Unidade não encontrada:', unitId); return; }

    // Função interna que preenche o formulário quando ele estiver disponível
    function _doFill() {
      const formContainer = document.getElementById('unit-form-container');
      if (formContainer) {
        formContainer.classList.remove('hidden');
        setTimeout(() => formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
      const formEl = document.getElementById('unit-form');
      if (formEl) formEl.dataset.editingId = unit.id;

      const nameInput = document.getElementById('unit-name');
      if (nameInput) { nameInput.value = unit.name || ''; nameInput.focus(); }

      const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
      if (submitBtn) submitBtn.textContent = 'Atualizar Unidade';

      fillUnitFinanceFields(unit);
    }

    // Tenta preencher imediatamente; se os campos não existirem ainda (template async), aguarda
    if (document.getElementById('unit-name')) {
      _doFill();
    } else {
      // Aguarda o template carregar (loadPageContent é assíncrono)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (document.getElementById('unit-name')) {
          clearInterval(interval);
          _doFill();
        } else if (attempts > 30) {
          clearInterval(interval);
        }
      }, 100);
    }
  };

  // bindUnitFormPatch: usa event delegation no document para evitar listeners duplicados
  let _unitFormDelegated = false;
  function bindUnitFormPatch(){
    // Ligar o botao "Cadastrar Nova" para resetar valores ao abrir
    const openBtn = document.getElementById('btn-open-unit-form');
    if (openBtn && !openBtn.dataset.financePatch) {
      openBtn.dataset.financePatch = '1';
      openBtn.addEventListener('click', () => setTimeout(()=>fillUnitFinanceFields(getUnitConfigDefaults()), 50));
    }

    // Event delegation: registra apenas uma vez no document para pegar qualquer #unit-form
    if (!_unitFormDelegated) {
      _unitFormDelegated = true;
      document.addEventListener('submit', function(e) {
        const form = e.target;
        if (!form || form.id !== 'unit-form') return;
        e.preventDefault();
        e.stopImmediatePropagation();

        const name = document.getElementById('unit-name')?.value?.trim();
        if (!name) return alert('Informe o nome da unidade.');

        const editingId = form.dataset.editingId || '';
        const finance = readUnitFinanceFields();

        // Busca unidades sempre frescas
        const rawGet = Store._getListRaw ? Store._getListRaw('units') : null;
        let units = Store.getUnits ? Store.getUnits() : [];

        if (editingId) {
          const unit = units.find(u => String(u.id) === String(editingId));
          if (unit) {
            Object.assign(unit, finance, { name });
          } else {
            console.warn('Unidade nao encontrada para edicao:', editingId);
          }
          delete form.dataset.editingId;
        } else {
          units.push({ id: nextUnitId(units), name, ...finance });
        }

        const saved = Store.saveUnits(units);
        console.log('[UnitForm] saveUnits result:', saved, 'units:', units);

        UI.populateUnitDropdowns?.();
        UI.populateMovementCompanyDropdown?.();
        UI.renderUnits?.();

        form.reset();
        fillUnitFinanceFields(getUnitConfigDefaults());
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.textContent = 'Cadastrar Unidade';
        document.getElementById('unit-form-container')?.classList.add('hidden');
        App.showToast?.(editingId ? 'Configuracoes da unidade atualizadas com sucesso.' : 'Unidade cadastrada com sucesso.');
      }, true);
    }
  }

  const oldRenderUnits = UI.renderUnits?.bind(UI);
  UI.renderUnits = function(){
    if (!document.getElementById('units-table-body')) return oldRenderUnits && oldRenderUnits();
    const units = Store.getUnits() || [];
    const prospects = Store.getProspects?.() || [];
    const clients = Store.getClients?.() || [];
    const tickets = Store.getTickets?.() || [];
    const movements = Store.getMovements?.() || [];
    const body = document.getElementById('units-table-body');
    body.innerHTML = units.map((unit, idx) => {
      const parsedId = parseInt(unit.id,10);
      const idVisual = (Number.isFinite(parsedId) && parsedId < 1000000) ? String(parsedId) : String(idx + 1);
      const unitProspects = prospects.filter(p=>String(p.unitId)===String(unit.id)).length;
      const unitClients = clients.filter(c=>String(c.unitId)===String(unit.id) && c.status === 'Aprovado').length;
      const unitTickets = tickets.filter(t=>String(t.unitId)===String(unit.id) && ['Aberto','Em Atendimento'].includes(t.status)).length;
      const unitMovements = movements.filter(m=>String(m.unitId||m.unit_id||'')===String(unit.id)).length;
      const del = isAdmin() ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.deleteUnit('${unit.id}')">Excluir</button>` : '';
      // Mostrar valores de diaria cadastrados
      const dv = unit.diaria_vendedor ?? unit.daily_vendedor ?? 120;
      const ds = unit.diaria_supervisor ?? unit.daily_supervisor ?? 150;
      return `<tr>
        <td style="font-family:monospace;">${idVisual}</td>
        <td style="font-weight:600;">${unit.name}</td>
        <td style="text-align:center;">${unitProspects}</td>
        <td style="text-align:center;">${unitClients}</td>
        <td style="text-align:center;"><span class="badge-status ${unitTickets>0?'badge-danger':'badge-success'}">${unitTickets} ativos</span></td>
        <td style="text-align:center;">${unitMovements}</td>
        <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
          <button class="btn btn-secondary btn-sm" onclick="App.editUnit('${unit.id}')">Editar</button>${del}
        </td>
      </tr>`;
    }).join('');
    bindUnitFormPatch();
  };

  App.deleteUnit = function(unitId){
    if (!isAdmin()) return alert('Somente administrador pode excluir empresa.');
    const units = Store.getUnits() || [];
    const prospects = Store.getProspects?.() || [];
    const clients = Store.getClients?.() || [];
    const tickets = Store.getTickets?.() || [];
    const movements = Store.getMovements?.() || [];
    const hasLinks = prospects.some(x=>String(x.unitId)===String(unitId)) || clients.some(x=>String(x.unitId)===String(unitId)) || tickets.some(x=>String(x.unitId)===String(unitId)) || movements.some(x=>String(x.unitId||x.unit_id)===String(unitId));
    if (hasLinks) return alert('Nao e possivel excluir esta empresa porque existem registros vinculados a ela.');
    if (!confirm('Tem certeza que deseja excluir esta empresa? Essa acao nao podera ser desfeita.')) return;
    Store.saveUnits(units.filter(u=>String(u.id)!==String(unitId)));
    UI.populateUnitDropdowns?.(); UI.renderUnits?.(); App.showToast?.('Empresa excluida com sucesso.');
  };

  // 14/15 - Aprovação de Despesas de Campo + imagens no PDF.
  const oldRenderExpenses = UI.renderExpenses?.bind(UI);
  UI.renderExpenses = function(expenses){
    oldRenderExpenses?.(expenses);
    const body = document.getElementById('expenses-table-body'); if (!body) return;
    [...body.querySelectorAll('tr')].forEach((tr, idx)=>{
      const exp = (expenses || [])[idx]; if (!exp) return;
      const actionTd = tr.querySelector('td:last-child'); if (!actionTd) return;
      const status = String(exp.status || '').toLowerCase();
      if (canApproveExpenses() && status === 'pendente') {
        actionTd.innerHTML = `<div style="display:flex; gap:4px; flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.generateExpenseComprovantePdf('${exp.id}')">PDF</button><button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveRegisteredExpense('${exp.id}')">Aprovar</button><button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.rejectRegisteredExpense('${exp.id}')">Reprovar</button><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.correctRegisteredExpense('${exp.id}')">Correção</button></div>`;
      } else if (String(exp.status) === 'Correção Solicitada' && String(exp.userId) === String((Store.getLoggedUser()||{}).id)) {
        actionTd.innerHTML = `<button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); App.showToast('Abra uma nova despesa corrigida e reenvie para análise.')">Corrigir</button> <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.generateExpenseComprovantePdf('${exp.id}')">PDF</button>`;
      }
    });
  };
  async function setExpenseStatus(id, status){
    let observacao = '';
    if (status !== 'Aprovado') {
      observacao = prompt(status === 'Correção Solicitada' ? 'Informe o que precisa ser corrigido:' : 'Informe o motivo da reprovação:') || '';
      if (!observacao.trim()) return alert('Motivo obrigatório.');
    }
    const result = await App.fetchFromApi(`/api/despesas-reembolsos/${id}/approval`, {method:'PUT', body: JSON.stringify({status, observacao})});
    if (result?.success) { App.showToast?.('Despesa avaliada com sucesso.'); App.loadExpenses?.(); UI.renderDashboard?.(); }
  }
  App.approveRegisteredExpense = (id)=>setExpenseStatus(id,'Aprovado');
  App.rejectRegisteredExpense = (id)=>setExpenseStatus(id,'Reprovado');
  App.correctRegisteredExpense = (id)=>setExpenseStatus(id,'Correção Solicitada');

  async function imageToDataUrl(src){
    if (!src) return '';
    if (/^data:image\//.test(src)) return src;
    try {
      const r = await fetch(src, {cache:'no-store'}); const b = await r.blob();
      return await new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(b); });
    } catch(e) { return src; }
  }
  App.generateExpenseComprovantePdf = async function(id){
    try {
      let exp = await this.fetchFromApi(`/api/despesas-reembolsos/${id}`);
      if (window.CCMediaPreserver) exp = CCMediaPreserver.hydrateExpense(exp);
      if (!exp) return this.showToast?.('Despesa não encontrada!', 'danger');
      const { jsPDF } = window.jspdf; const doc = new jsPDF('p','mm','a4');
      doc.setDrawColor(37,99,235); doc.setLineWidth(1); doc.rect(5,5,200,287);
      doc.setFillColor(37,99,235); doc.rect(5,5,200,20,'F');
      doc.setFont('Helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255); doc.text('COMPROVANTE DE DESPESA DE VIAGEM',10,17);
      doc.setTextColor(0,0,0); doc.setFontSize(9); doc.setFont('Helvetica','normal');
      doc.text(`Comprovante ID: #${exp.id}`,15,33); doc.text(`Data / Hora: ${safeDate(exp.date)}${exp.time ? ' às '+exp.time : ''}`,110,33);
      doc.text(`Vendedor: ${UI.getExpenseUserName(exp)}`,15,39); doc.text(`Unidade: ${UI.getUnitName(exp.unitId)}`,110,39);
      doc.text(`Finalidade: ${exp.finalidade || '-'}`,15,45); doc.text(`Tipo de Operação: ${exp.operacao || '-'}`,110,45); doc.text(`Status: ${exp.status || '-'}`,15,51);
      doc.setDrawColor(220,220,220); doc.line(10,56,200,56); let y=63;
      doc.setFont('Helvetica','bold'); doc.text('DETALHES DA DESPESA',15,y); doc.setFont('Helvetica','normal'); y+=7;
      doc.text(`Valor: ${money(exp.value)}`,15,y); y+=7;
      if (exp.observation) { const lines=doc.splitTextToSize(`Observação: ${exp.observation}`,180); doc.text(lines,15,y); y+=lines.length*5+4; }
      if (exp.descreva) { const lines=doc.splitTextToSize(`Descrição: ${exp.descreva}`,180); doc.text(lines,15,y); y+=lines.length*5+4; }
      doc.line(10,y,200,y); y+=8; doc.setFont('Helvetica','bold'); doc.text('ANEXOS / COMPROVANTES FOTOGRÁFICOS',15,y); y+=8; doc.setFont('Helvetica','normal');
      const imgs = [];
      if (exp.foto_comprovante) imgs.push(['Comprovante', exp.foto_comprovante]);
      if (exp.foto_odometro) imgs.push(['Odômetro / KM', exp.foto_odometro]);
      if (!imgs.length) { doc.text('Nenhum comprovante anexado.',15,y); }
      else {
        let x=15;
        for (const [label,src] of imgs) {
          const dataUrl = await imageToDataUrl(src);
          doc.text(label+':', x, y); 
          try { doc.addImage(dataUrl, 'JPEG', x, y+4, 80, 60); } catch(e) { try { doc.addImage(dataUrl, 'PNG', x, y+4, 80, 60); } catch(_) { doc.text('[Erro ao renderizar imagem]', x, y+10); } }
          x += 95; if (x > 120) { x = 15; y += 70; }
        }
      }
      doc.save(`Comprovante-Despesa-${exp.id}.pdf`); this.showToast?.('Documento PDF gerado com sucesso!');
    } catch(err) { console.error(err); alert('Erro ao gerar PDF: ' + err.message); }
  };

  // 19 - Datas válidas em solicitação/aprovação de saldo.
  const oldRenderDespesasTable = App.renderDespesasTable?.bind(App);
  App.renderDespesasTable = function(list){
    if (Array.isArray(list)) list.forEach(r => { if (!r.data_solicitacao && !r.created_at && !r.createdAt) r.data_solicitacao = ''; });
    oldRenderDespesasTable?.(list);
    document.querySelectorAll('#despesas-solicitacoes-table-body tr').forEach(tr => {
      const dateTd = tr.children[1];
      if (dateTd && /Invalid Date/i.test(dateTd.textContent)) dateTd.textContent='--';
    });
  };

  // Abas visuais de aprovação de despesas.
  function ensureExpenseApprovalTab(){
    const tabs = document.querySelector('#view-despesas .view-tabs, #view-solicitacao-despesas .view-tabs, #view-despesas-dashboard .view-tabs');
    if (!tabs || tabs.querySelector('#tab-expense-approvals')) return;
    const a = document.createElement('a'); a.href='#despesas'; a.id='tab-expense-approvals'; a.className='view-tab-btn'; a.textContent='Aprovação de Despesas';
    a.onclick = () => { sessionStorage.setItem('cc_expense_approval_mode','1'); setTimeout(()=>App.loadExpenses?.(),200); };
    tabs.appendChild(a);
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ bindUnitFormPatch(); ensureExpenseApprovalTab(); },800));
  new MutationObserver(()=>setTimeout(()=>{ bindUnitFormPatch(); ensureExpenseApprovalTab(); },80)).observe(document.documentElement,{childList:true,subtree:true});
})();


/* ===== rodada-20-25.js ===== */

/* Rodada 20-25 - ajustes pontuais em saldo, aprovação de despesas, permissões e dashboard */
(function(){
  'use strict';
  const money = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    let raw = String(v).trim().replace(/[^0-9,.-]/g,'');
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',','.');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const statusText = (s) => String(s || '').toLowerCase();
  const isApproved = (s) => /aprovad/.test(statusText(s));
  const isRejected = (s) => /reprovad|rejeitad/.test(statusText(s));
  const isPending = (s) => /pendente/.test(statusText(s));
  const isCorrection = (s) => /corre/.test(statusText(s));
  const getUser = () => Store.getLoggedUser?.() || {};
  const perms = (u=getUser()) => Array.isArray(u.permissions) ? u.permissions : [];
  const isAdmin = (u=getUser()) => u.profile === 'Administrador' || perms(u).includes('Administrador') || perms(u).includes('Administrador (Acesso Total)');
  const canApproveExpense = (u=getUser()) => isAdmin(u) || u.profile === 'Financeiro' || perms(u).includes('Financeiro') || perms(u).includes('Aprovação de Despesas');
  const canApproveBalance = (u=getUser()) => isAdmin(u) || u.profile === 'Financeiro' || perms(u).includes('Financeiro') || perms(u).includes('Aprovação de Saldo');
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function getApprovedBalanceValue(b){
    const approved = num(b.totalAprovado ?? b.total_aprovado);
    if (approved > 0) return approved;
    if (!isApproved(b.status)) return 0;
    return num(b.totalGeral ?? b.total_geral ?? b.valor ?? b.value ?? b.valor_total);
  }
  function getExpenseValue(e){
    const status = statusText(e.status);
    if (status.includes('aprov')) {
      const approved = e.total_liberado ?? e.totalAprovado ?? e.total_aprovado ?? e.approved_total ?? e.valor_aprovado;
      if (approved !== undefined && approved !== null && approved !== '') return num(approved);
    }
    return num(e.value ?? e.valor ?? e.total ?? e.totalGeral ?? e.total_geral);
  }

  // Permissões: manter padrão existente, mas impedir Aprovação de Despesas para quem não tem permissão explícita/perfil financeiro/admin.
  const oldAllowed = Store.getUserAllowedRoutes?.bind(Store);
  if (oldAllowed) {
    Store.getUserAllowedRoutes = function(user){
      const allowed = oldAllowed(user) || ['#dashboard'];
      if (!user) return allowed;
      if (!canApproveExpense(user) && !canApproveBalance(user)) {
        return allowed.filter(r => r !== '#despesas-dashboard');
      }
      return allowed;
    };
  }

  function ensureTabs(){
    return; // abas controladas por js/correcao-abas-navegacao-30-06.js
    const host = document.querySelector('#view-despesas .view-tabs, #view-solicitacao-despesas .view-tabs, #view-despesas-dashboard .view-tabs');
    if (!host) return;
    const tabs = [
      ['#despesas','Despesas de Campo','tab-despesas-campo', true],
      ['#solicitacao-despesas','Solicitação de Saldo','tab-balance-solicitation', (Store.getUserAllowedRoutes(getUser())||[]).includes('#solicitacao-despesas')],
      ['#despesas-dashboard','Aprovação de Saldo','tab-balance-approvals', canApproveBalance()],
      ['#despesas','Aprovação de Despesas','tab-expense-approvals', canApproveExpense()]
    ];
    tabs.forEach(([href,label,id,show])=>{
      let a = host.querySelector('#'+id);
      if (!a) {
        a = document.createElement('a'); a.href = href; a.id = id; a.className = 'view-tab-btn'; a.textContent = label; host.appendChild(a);
      }
      a.style.display = show ? 'flex' : 'none';
      a.classList.toggle('active', (id === 'tab-expense-approvals' && sessionStorage.getItem('cc_expense_approval_mode')==='1' && location.hash === '#despesas') || (id !== 'tab-expense-approvals' && a.getAttribute('href') === location.hash));
      if (id === 'tab-expense-approvals') a.onclick = () => { sessionStorage.setItem('cc_expense_approval_mode','1'); setTimeout(()=>App.loadExpenses?.(),80); };
      if (id === 'tab-despesas-campo') a.onclick = () => { sessionStorage.removeItem('cc_expense_approval_mode'); setTimeout(()=>App.loadExpenses?.(),80); };
    });
  }

  // Cards: considerar somente saldos aprovados e despesas aprovadas.
  const oldUpdateCards = UI.updateBalanceCards?.bind(UI);
  UI.updateBalanceCards = function(){
    oldUpdateCards?.();
    let balances = window.AppBalancesCache || Store.getBalanceRequests?.() || [];
    let expenses = window.AppExpensesCache || Store.getExpenses?.() || [];
    const user = getUser();
    const activeUnitId = Store.getActiveUnitId?.() || 'all';
    if (activeUnitId !== 'all') { balances = balances.filter(b => String(b.unitId ?? b.empresa_id ?? '') === String(activeUnitId)); expenses = expenses.filter(e => String(e.unitId ?? e.empresa_id ?? '') === String(activeUnitId)); }
    if (user.profile === 'Vendedor' && !isAdmin(user)) { balances = balances.filter(b => String(b.usuario_id ?? b.userId ?? b.user_id) === String(user.id)); expenses = expenses.filter(e => String(e.userId ?? e.user_id ?? e.usuario_id) === String(user.id)); }
    const approvedBalance = balances.filter(b => isApproved(b.status)).reduce((s,b)=>s+getApprovedBalanceValue(b),0);
    const isRequisition = e => statusText(e.operacao ?? e.operation ?? e.tipo_operacao ?? e.tipoOperacao).includes('requis');
    const approvedRows = expenses.filter(e => statusText(e.status) === 'aprovado');
    const requisitionExpense = approvedRows.filter(isRequisition).reduce((s,e)=>s+getExpenseValue(e),0);
    const approvedExpense = approvedRows.filter(e => !isRequisition(e)).reduce((s,e)=>s+getExpenseValue(e),0);
    const remaining = approvedBalance - approvedExpense;
    const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent = val; };
    set('metric-balance-available', money(approvedBalance));
    set('metric-balance-used', money(approvedExpense));
    set('metric-balance-remaining', money(remaining));
    set('metric-expense-requisition', money(requisitionExpense));
    renderFinanceCharts({balances, expenses, approvedBalance, approvedExpense, remaining});
  };

  function ensureChartsHost(){
    const grid = document.querySelector('#view-despesas-dashboard .dashboard-grid');
    if (!grid || document.getElementById('finance-charts-20-25')) return;
    const box = document.createElement('div');
    box.id = 'finance-charts-20-25';
    box.className = 'card';
    box.style.cssText = 'grid-column:1/-1; padding:18px; margin-bottom:20px;';
    box.innerHTML = `<div class="card-header"><span class="card-title">Gráficos Financeiros</span></div><div id="finance-charts-body" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px;"></div>`;
    grid.parentNode.insertBefore(box, grid.nextSibling);
  }
  function bar(label, value, max){ const w = Math.max(3, Math.round((Number(value)||0)/(max||1)*100)); return `<div style="margin:8px 0;"><div style="display:flex; justify-content:space-between; gap:8px; font-size:.78rem;"><span>${escapeHtml(label)}</span><strong>${money(value)}</strong></div><div style="height:10px; background:rgba(255,255,255,.08); border-radius:999px; overflow:hidden;"><div style="width:${w}%; height:100%; background:var(--primary-color); border-radius:999px;"></div></div></div>`; }
  function renderFinanceCharts(ctx){
    ensureChartsHost();
    const body = document.getElementById('finance-charts-body'); if (!body) return;
    const pendingExp = ctx.expenses.filter(e=>isPending(e.status)).reduce((s,e)=>s+getExpenseValue(e),0);
    const corrExp = ctx.expenses.filter(e=>isCorrection(e.status)).reduce((s,e)=>s+getExpenseValue(e),0);
    const rejExp = ctx.expenses.filter(e=>isRejected(e.status)).reduce((s,e)=>s+getExpenseValue(e),0);
    const max = Math.max(ctx.approvedBalance, ctx.approvedExpense, ctx.remaining, pendingExp, corrExp, rejExp, 1);
    const units = {};
    [...ctx.expenses, ...ctx.balances].forEach(x=>{ const id = x.unitId ?? x.empresa_id ?? 'Sem unidade'; units[id] = units[id] || {saldo:0, desp:0}; });
    ctx.balances.filter(b=>isApproved(b.status)).forEach(b=>{ const id=b.unitId??b.empresa_id??'Sem unidade'; units[id].saldo += getApprovedBalanceValue(b); });
    ctx.expenses.filter(e=>statusText(e.status)==='aprovado' && !statusText(e.operacao ?? e.operation ?? e.tipo_operacao ?? e.tipoOperacao).includes('requis')).forEach(e=>{ const id=e.unitId??e.empresa_id??'Sem unidade'; units[id].desp += getExpenseValue(e); });
    const unitRows = Object.entries(units).slice(0,8).map(([id,v])=>`<li style="display:flex; justify-content:space-between; gap:8px; padding:5px 0; border-bottom:1px solid var(--border-color);"><span>${escapeHtml(UI.getUnitName?.(id)||id)}</span><strong>${money(v.saldo-v.desp)}</strong></li>`).join('') || '<li style="color:var(--text-muted);">Sem dados.</li>';
    body.innerHTML = `
      <div><h4>Resumo por Status</h4>${bar('Saldo aprovado',ctx.approvedBalance,max)}${bar('Despesas aprovadas',ctx.approvedExpense,max)}${bar('Saldo restante',ctx.remaining,max)}${bar('Pendentes',pendingExp,max)}${bar('Correção',corrExp,max)}${bar('Reprovadas',rejExp,max)}</div>
      <div><h4>Pizza por situação</h4><div style="min-height:160px; border-radius:12px; background:conic-gradient(var(--success) 0 ${Math.round((ctx.approvedExpense/(max||1))*360)}deg, var(--warning) 0 ${Math.round(((ctx.approvedExpense+pendingExp)/(max||1))*360)}deg, var(--danger) 0); display:flex; align-items:center; justify-content:center;"><span style="background:var(--bg-card); padding:14px; border-radius:999px; font-weight:700;">${money(ctx.remaining)}</span></div></div>
      <div><h4>Ranking / Unidade</h4><ol style="padding-left:18px; margin:0;">${unitRows}</ol></div>`;
  }

  // Aprovação de despesas registradas: linha abre detalhes; ações só dentro do modal.
  const oldRenderExpenses = UI.renderExpenses?.bind(UI);
  UI.renderExpenses = function(expenses){
    oldRenderExpenses?.(expenses);
    const body = document.getElementById('expenses-table-body'); if (!body) return;
    const visible = [...body.querySelectorAll('tr')];
    visible.forEach((tr, idx)=>{
      const exp = (expenses || [])[idx]; if (!exp) return;
      tr.setAttribute('onclick', `App.showRegisteredExpenseDetails('${exp.id}')`);
      const td = tr.querySelector('td:last-child');
      if (td) td.innerHTML = `<div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.showRegisteredExpenseDetails('${exp.id}')">Ver Detalhes</button><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.generateExpenseComprovantePdf('${exp.id}')">PDF</button></div>`;
    });
    ensureTabs();
  };

  App.showRegisteredExpenseDetails = async function(id){
    try{
      const exp = await this.fetchFromApi(`/api/despesas-reembolsos/${id}`);
      if (!exp) return alert('Despesa não encontrada.');
      let modal = document.getElementById('modal-registered-expense-details');
      if (!modal) {
        modal = document.createElement('div'); modal.id='modal-registered-expense-details'; modal.className='login-wrapper'; modal.style.cssText='display:none; position:fixed; inset:0; z-index:2600; background:rgba(0,0,0,.62); align-items:center; justify-content:center; padding:20px 10px; overflow:auto;'; document.body.appendChild(modal);
      }
      const imgs = [ ['Comprovante', exp.foto_comprovante], ['Odômetro/KM', exp.foto_odometro] ].filter(x=>x[1]).map(([l,src])=>`<div><strong>${l}</strong><br><img src="${escapeHtml(src)}" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid var(--border-color); margin-top:6px; cursor:pointer;" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" onclick="App.showFacadeImage && App.showFacadeImage('${String(src).replace(/'/g,"\\'")}')"><div style="display:none;margin-top:8px;padding:10px;border:1px dashed var(--warning);border-radius:7px;color:var(--warning);font-size:.78rem;">O registro possui uma referência antiga, mas o arquivo não está disponível neste endereço. Se a foto ainda estiver no backup ou no Cloudinary, ela poderá ser restaurada sem alterar a despesa.</div></div>`).join('') || '<p style="color:var(--text-muted);">Sem fotos anexadas.</p>';
      const actions = canApproveExpense() && statusText(exp.status)==='pendente' ? `<button class="btn btn-success" onclick="App.approveRegisteredExpense('${id}')">Aprovar</button><button class="btn btn-danger" onclick="App.rejectRegisteredExpense('${id}')">Reprovar</button><button class="btn btn-warning" onclick="App.correctRegisteredExpense('${id}')">Enviar para Correção</button>` : '';
      modal.innerHTML = `<div class="login-card" style="max-width:820px; width:100%; max-height:92vh; overflow:auto; text-align:left; padding:24px;"><div style="display:flex; justify-content:space-between; gap:12px; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:14px;"><h3 style="margin:0; color:var(--primary-color);">Detalhes da Despesa #${escapeHtml(exp.id)}</h3><span onclick="document.getElementById('modal-registered-expense-details').style.display='none'" style="cursor:pointer; font-size:1.5rem;">✕</span></div><div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; font-size:.9rem;"><div><strong>Vendedor:</strong> ${escapeHtml(UI.getExpenseUserName?.(exp)||'Usuário não localizado')}</div><div><strong>Unidade:</strong> ${escapeHtml(UI.getUnitName?.(exp.unitId)||exp.unitId||'-')}</div><div><strong>Data/Hora:</strong> ${escapeHtml(exp.date||'-')} ${escapeHtml(exp.time||'')}</div><div><strong>Status:</strong> ${escapeHtml(exp.status||'-')}</div><div><strong>Finalidade:</strong> ${escapeHtml(exp.finalidade||'-')}</div><div><strong>Operação:</strong> ${escapeHtml(exp.operacao||'-')}</div><div><strong>Valor:</strong> ${money(exp.value)}</div><div><strong>Veículo/KM:</strong> ${escapeHtml(exp.veiculo||'-')} ${escapeHtml(exp.km||'')}</div><div style="grid-column:1/-1;"><strong>Observações:</strong><p style="padding:8px; background:rgba(255,255,255,.03); border:1px solid var(--border-color); border-radius:6px;">${escapeHtml(exp.observation||exp.observacao||'-')}</p></div></div><h4>Fotos e comprovantes</h4><div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">${imgs}</div><h4>Histórico</h4><p style="color:var(--text-muted);">Status atual: ${escapeHtml(exp.status||'-')}${exp.observacao ? ' — '+escapeHtml(exp.observacao) : ''}</p><div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; border-top:1px solid var(--border-color); margin-top:18px; padding-top:14px;">${actions}<button class="btn btn-secondary" onclick="App.generateExpenseComprovantePdf('${id}')">PDF</button><button class="btn btn-secondary" onclick="document.getElementById('modal-registered-expense-details').style.display='none'">Fechar</button></div></div>`;
      modal.style.display='flex';
    } catch(e){ console.error(e); alert('Erro ao abrir detalhes da despesa: '+e.message); }
  };

  // Aprovação de saldo: default Aprovar Total, valor/qtd preenchidos, justificativa só para exceções.
  const oldShowDetails = App.showDespesaDetails?.bind(App);
  App.showDespesaDetails = async function(id){
    await oldShowDetails(id);
    setTimeout(()=>{
      document.querySelectorAll('.approval-item-row').forEach(row=>{
        const sel = row.querySelector('.item-evaluation-status');
        const val = row.querySelector('.item-val-approved');
        const qty = row.querySelector('.item-qty-approved');
        const just = row.querySelector('.item-justification');
        if (!sel || !val) return;
        if (sel.querySelector('option[value="correcao"]') == null) sel.insertAdjacentHTML('beforeend','<option value="correcao">Enviar para Correção</option>');
        const originalVal = num(val.getAttribute('data-item-val-sol'));
        const originalQty = qty ? num(qty.getAttribute('data-item-qty-sol')) : null;
        if (!row.dataset.loadedStatus || row.dataset.loadedStatus === 'pendente') {
          sel.value = 'aprovado'; val.value = originalVal.toFixed(2); if (qty) qty.value = originalQty; if (just) just.value = '';
        }
        const apply = () => {
          const partial = sel.value !== 'aprovado';
          just?.toggleAttribute('required', partial);
          if (just) just.placeholder = partial ? 'Justificativa obrigatória...' : 'Opcional para aprovação total';
          if (sel.value === 'aprovado') { val.value = originalVal.toFixed(2); val.disabled = true; if (qty) { qty.value = originalQty; qty.disabled = true; } if (just) just.required = false; }
          else if (sel.value === 'reprovado' || sel.value === 'correcao') { val.value = '0.00'; val.disabled = true; if (qty) { qty.value = 0; qty.disabled = true; } }
          else { val.disabled = false; if (qty) qty.disabled = false; }
          let total = 0; document.querySelectorAll('.approval-item-row').forEach(r=>{ const s=r.querySelector('.item-evaluation-status')?.value; const v=num(r.querySelector('.item-val-approved')?.value); if (s !== 'reprovado' && s !== 'correcao') total += v; });
          const totalEl = document.getElementById('det-despesa-total-aprovado-display'); if (totalEl) totalEl.textContent = money(total);
        };
        sel.onchange = apply; val.oninput = apply; if (qty) qty.oninput = apply; apply();
        const label = just?.closest('.form-group')?.querySelector('label'); if (label) label.textContent = 'Justificativa (obrigatória para valor/quantidade menor, reprovação ou correção)';
      });
    },120);
  };

  App.submitExpenseApproval = async function(){
    const approvalPanel = document.getElementById('manager-approval-panel');
    const id = approvalPanel?.dataset.reqId;
    const observacao = document.getElementById('review-obs')?.value.trim() || '';
    const items = [];
    let error = '';
    document.querySelectorAll('.approval-item-row').forEach(row=>{
      const itemId = parseInt(row.dataset.itemId, 10);
      const sel = row.querySelector('.item-evaluation-status');
      const val = row.querySelector('.item-val-approved');
      const qty = row.querySelector('.item-qty-approved');
      const just = row.querySelector('.item-justification');
      const originalVal = num(val?.getAttribute('data-item-val-sol'));
      const originalQty = qty ? num(qty.getAttribute('data-item-qty-sol')) : null;
      const selected = sel?.value || 'aprovado';
      const valApproved = selected === 'aprovado' ? originalVal : num(val?.value);
      const qtyApproved = qty ? (selected === 'aprovado' ? originalQty : parseInt(qty.value || '0', 10)) : null;
      const lowerByValue = selected === 'aprovado parcialmente' && valApproved < originalVal;
      const lowerByQty = selected === 'aprovado parcialmente' && qty && qtyApproved < originalQty;
      const needs = selected === 'reprovado' || selected === 'correcao' || lowerByValue || lowerByQty;
      const justificativa = String(just?.value || '').trim();
      if (needs && !justificativa) error = 'Justificativa obrigatória para valor/quantidade menor, reprovação ou envio para correção.';
      if (valApproved > originalVal) error = 'O valor aprovado não pode ser maior que o valor solicitado.';
      items.push({
        id: itemId,
        status: selected === 'correcao' ? 'correcao' : (selected === 'reprovado' ? 'reprovado' : (selected === 'aprovado parcialmente' ? 'aprovado parcialmente' : 'aprovado')),
        valor_aprovado: selected === 'reprovado' || selected === 'correcao' ? 0 : valApproved,
        quantidade_aprovada: selected === 'reprovado' || selected === 'correcao' ? 0 : qtyApproved,
        justificativa
      });
    });
    if (error) return alert(error);
    try {
      const result = await this.fetchFromApi(`/api/despesas/${id}/approval`, { method:'POST', body: JSON.stringify({items, observacao}) });
      if (result?.success) {
        this.showToast(`Solicitação #${id} avaliada com sucesso!`);
        const modal = document.getElementById('modal-despesa-details'); if (modal) modal.style.display = 'none';
        this.loadDespesasDashboard?.();
      }
    } catch(err) { console.error(err); alert('Erro ao registrar parecer: ' + err.message); }
  };

  const oldLoadDash = App.loadDespesasDashboard?.bind(App);
  App.loadDespesasDashboard = async function(){
    const r = await oldLoadDash?.();
    try {
      const params = new URLSearchParams();
      const solicitante = document.getElementById('filter-despesa-solicitante')?.value?.trim();
      const status = document.getElementById('filter-despesa-status')?.value;
      const inicio = document.getElementById('filter-despesa-inicio')?.value;
      const fim = document.getElementById('filter-despesa-fim')?.value;
      const activeUnitId = Store.getActiveUnitId?.() || 'all';
      if (solicitante) params.append('solicitante', solicitante);
      if (status) params.append('status', status);
      if (inicio) params.append('data_inicio', inicio);
      if (fim) params.append('data_fim', fim);
      if (activeUnitId && activeUnitId !== 'all') params.append('unitId', activeUnitId);
      const list = await this.fetchFromApi(`/api/despesas${params.toString() ? '?' + params.toString() : ''}`);
      if (Array.isArray(list)) window.AppBalancesCache = list;
    } catch(e) { console.warn('Não foi possível recalcular saldos filtrados.', e); }
    UI.updateBalanceCards?.();
    ensureTabs();
    return r;
  };
  const oldRoute = App.onRouteChanged?.bind(App);
  App.onRouteChanged = function(hash){
    if (hash !== '#despesas') sessionStorage.removeItem('cc_expense_approval_mode');
    const r = oldRoute(hash);
    setTimeout(()=>{
      ensureTabs();
      UI.updateBalanceCards?.();
      if (hash === '#unidades') {
        UI.renderUnits();
      }
    },120);
    return r;
  };

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ensureTabs(); UI.updateBalanceCards?.();},800));
  // MutationObserver de abas desativado para evitar pisca-pisca/duplicidade.
})();


/* ===== correcoes-30-06.js ===== */

/* Correções 30/06 - saldo, datas, PDF e abas sem recriar módulos */
(function(){
  if (window.__ccCorrecoes3006) return; window.__ccCorrecoes3006 = true;
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = (v)=>{
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    let raw = String(v).trim().replace(/[^0-9,.-]/g,'');
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',','.');
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  const money = (v)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v));
  window.CC_num = num; window.CC_money = money;
  window.CC_safeDateBR = function(value){
    if (!value) return '-';
    const raw = String(value).trim();
    
    // 1. Já no formato BR: manter intacto
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:.*?(\d{2}):(\d{2}))?/);
    if (br) return `${br[1]}/${br[2]}/${br[3]}${br[4] ? ' ' + br[4] + ':' + br[5] : ''}`;
    
    // 2. Data pura YYYY-MM-DD (ou com hora zerada de BD): exibir diretamente sem deslocamento de timezone
    const pureDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00:00)?/);
    if (pureDate && !raw.includes('T') && !raw.includes('Z')) {
      return `${pureDate[3]}/${pureDate[2]}/${pureDate[1]}`;
    }
    
    // 3. Timestamp ISO completo com fuso horário (ex: Z, -03:00): converter para o fuso local do navegador
    if (raw.includes('T') || raw.includes('Z') || raw.includes('-03') || raw.includes('+00')) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const datePart = d.toLocaleDateString('pt-BR');
        const timePart = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${datePart} ${timePart}`;
      }
    }
    
    // 4. Regex fallback para outros formatos ISO
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}${iso[4] ? ' ' + iso[4] + ':' + iso[5] : ''}`;
    
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
  };

  function fixApprovalValues(){
    document.querySelectorAll('.approval-item-row').forEach(row=>{
      const val = row.querySelector('.item-val-approved');
      const qty = row.querySelector('.item-qty-approved');
      const sel = row.querySelector('.item-evaluation-status');
      if (!val || !sel) return;
      const original = num(val.getAttribute('data-item-val-sol'));
      val.setAttribute('data-item-val-sol', String(original));
      val.max = String(original);
      if (sel.value === 'aprovado') val.value = original.toFixed(2);
      const label = row.querySelector('span');
      if (label && /Solicitado:/.test(label.textContent)) {
        const qtd = qty ? num(qty.getAttribute('data-item-qty-sol')) : '';
        label.textContent = `Solicitado: ${money(original)}${qtd ? ' (' + qtd + ' diárias)' : ''}`;
      }
    });
    let total=0;
    document.querySelectorAll('.approval-item-row').forEach(row=>{
      const st=row.querySelector('.item-evaluation-status')?.value;
      if (st !== 'reprovado' && st !== 'correcao') total += num(row.querySelector('.item-val-approved')?.value);
    });
    const totalEl = document.getElementById('det-despesa-total-aprovado-display');
    if (totalEl) totalEl.textContent = money(total);
  }

  const oldShow = window.App && App.showDespesaDetails;
  if (oldShow) {
    App.showDespesaDetails = async function(id){
      const r = await oldShow.apply(this, arguments);
      setTimeout(()=>{ fixApprovalValues(); ensureBalancePdfButton(id); }, 180);
      return r;
    };
  }

  const oldSubmit = window.App && App.submitExpenseApproval;
  if (oldSubmit) {
    App.submitExpenseApproval = async function(){
      fixApprovalValues();
      try {
        const ret = await oldSubmit.apply(this, arguments);
        return ret;
      } catch(e) {
        console.error(e);
        alert('Erro ao registrar parecer: ' + e.message);
      }
    };
  }

  function ensureBalancePdfButton(id){
    const footer = document.querySelector('#modal-despesa-details .login-card > div:last-child');
    if (!footer || document.getElementById('btn-gerar-pdf-saldo')) return;
    const btn = document.createElement('button');
    btn.id='btn-gerar-pdf-saldo'; btn.type='button'; btn.className='btn btn-primary';
    btn.style.cssText='width:150px;font-size:.85rem;'; btn.textContent='Gerar PDF';
    btn.onclick=()=>App.generateBalanceRequestPdf(document.getElementById('det-despesa-id')?.textContent || id);
    footer.insertBefore(btn, footer.firstChild);
  }

  if (window.App) App.generateBalanceRequestPdf = async function(id){
    try{
      const data = await this.fetchFromApi(`/api/despesas/${encodeURIComponent(id)}`);
      const rows = Array.isArray(data.itens) && data.itens.length ? data.itens.map(item=>`<tr><td>${esc(item.categoria)}</td><td>${esc(item.quantidade_solicitada ?? '-')}</td><td>${esc(item.quantidade_aprovada ?? '-')}</td><td>${money(item.valor_solicitado)}</td><td>${item.valor_aprovado == null ? '-' : money(item.valor_aprovado)}</td><td>${esc(item.status || '-')}</td><td>${esc(item.justificativa || '-')}</td></tr>`).join('') : '';
      const totalSol = (data.itens||[]).reduce((s,i)=>s+num(i.valor_solicitado),0) || num(data.totalGeral);
      const totalApr = (data.itens||[]).reduce((s,i)=>s+num(i.valor_aprovado),0);
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Solicitação de Saldo #${esc(data.id)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0 0 12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:18px}.box{border:1px solid #999;padding:12px;border-radius:6px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:7px;font-size:12px;text-align:left}th{background:#eee}.totais td{font-weight:bold}.assinatura{margin-top:40px;border:1px solid #999;padding:18px;border-radius:6px}.linha{margin-top:24px}.print{margin-bottom:18px}@media print{.print{display:none}}</style></head><body><button class="print" onclick="window.print()">Imprimir</button><h1>Solicitação de Saldo #${esc(data.id)}</h1><div class="box grid"><div><b>Empresa:</b> ${esc(data.empresa || data.unitName || data.unitId || '-')}</div><div><b>Solicitante:</b> ${esc(data.solicitante || '-')}</div><div><b>Data/Hora:</b> ${esc(window.CC_safeDateBR(data.data_solicitacao || data.created_at))} ${esc(data.hora_solicitacao || '')}</div><div><b>Placa:</b> ${esc(data.placa_veiculo || '-')}</div><div><b>Rota/Destino:</b> ${esc(data.rota_destino || '-')}</div><div><b>Status:</b> ${esc(data.status || '-')}</div><div style="grid-column:1/-1"><b>Justificativa:</b> ${esc(data.justificativa || '-')}</div></div><h2>Detalhamento de Custos</h2><table><thead><tr><th>Descrição</th><th>Qtd Sol.</th><th>Qtd Apr.</th><th>Vl. Solicitado</th><th>Vl. Aprovado</th><th>Status</th><th>Justificativa</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="totais"><td colspan="3">Totais</td><td>${money(totalSol)}</td><td>${money(totalApr)}</td><td colspan="2"></td></tr></tfoot></table><div class="assinatura"><div class="linha"><b>Aprovado por:</b> ______________________________________________</div><div class="linha"><b>Assinatura:</b> ________________________________________________</div><div class="linha"><b>Data:</b> ____ / ____ / ______</div><div class="linha"><b>Observação/Parecer:</b> _______________________________________</div></div><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
      const w = window.open('', '_blank'); w.document.write(html); w.document.close();
    }catch(e){ alert('Erro ao gerar PDF: '+e.message); }
  };

  // Corrigir datas já renderizadas como Invalid Date sem esconder erro real.
  setInterval(()=>{
    document.querySelectorAll('td').forEach(td=>{ if (/^Invalid Date$/i.test(td.textContent.trim())) td.textContent='-'; });
    // Remove aba visual duplicada mantendo a primeira ocorrência de cada texto.
    document.querySelectorAll('.view-tabs').forEach(host=>{
      const seen = new Set();
      [...host.querySelectorAll('a,button')].forEach(el=>{ const key=el.textContent.trim(); if (seen.has(key)) el.remove(); else seen.add(key); });
    });
  }, 500);
})();


/* ===== correcoes-rodada-atual.js ===== */

/* Correções rodada atual 30/06 - abas, exclusões, aprovação de despesas e PDF em lote */
(function(){
  'use strict';
  if (window.__ccRodadaAtual3006) return; window.__ccRodadaAtual3006 = true;

  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = (v)=>String(v ?? '').trim().toLowerCase();
  const isPending = (s)=>/pendente|aguardando/i.test(String(s||''));
  const isApproved = (s)=>/aprovad/i.test(String(s||''));
  const num = window.CC_num || ((v)=>{ if(typeof v==='number') return Number.isFinite(v)?v:0; if(!v) return 0; let raw=String(v).replace(/[^0-9,.-]/g,''); if(raw.includes(',')) raw=raw.replace(/\./g,'').replace(',','.'); const n=parseFloat(raw); return Number.isFinite(n)?n:0; });
  const money = window.CC_money || ((v)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v)));
  const dateBR = window.CC_safeDateBR || ((v)=>{ if(!v) return '-'; const iso=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if(iso) return `${iso[3]}/${iso[2]}/${iso[1]}`; return String(v); });
  const user = ()=>Store.getLoggedUser?.() || {};
  const perms = (u=user())=>Array.isArray(u.permissions)?u.permissions:[];
  const isAdmin = (u=user())=>u.profile==='Administrador' || perms(u).includes('Administrador') || perms(u).includes('Administrador (Acesso Total)');
  const canApproveExpense = (u=user())=>isAdmin(u) || u.profile==='Financeiro' || perms(u).includes('Financeiro') || perms(u).includes('Aprovação de Despesas');

  function apiDelete(url){
    if (!window.App?.fetchFromApi) return Promise.resolve();
    return App.fetchFromApi(url,{method:'DELETE'}).catch(e=>{ console.warn('Falha no DELETE API, removendo local se possível:', url, e); });
  }

  function cleanTabs(){
    return; // abas controladas por js/correcao-abas-navegacao-30-06.js
    document.querySelectorAll('.view-tabs').forEach(host=>{
      const original = [...host.querySelectorAll('a,button')];
      const byText = new Map();
      original.forEach(el=>{
        const key=(el.textContent||'').trim();
        if(!key) return;
        if(byText.has(key)) el.remove(); else byText.set(key,el);
      });
      const despesas = byText.get('Despesas de Campo');
      const sol = byText.get('Solicitação de Saldo');
      const aprSaldo = byText.get('Aprovação de Saldo');
      const aprDesp = byText.get('Aprovação de Despesas');
      [despesas,sol,aprSaldo,aprDesp].filter(Boolean).forEach(el=>host.appendChild(el));
      if (despesas) {
        despesas.href = '#despesas';
        despesas.onclick = function(){ sessionStorage.removeItem('cc_expense_approval_mode'); setTimeout(()=>App.loadExpenses?.(),60); };
      }
      if (aprDesp) {
        aprDesp.href = '#despesas';
        aprDesp.style.display = canApproveExpense() ? 'flex' : 'none';
        aprDesp.onclick = function(){ sessionStorage.setItem('cc_expense_approval_mode','1'); setTimeout(()=>App.loadExpenses?.(),60); };
      }
      const approvalMode = sessionStorage.getItem('cc_expense_approval_mode')==='1' && location.hash==='#despesas';
      [despesas,sol,aprSaldo,aprDesp].filter(Boolean).forEach(el=>el.classList.remove('active'));
      if (approvalMode && aprDesp) aprDesp.classList.add('active');
      else if (location.hash==='#despesas' && despesas) despesas.classList.add('active');
      else [sol,aprSaldo].filter(Boolean).forEach(el=>{ if(el.getAttribute('href')===location.hash) el.classList.add('active'); });
    });
  }

  // Aprovação de despesas deve mostrar só pendentes e sem formulário de registro.
  if (window.App?.loadExpenses && !App.__ccLoadExpensesAtual) {
    const oldLoadExpenses = App.loadExpenses.bind(App); App.__ccLoadExpensesAtual = true;
    App.loadExpenses = async function(){
      const ret = await oldLoadExpenses();
      setTimeout(()=>{
        const mode = sessionStorage.getItem('cc_expense_approval_mode')==='1' && location.hash==='#despesas';
        const all = window.AppExpensesCache || Store.getExpenses?.() || [];
        if (mode) {
          UI.renderExpenses((all||[]).filter(e=>isPending(e.status)));
          const title = document.querySelector('#view-despesas h1, #view-despesas .page-title'); if (title) title.textContent='Aprovação de Despesas';
          const regCard = [...document.querySelectorAll('#view-despesas .card, #view-despesas .panel, #view-despesas section')].find(el=>/Registrar Despesas de Viagem/i.test(el.textContent||''));
          if (regCard) regCard.style.display='none';
        }
        cleanTabs(); enhanceBulkActions();
      },120);
      return ret;
    };
  }

  function listApiInfo(tbodyId){
    return {
      'expenses-table-body': { get:'getExpenses', save:'saveExpenses', endpoint:'/api/despesas-reembolsos', reload:()=>App.loadExpenses?.(), selector:(x)=>x.id },
      'clients-table-body': { get:'getClients', save:'saveClients', endpoint:'/api/clientes', reload:()=>App.refreshAllLists?.(), selector:(x)=>x.id },
      'tickets-table-body': { get:'getTickets', save:'saveTickets', endpoint:'/api/chamados', reload:()=>App.loadTickets?.(), selector:(x)=>x.id },
      'prospects-table-body': { get:'getProspects', save:'saveProspects', endpoint:'/api/prospeccoes', reload:()=>App.loadProspects?.(), selector:(x)=>x.id },
      'balances-table-body': { get:'getBalanceRequests', save:'saveBalances', endpoint:'/api/despesas', reload:()=>App.refreshAllLists?.(), selector:(x)=>x.id }
    }[tbodyId];
  }
  function extractRowId(tr){
    if (tr.dataset.id) return tr.dataset.id;
    const oc = tr.getAttribute('onclick') || '';
    let m = oc.match(/['"]([^'"]+)['"]/); if (m) return m[1];
    const btn = tr.querySelector('button[onclick],a[onclick],select[onchange]');
    m = (btn?.getAttribute('onclick') || btn?.getAttribute('onchange') || '').match(/['"]([^'"]+)['"]/); if (m) return m[1];
    const first = tr.children[0]?.textContent?.replace('#','').trim(); return first || '';
  }
  function enhanceTableBulk(tbodyId){
    const tbody = document.getElementById(tbodyId); if(!tbody) return;
    const info = listApiInfo(tbodyId); if(!info) return;
    const table = tbody.closest('table'); if(!table) return;
    const headRow = table.querySelector('thead tr'); if(!headRow) return;
    if (!headRow.querySelector('.cc-bulk-all')) headRow.insertAdjacentHTML('afterbegin','<th style="width:34px;"><input type="checkbox" class="cc-bulk-all" title="Selecionar todos"></th>');
    [...tbody.querySelectorAll('tr')].forEach(tr=>{
      if(tr.querySelector('.cc-bulk-row')) return;
      const id = extractRowId(tr);
      tr.dataset.id = id;
      tr.insertAdjacentHTML('afterbegin',`<td onclick="event.stopPropagation()" style="width:34px;"><input type="checkbox" class="cc-bulk-row" value="${esc(id)}"></td>`);
    });
    let btn = table.parentElement.querySelector('.cc-bulk-delete-btn');
    if(!btn){
      btn=document.createElement('button'); btn.className='btn btn-danger btn-sm cc-bulk-delete-btn'; btn.textContent='Excluir Selecionados'; btn.style.cssText='display:none;margin:8px 0;float:right;'; table.parentElement.insertBefore(btn,table);
    }
    const update=()=>{ const n=tbody.querySelectorAll('.cc-bulk-row:checked').length; btn.style.display=n?'inline-block':'none'; };
    if(!table.dataset.ccBulkBound){
      table.dataset.ccBulkBound='1';
      table.addEventListener('change',e=>{
        if(e.target.classList.contains('cc-bulk-all')) tbody.querySelectorAll('.cc-bulk-row').forEach(c=>c.checked=e.target.checked);
        update();
      });
    }
    btn.onclick = async ()=>{
      if(!isAdmin()) return alert('Somente administrador pode excluir registros.');
      const ids=[...tbody.querySelectorAll('.cc-bulk-row:checked')].map(c=>String(c.value)).filter(Boolean);
      if(!ids.length) return;
      if(!confirm(`Excluir ${ids.length} registro(s) selecionado(s)?`)) return;
      for(const id of ids) await apiDelete(`${info.endpoint}/${encodeURIComponent(id)}`);
      if(Store[info.get] && Store[info.save]){
        const list=(Store[info.get]()||[]).filter(x=>!ids.includes(String(info.selector(x)))); Store[info.save](list);
      }
      info.reload?.(); App.refreshAllLists?.(); setTimeout(()=>{enhanceBulkActions(); UI.updateBalanceCards?.();},250);
    };
    update();
  }
  function enhanceProspectsId(){
    const cont=document.getElementById('prospect-list-container'); const tbody=cont?.querySelector('tbody'); if(tbody && !tbody.id) tbody.id='prospects-table-body';
    if(tbody){
      [...tbody.querySelectorAll('tr')].forEach(tr=>{ if(!tr.dataset.id) tr.dataset.id=extractRowId(tr); });
    }
  }
  function enhanceBulkActions(){
    enhanceProspectsId();
    ['expenses-table-body','clients-table-body','tickets-table-body','prospects-table-body'].forEach(enhanceTableBulk);
  }

  // Exclusão individual real de leads com API + local.
  if (window.App && !App.__ccDeleteProspectAtual) {
    App.__ccDeleteProspectAtual = true;
    App.deleteProspectReal = async function(id){
      if(!isAdmin()) return alert('Somente administrador pode excluir registros.');
      if(!confirm('Deseja excluir permanentemente este lead de prospecção?')) return;
      await apiDelete(`/api/prospeccoes/${encodeURIComponent(id)}`);
      Store.saveProspects((Store.getProspects?.()||[]).filter(p=>String(p.id)!==String(id)));
      await App.loadProspects?.(); App.refreshAllLists?.(); App.showToast?.('Lead removido permanentemente!');
    };
  }

  // PDF individual: tabela com largura fixa e assinatura sem sobreposição.
  if (window.App && !App.__ccPdfSaldoAtual) {
    App.__ccPdfSaldoAtual = true;
    App.generateBalanceRequestPdf = async function(id){
      try{
        const data = await this.fetchFromApi(`/api/despesas/${encodeURIComponent(id)}`);
        const itens = Array.isArray(data.itens)?data.itens:[];
        const rows = itens.map(item=>`<tr><td class="desc">${esc(item.categoria||item.descricao||'-')}</td><td class="qtd">${esc(item.quantidade_solicitada??'-')}</td><td class="qtd">${esc(item.quantidade_aprovada??'-')}</td><td class="valor">${money(item.valor_solicitado)}</td><td class="valor">${item.valor_aprovado==null?'-':money(item.valor_aprovado)}</td><td class="status">${esc(item.status||'-')}</td><td class="just">${esc(item.justificativa||'-')}</td></tr>`).join('');
        const totalSol = itens.reduce((s,i)=>s+num(i.valor_solicitado),0) || num(data.totalGeral);
        const totalApr = itens.reduce((s,i)=>s+num(i.valor_aprovado),0);
        const html = buildSaldoPdfHtml([data], rows, totalSol, totalApr, `SOLICITAÇÃO DE SALDO / ADIANTAMENTO DE SALDO`);
        const w=window.open('','_blank'); w.document.write(html); w.document.close();
      }catch(e){ alert('Erro ao gerar PDF: '+e.message); }
    };
  }
  function buildSaldoPdfHtml(requests, rowsSingle, totalSolSingle, totalAprSingle, title){
    const blocks = requests.map((data,idx)=>{
      const itens = Array.isArray(data.itens)?data.itens:[];
      const rows = rowsSingle && requests.length===1 ? rowsSingle : itens.map(item=>`<tr><td class="desc">${esc(item.categoria||item.descricao||'-')}</td><td class="qtd">${esc(item.quantidade_solicitada??'-')}</td><td class="qtd">${esc(item.quantidade_aprovada??'-')}</td><td class="valor">${money(item.valor_solicitado)}</td><td class="valor">${item.valor_aprovado==null?'-':money(item.valor_aprovado)}</td><td class="status">${esc(item.status||'-')}</td><td class="just">${esc(item.justificativa||'-')}</td></tr>`).join('');
      const totalSol = requests.length===1 && totalSolSingle!=null ? totalSolSingle : (itens.reduce((s,i)=>s+num(i.valor_solicitado),0)||num(data.totalGeral));
      const totalApr = requests.length===1 && totalAprSingle!=null ? totalAprSingle : itens.reduce((s,i)=>s+num(i.valor_aprovado),0);
      return `<section class="solicitacao ${idx?'page-break':''}"><div class="meta"><div><b>Solicitação ID:</b> #${esc(data.id)}</div><div><b>Emissão:</b> ${new Date().toLocaleString('pt-BR')}</div><div><b>Status:</b> ${esc(data.status||'-')}</div><div><b>Empresa:</b> ${esc(data.empresa||data.unitName||UI.getUnitName?.(data.unitId)||'-')}</div></div><hr><h2>DADOS OPERACIONAIS</h2><div class="grid"><div><b>Solicitante:</b> ${esc(data.solicitante||data.nome_solicitante||'-')}</div><div><b>Placa do Veículo:</b> ${esc(data.placa_veiculo||'-')}</div><div><b>Rota / Cidades Destino:</b> ${esc(data.rota_destino||'-')}</div><div><b>Data/Hora:</b> ${esc(dateBR(data.data_solicitacao||data.created_at))} ${esc(data.hora_solicitacao||'')}</div></div><h3>JUSTIFICATIVA:</h3><p>${esc(data.justificativa||'-')}</p><table><thead><tr><th class="desc">Item / Descrição</th><th class="qtd">Qtd S.</th><th class="qtd">Qtd A.</th><th class="valor">Vl. Sol.</th><th class="valor">Vl. Apr.</th><th class="status">Status</th><th class="just">Justificativa</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3"><b>VALORES TOTAIS</b></td><td class="valor"><b>${money(totalSol)}</b></td><td class="valor"><b>${money(totalApr)}</b></td><td colspan="2"></td></tr></tfoot></table><div class="assinatura"><h3>PARECER DO APROVADOR</h3><div class="campo"></div><div class="line"><b>Aprovado por:</b> __________________________________________</div><div class="line"><b>Cargo:</b> _________________________________________________</div><div class="line"><b>Assinatura:</b> ____________________________________________</div><div class="line"><b>Data:</b> ____ / ____ / ______</div></div></section>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;margin:0;color:#111}.top{background:#2563eb;color:white;padding:24px 28px;font-size:20px;font-weight:bold}.wrap{padding:26px}.meta,.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 38px}.solicitacao{max-width:980px;margin:0 auto 32px}.page-break{page-break-before:always}hr{border:0;border-top:4px solid #e5e7eb;margin:18px 0}h2{font-size:16px;margin:18px 0}h3{font-size:14px;margin:20px 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:20px}th,td{padding:9px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px;word-break:break-word;overflow-wrap:anywhere}th{background:#f0f0f0;text-align:left}.desc{width:24%}.qtd{width:7%;text-align:center}.valor{width:12%;text-align:right;white-space:nowrap}.status{width:16%}.just{width:22%}.assinatura{margin-top:36px;border-top:3px solid #e5e7eb;padding-top:18px}.campo{height:48px;border-bottom:1px solid #999;margin-bottom:18px}.line{margin-top:18px}.print{margin:14px 0 0 26px}@media print{.print{display:none}.top{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><button class="print" onclick="window.print()">Imprimir</button><div class="top">${esc(title)}</div><div class="wrap">${blocks}</div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`;
  }

  // PDF em lote para Solicitações de Saldo com filtros simples/dinâmicos.
  function ensureBatchPdfButton(){
    const body = document.getElementById('despesas-solicitacoes-table-body'); if(!body) return;
    const card = body.closest('.card, .panel, section, div'); if(!card || document.getElementById('btn-pdf-lote-saldo')) return;
    const btn=document.createElement('button'); btn.id='btn-pdf-lote-saldo'; btn.className='btn btn-success btn-sm'; btn.textContent='Gerar PDF em Lote'; btn.style.cssText='float:right;margin:0 0 10px 8px;';
    btn.onclick=showBatchPdfModal; card.insertBefore(btn, card.querySelector('table') || card.firstChild);
  }
  async function showBatchPdfModal(){
    const solicitantes=[...new Set((window.AppBalancesCache||Store.getBalanceRequests?.()||[]).map(x=>x.solicitante||x.nome_solicitante).filter(Boolean))];
    const statuses=[...new Set((window.AppBalancesCache||Store.getBalanceRequests?.()||[]).map(x=>x.status).filter(Boolean))];
    const html=`<div id="modal-pdf-lote-saldo" class="modal" style="display:flex;"><div class="login-card" style="max-width:640px;width:95%;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;"><h2 style="margin:0;color:var(--primary-color);">PDF em Lote - Solicitações</h2><button class="btn btn-secondary" onclick="document.getElementById('modal-pdf-lote-saldo').remove()">Fechar</button></div><div class="form-grid two-columns"><div class="form-group"><label>Data inicial</label><input id="pdf-lote-inicio" type="date"></div><div class="form-group"><label>Data final</label><input id="pdf-lote-fim" type="date"></div><div class="form-group"><label>Solicitante</label><select id="pdf-lote-solicitante"><option value="">Todos</option>${solicitantes.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div><div class="form-group"><label>Status</label><select id="pdf-lote-status"><option value="">Todos</option>${statuses.map(s=>`<option>${esc(s)}</option>`).join('')}<option value="Pendente">Pendente</option><option value="Aprovada">Aprovada</option><option value="Reprovada">Reprovada</option></select></div><div class="form-group"><label>Placa</label><input id="pdf-lote-placa" placeholder="Ex: SYY3E48"></div><div class="form-group"><label>Rota/Destino</label><input id="pdf-lote-rota" placeholder="Ex: gv"></div></div><button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="App.generateBatchBalancePdf()">Gerar PDF</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend',html);
  }
  if(window.App) App.generateBatchBalancePdf = async function(){
    try{
      const inicio=document.getElementById('pdf-lote-inicio')?.value; const fim=document.getElementById('pdf-lote-fim')?.value; const sol=norm(document.getElementById('pdf-lote-solicitante')?.value); const st=norm(document.getElementById('pdf-lote-status')?.value); const placa=norm(document.getElementById('pdf-lote-placa')?.value); const rota=norm(document.getElementById('pdf-lote-rota')?.value);
      let list=window.AppBalancesCache || await this.fetchFromApi('/api/despesas');
      list=(Array.isArray(list)?list:[]).filter(x=>{
        const d=String(x.data_solicitacao||x.created_at||x.date||'').slice(0,10);
        if(inicio && d<inicio) return false; if(fim && d>fim) return false;
        if(sol && norm(x.solicitante||x.nome_solicitante)!==sol) return false;
        if(st && !norm(x.status).includes(st.replace('aprovada','aprovad'))) return false;
        if(placa && !norm(x.placa_veiculo).includes(placa)) return false;
        if(rota && !norm(x.rota_destino).includes(rota)) return false;
        return true;
      });
      const detailed=[]; for(const x of list){ try{ detailed.push(await this.fetchFromApi(`/api/despesas/${encodeURIComponent(x.id)}`)); } catch(e){ detailed.push(x); } }
      if(!detailed.length) return alert('Nenhuma solicitação encontrada para os filtros informados.');
      const w=window.open('','_blank'); w.document.write(buildSaldoPdfHtml(detailed,null,null,null,'RELATÓRIO EM LOTE - SOLICITAÇÕES DE SALDO')); w.document.close(); document.getElementById('modal-pdf-lote-saldo')?.remove();
    }catch(e){ alert('Erro ao gerar PDF em lote: '+e.message); }
  };

  const oldRoute = window.App?.onRouteChanged?.bind(App);
  if(oldRoute && !App.__ccRouteAtual){ App.__ccRouteAtual=true; App.onRouteChanged=function(hash){ if(hash!=='#despesas') sessionStorage.removeItem('cc_expense_approval_mode'); const r=oldRoute(hash); setTimeout(()=>{cleanTabs();enhanceBulkActions();ensureBatchPdfButton();},150); return r; }; }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{cleanTabs();enhanceBulkActions();ensureBatchPdfButton();},900));
  new MutationObserver(()=>setTimeout(()=>{enhanceBulkActions();ensureBatchPdfButton();},120)).observe(document.documentElement,{childList:true,subtree:true});
})();


/* ===== correcao-abas-navegacao-30-06.js ===== */

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


/* ===== correcao-troca-e-abas-final-30-06.js ===== */

/* Correção final 30/06 - abas restritas ao módulo correto + simulador de troca com edição própria */
(function(){
  'use strict';
  if (window.__ccTrocaAbasFinal3006) return;
  window.__ccTrocaAbasFinal3006 = true;

  const FINANCE_LABELS = ['Despesas de Campo','Solicitação de Saldo','Aprovação de Saldo','Aprovação de Despesas'];
  const EXCHANGE_LABELS = ['Nova Troca','Histórico de Trocas','Importar Planilha'];
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = (v)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
  const currentUser = ()=> (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
  const perms = (u=currentUser()) => Array.isArray(u.permissions) ? u.permissions : [];
  const isAdmin = (u=currentUser()) => u.profile === 'Administrador' || u.role === 'Administrador' || perms(u).includes('Administrador') || perms(u).includes('Administrador (Acesso Total)');
  const uid = (u=currentUser()) => String(u.id ?? u.user_id ?? u.usuario_id ?? u.username ?? '');
  const ownerId = (sim) => String(sim.seller_id ?? sim.user_id ?? sim.usuario_id ?? sim.created_by ?? '');
  const canEditSim = (sim) => isAdmin() || ownerId(sim) === uid();

  function cleanExchangeTabs(){
    const host = document.querySelector('#view-simulador-troca .view-tabs');
    if (!host) return;
    Array.from(host.querySelectorAll('a,button')).forEach(el => {
      const label = (el.textContent || '').replace(/\s+/g,' ').trim();
      if (FINANCE_LABELS.includes(label)) el.remove();
    });
    // Garante que só as três abas próprias apareçam e não exista confirmação/injeção financeira.
    Array.from(host.querySelectorAll('a,button')).forEach(el => {
      const label = (el.textContent || '').replace(/\s+/g,' ').trim();
      if (!EXCHANGE_LABELS.includes(label)) el.remove();
    });
  }

  function cleanFinanceTabsOutsideFinance(){
    if (location.hash === '#simulador-troca') cleanExchangeTabs();
  }

  document.addEventListener('DOMContentLoaded', cleanFinanceTabsOutsideFinance);
  window.addEventListener('hashchange', () => setTimeout(cleanFinanceTabsOutsideFinance, 80));
  document.addEventListener('click', () => setTimeout(cleanFinanceTabsOutsideFinance, 80), true);

  const oldRoute = window.App && App.onRouteChanged;
  if (oldRoute && !App.__ccTrocaRouteClean3006) {
    App.__ccTrocaRouteClean3006 = true;
    App.onRouteChanged = function(hash){
      const ret = oldRoute.apply(this, arguments);
      setTimeout(cleanFinanceTabsOutsideFinance, 80);
      return ret;
    };
  }

  const oldInit = window.App && App.initSimuladorTroca;
  if (oldInit && !App.__ccTrocaInitWrapped3006) {
    App.__ccTrocaInitWrapped3006 = true;
    App.initSimuladorTroca = async function(){
      const ret = await oldInit.apply(this, arguments);
      cleanExchangeTabs();
      return ret;
    };
  }

  function normalizeSimulation(sim){
    return {
      ...sim,
      cliente_codigo: sim.cliente_codigo ?? sim.client_code ?? sim.codigo_cliente ?? '',
      cliente_nome_fantasia: sim.cliente_nome_fantasia ?? sim.client_name ?? sim.nome_cliente ?? '',
      total: Number(sim.total ?? sim.valor_total ?? 0) || 0,
      seller_name: sim.seller_name ?? sim.vendedor_nome ?? sim.usuario_nome ?? '',
      seller_id: sim.seller_id ?? sim.user_id ?? sim.usuario_id ?? sim.created_by ?? '',
      created_at: sim.created_at ?? sim.data ?? sim.createdAt ?? new Date().toISOString(),
      items: Array.isArray(sim.items) ? sim.items : []
    };
  }

  function filterOwn(list){
    const u = currentUser();
    if (isAdmin(u)) return list;
    const myId = uid(u);
    return list.filter(sim => ownerId(sim) === myId || !ownerId(sim));
  }

  if (window.App && !App.__ccTrocaLoadHistory3006) {
    App.__ccTrocaLoadHistory3006 = true;
    App.loadExchangeHistory = async function(){
      try {
        cleanExchangeTabs();
        const data = await App.fetchFromApi('/api/exchange/simulations');
        window.AllExchangeSimulations = filterOwn((data || []).map(normalizeSimulation));
        UI.renderExchangeHistory(window.AllExchangeSimulations);
      } catch (err) {
        console.error('Erro ao buscar histórico de simulações:', err);
      }
    };
  }

  if (window.UI && !UI.__ccTrocaRenderHistory3006) {
    UI.__ccTrocaRenderHistory3006 = true;
    UI.renderExchangeHistory = function(simulations){
      const listContainer = document.getElementById('exchange-history-list');
      if (!listContainer) return;
      const list = filterOwn((simulations || []).map(normalizeSimulation));
      if (!list.length) {
        listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:.85rem;">Nenhuma simulação de troca encontrada.</div>';
        return;
      }
      listContainer.innerHTML = list.map(sim => {
        const d = new Date(sim.created_at);
        const data = isNaN(d) ? '-' : d.toLocaleDateString('pt-BR');
        const hora = isNaN(d) ? '' : d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        const editBtn = canEditSim(sim) ? `<button class="btn btn-secondary btn-sm" type="button" onclick="event.stopPropagation(); App.editExchangeSimulation('${esc(sim.id)}')">Editar</button>` : '';
        const deleteBtn = canEditSim(sim) ? `<button class="btn btn-danger btn-sm" type="button" onclick="event.stopPropagation(); App.deleteExchangeSimulation('${esc(sim.id)}')">Excluir</button>` : '';
        return `
          <div class="exchange-history-item" id="exchange-history-item-${esc(sim.id)}">
            <div class="exchange-history-item-header" onclick="App.toggleExchangeHistoryItem('${esc(sim.id)}')" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <span>${esc(sim.cliente_codigo)} - ${esc(String(sim.cliente_nome_fantasia).toUpperCase())} | ${money(sim.total)} | ${esc(data)}</span>
              <div style="display:flex; gap:8px; align-items:center;">${editBtn}${deleteBtn}<button class="btn btn-primary btn-sm" type="button" onclick="event.stopPropagation(); App.showExchangeSimulationDetails('${esc(sim.id)}')">Detalhes</button></div>
            </div>
            <div class="exchange-history-item-details" id="exchange-history-details-${esc(sim.id)}" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed var(--border-color);">
              <div class="exchange-thermal-receipt-paper">
                <div style="text-align:center; font-weight:bold; margin-bottom:5px;">--------------------------<br>SIMULADOR DE TROCA<br>--------------------------</div>
                <div style="margin-bottom:10px; font-size:.82rem; display:flex; flex-direction:column; gap:4px; color:#222 !important; font-family:'Courier New', Courier, monospace !important; text-align:left;">
                  <div>Cliente: ${esc(sim.cliente_codigo)}</div>
                  <div>Nome: ${esc(String(sim.cliente_nome_fantasia).toUpperCase())}</div>
                  <div>Data: ${esc(data)} ${esc(hora)}</div>
                  <div>Vendedor: ${esc(sim.seller_name || sim.seller_id || '-')}</div>
                </div>
                <div id="exchange-history-details-list-${esc(sim.id)}" style="display:flex; flex-direction:column; gap:8px;"><div style="text-align:center; color:#666; padding:10px; font-family:monospace;">Clique em Detalhes para carregar os itens.</div></div>
                <div style="margin-top:10px; font-weight:bold; font-size:.85rem; color:#222 !important; font-family:'Courier New', Courier, monospace !important; text-align:left;">TOTAL GERAL: ${money(sim.total)}</div>
              </div>
            </div>
          </div>`;
      }).join('');
    };
  }

  if (window.App && !App.__ccTrocaEdit3006) {
    App.__ccTrocaEdit3006 = true;
    
    App.deleteExchangeSimulation = async function(id) {
      if (!confirm('Deseja realmente excluir permanentemente esta simulação de troca?')) return;
      try {
        const res = await App.fetchFromApi(`/api/exchange/simulations/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        });
        if (res && (res.success || res.ok)) {
          App.showToast && App.showToast('Simulação de troca excluída com sucesso!');
          App.loadExchangeHistory && App.loadExchangeHistory();
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir simulação: ' + (err.message || err));
      }
    };

    App.editExchangeSimulation = async function(id){
      try {
        const data = normalizeSimulation(await App.fetchFromApi(`/api/exchange/simulations/${encodeURIComponent(id)}`));
        if (!canEditSim(data)) return alert('Você só pode editar trocas que você mesmo cadastrou.');
        window.CurrentExchange = {
          id: data.id,
          editId: data.id,
          clientCode: data.cliente_codigo,
          clientName: data.cliente_nome_fantasia,
          items: (data.items || []).map(it => ({
            product_id: it.product_id || it.id || null,
            codigo: it.codigo,
            produto: it.produto,
            categoria: it.categoria || 'Outros',
            tipo: it.tipo,
            quantidade: Number(it.quantidade) || 0,
            valor_base: Number(it.valor_base) || 0,
            total_item: Number(it.total_item) || 0
          }))
        };
        const code = document.getElementById('exchange-client-code');
        const name = document.getElementById('exchange-client-name');
        if (code) code.value = window.CurrentExchange.clientCode;
        if (name) name.value = window.CurrentExchange.clientName;
        App.switchExchangeTab('nova');
        App.renderCurrentExchangeState && App.renderCurrentExchangeState();
        UI.renderExchangeCart && UI.renderExchangeCart(window.CurrentExchange.items);
        App.showToast && App.showToast('Troca carregada para edição.');
      } catch (err) {
        console.error(err);
        alert('Erro ao carregar troca para edição: ' + (err.message || err));
      }
    };

    App.finalizeExchange = async function(){
      const cur = window.CurrentExchange || {};
      const clientCode = cur.clientCode;
      const clientName = cur.clientName;
      const items = cur.items || [];
      if (!clientCode || !clientName) return alert('Identificação do cliente inválida.');
      if (!items.length) return alert('Adicione pelo menos um produto de troca antes de finalizar.');
      const totalGeral = items.reduce((acc, curr) => acc + (Number(curr.total_item)||0), 0);
      const loggedUser = currentUser();
      const now = new Date();
      const dateFormatted = now.toLocaleString('pt-BR');
      const sep = '-------------------------------';
      let msg = `${sep}\nSIMULADOR DE TROCA\n${sep}\n\nCLIENTE: ${clientCode}\nNOME: ${String(clientName).toUpperCase()}\n\nPRODUTOS:\n\n`;
      items.forEach((it, index) => {
        msg += `${index + 1}) ${it.codigo} - ${String(it.produto).toUpperCase()}\nTIPO: ${String(it.tipo).toUpperCase()}\n`;
        if (it.tipo === 'caixa') msg += `QTD: ${it.quantidade}\nVL. CAIXA: ${money(it.valor_base)}\n`;
        else msg += `QTD: ${it.quantidade} UN\nVL. UNIT: ${money(it.valor_base)}\n`;
        msg += `TOTAL: ${money(it.total_item)}\n\n`;
      });
      msg += `${sep}\nTOTAL DA TROCA: ${money(totalGeral)}\n${sep}\n\nVENDEDOR: ${loggedUser.name || loggedUser.username || ''}\nDATA: ${dateFormatted}\n`;
      try {
        const isEdit = !!cur.editId;
        const res = await App.fetchFromApi(isEdit ? `/api/exchange/simulations/${encodeURIComponent(cur.editId)}` : '/api/exchange/simulations', {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify({ cliente_codigo: clientCode, cliente_nome_fantasia: clientName, total: totalGeral, generated_message: msg, items })
        });
        if (res && (res.success || res.id || res.ok)) {
          App.showToast && App.showToast(isEdit ? 'Troca atualizada com sucesso!' : 'Lançamento da troca finalizado!');
          const workspace = document.getElementById('exchange-workspace');
          const receipt = document.getElementById('exchange-receipt-container');
          const output = document.getElementById('exchange-message-output');
          if (workspace) workspace.classList.add('hidden');
          if (receipt) receipt.classList.remove('hidden');
          if (output) output.value = msg;
          window.CurrentExchange = { clientCode:'', clientName:'', items:[] };
          UI.renderExchangeCart && UI.renderExchangeCart(window.CurrentExchange.items);
          App.loadExchangeHistory && App.loadExchangeHistory();
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao salvar simulação: ' + (err.message || err));
      }
    };
  }
})();


/* ===== version-check.js ===== */

/* Atualização automática do sistema após deploy. */
(function () {
  'use strict';
  const CURRENT_VERSION = '20260702-1255-login-estavel-sem-loop';
  const VERSION_KEY = 'controle_campo_app_version';
  window.__APP_VERSION__ = CURRENT_VERSION;

  async function clearAppCaches() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
    } catch (_) {}
  }

  async function checkVersion() {
    try {
      const res = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const remote = String(data.version || '').trim();
      if (!remote) return;
      const local = localStorage.getItem(VERSION_KEY);
      if (!local) {
        localStorage.setItem(VERSION_KEY, remote);
        return;
      }
      if (local !== remote) {
        localStorage.setItem(VERSION_KEY, remote);
        await clearAppCaches();
        const isLoginScreen = window.location.hash === '#login' || document.getElementById('login-wrapper-container')?.style.display === 'flex';
        const active = document.activeElement;
        const userTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
        const reloadKey = VERSION_KEY + '_reloaded_' + remote;
        if (isLoginScreen || userTyping || sessionStorage.getItem(reloadKey)) return;
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }
    } catch (_) {}
  }

  window.addEventListener('load', () => {
    localStorage.setItem(VERSION_KEY, localStorage.getItem(VERSION_KEY) || CURRENT_VERSION);
    checkVersion();
    setInterval(checkVersion, 45000);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.update().catch(() => {}))).catch(() => {});
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'APP_UPDATED') checkVersion();
      });
    }
  });
})();


/* ===== correcao-aprovacao-despesas-30-06.js ===== */

/* Correção 30/06 - Aprovação/Reprovação de Despesas
   Ajuste pontual: corrige botões do modal de despesa, fecha a tela após concluir
   e evita que erro secundário deixe a interface travada. */
(function(){
  'use strict';

  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const isApproved = (s) => norm(s) === 'aprovado' || norm(s) === 'aprovada';
  const isPending = (s) => norm(s) === 'pendente';
  const modalId = 'modal-registered-expense-details';

  function closeExpenseModal(){
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
  }

  function refreshExpenseScreens(){
    try { App.loadExpenses?.(); } catch(e) { console.warn('Falha ao recarregar despesas:', e); }
    try { UI.updateBalanceCards?.(); } catch(e) { console.warn('Falha ao atualizar cards:', e); }
    try { UI.renderDashboard?.(); } catch(e) { console.warn('Falha ao atualizar dashboard:', e); }
  }

  function updateLocalExpense(id, status, observacao){
    const patch = (list) => Array.isArray(list) ? list.map(e => String(e.id) === String(id)
      ? { ...e, status, observation: observacao || e.observation || '', observacao: observacao || e.observacao || '', updated_at: new Date().toISOString() }
      : e) : list;

    try {
      if (Array.isArray(window.AppExpensesCache)) window.AppExpensesCache = patch(window.AppExpensesCache);
      const local = Store.getExpenses?.();
      if (Array.isArray(local)) Store.saveExpenses?.(patch(local));
      if (UI.renderExpenses && Array.isArray(window.AppExpensesCache)) UI.renderExpenses(window.AppExpensesCache);
    } catch(e) {
      console.warn('Falha ao atualizar despesa localmente:', e);
    }
  }

  async function sendApproval(id, status, observacao){
    const payload = { status, observacao: observacao || '', observation: observacao || '' };
    const endpoints = [
      { url: `/api/despesas-reembolsos/${encodeURIComponent(id)}/approval`, options: { method:'PUT', body: JSON.stringify(payload) } },
      { url: `/api/expenses/${encodeURIComponent(id)}/approve`, options: { method:'PUT', body: JSON.stringify({ status, reason: observacao || '', observacao: observacao || '' }) } }
    ];

    let lastError = null;
    for (const ep of endpoints) {
      try {
        const result = await App.fetchFromApi(ep.url, ep.options);
        if (result && (result.success === false || result.ok === false)) {
          lastError = new Error(result.error || 'A API recusou a avaliação da despesa.');
          continue;
        }
        return result || { success:true };
      } catch(err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Erro ao avaliar despesa.');
  }

  async function setExpenseStatusFixed(id, status){
    if (!id) return alert('Despesa não identificada. Feche a tela e abra novamente.');

    let observacao = '';
    if (!isApproved(status)) {
      const label = norm(status).includes('correc') ? 'Informe o que precisa ser corrigido:' : 'Informe o motivo da reprovação:';
      observacao = prompt(label) || '';
      if (!observacao.trim()) {
        alert('A observação/motivo é obrigatória.');
        return;
      }
    }

    try {
      await sendApproval(id, status, observacao.trim());
      updateLocalExpense(id, status, observacao.trim());
      closeExpenseModal();
      refreshExpenseScreens();
      App.showToast?.('Despesa avaliada com sucesso.');
    } catch(err) {
      console.error('Erro ao avaliar despesa:', err);
      alert('Não foi possível avaliar a despesa: ' + (err.message || err));
    }
  }

  App.approveRegisteredExpense = (id) => setExpenseStatusFixed(id, 'Aprovado');
  App.rejectRegisteredExpense = (id) => setExpenseStatusFixed(id, 'Reprovado');
  App.correctRegisteredExpense = (id) => setExpenseStatusFixed(id, 'Correção Solicitada');

  // Garante que a aba Aprovação de Despesas continue exibindo só pendentes.
  const oldRenderExpenses = UI.renderExpenses?.bind(UI);
  if (oldRenderExpenses && !UI.__expenseApprovalButtonsFixed3006) {
    UI.__expenseApprovalButtonsFixed3006 = true;
    UI.renderExpenses = function(expenses){
      let list = Array.isArray(expenses) ? expenses : [];
      const approvalMode = sessionStorage.getItem('cc_expense_approval_mode') === '1';
      if (approvalMode) list = list.filter(e => isPending(e.status));
      oldRenderExpenses(list);
      const body = document.getElementById('expenses-table-body');
      if (!body) return;
      [...body.querySelectorAll('tr')].forEach((tr, idx) => {
        const exp = list[idx];
        if (!exp) return;
        const actionTd = tr.querySelector('td:last-child');
        if (!actionTd) return;
        if (approvalMode && isPending(exp.status)) {
          actionTd.innerHTML = `
            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.showRegisteredExpenseDetails('${String(exp.id).replace(/'/g,"\\'")}')">Ver Detalhes</button>
            <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveRegisteredExpense('${String(exp.id).replace(/'/g,"\\'")}')">Aprovar</button>
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.rejectRegisteredExpense('${String(exp.id).replace(/'/g,"\\'")}')">Reprovar</button>
            <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.correctRegisteredExpense('${String(exp.id).replace(/'/g,"\\'")}')">Correção</button>`;
        }
      });
    };
  }
})();


/* ===== correcoes-pendencias-geral-30-06.js ===== */

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
    const requested = names.map(norm);
    if (role === 'vendedor' && requested.some(n => ['chamados', 'chamados mecanicos'].includes(n))) return true;
    return requested.some(n => role === n || p.includes(n) || p.some(x => x.includes(n)));
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
    if (!window.App || !App.isLoggedIn || window.location.hash === '#login' || !window.Store || !Store.getToken || !Store.getToken()) return;
    const container = document.getElementById('notification-status-box');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      if (container) container.innerHTML = '<div class="alert alert-warning">Notificações não suportadas neste navegador.</div>';
      return;
    }
    try {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const isLoginScreen = window.location.hash === '#login' || document.getElementById('login-wrapper-container')?.style.display === 'flex';
        const active = document.activeElement;
        const userTyping = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
        if (!refreshing && !isLoginScreen && !userTyping) {
          refreshing = true;
          setTimeout(() => window.location.reload(), 250);
        }
      });

      const reg = await navigator.serviceWorker.register('/sw.js');
      reg.update().catch(()=>{});

      const keyResp = await api('/api/push/vapid-public-key').catch(()=>({publicKey:''}));
      if (keyResp && keyResp.publicKey) {
        const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (permission === 'granted') {
          const existing = await reg.pushManager.getSubscription();
          const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(keyResp.publicKey) });
          await api('/api/push/subscribe', { method:'POST', body: JSON.stringify({ subscription: sub }) });
        }
      }
    } catch (err) { console.warn('Push não habilitado:', err.message); }
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
      if (!window.App || !App.isLoggedIn || window.location.hash === '#login' || !window.Store || !Store.getToken || !Store.getToken()) return;
      const list = await api('/api/notificacoes');
      const unread = (list || []).filter(n => !n.read);
      
      // Update bell badge
      const badge = document.getElementById('cc-notification-badge');
      if (badge) {
        if (unread.length > 0) {
          badge.textContent = unread.length;
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }

      // Hide the old dashboard box overlay entirely
      const box = document.getElementById('cc-notifications-box');
      if (box) box.style.display = 'none';

      // Auto-refresh notifications page if active
      if (window.location.hash === '#notificacoes') {
        const container = document.getElementById('notif-page-list');
        if (container) {
          // Render items inside page
          if (!list || !list.length) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Nenhuma notificação encontrada.</div>';
          } else {
            container.innerHTML = list.map(n => `
              <div style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 15px; background: ${n.read ? 'transparent' : 'rgba(37,99,235,0.06)'}; border-left: 4px solid ${n.read ? 'var(--border-color)' : 'var(--primary-color)'};">
                <div>
                  <strong style="display: block; margin-bottom: 4px;">${escapeHtml(n.title)}</strong>
                  <div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 6px;">${escapeHtml(n.body || '')}</div>
                  <span style="font-size: 0.75rem; color: var(--text-muted);">${n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : ''}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  ${n.read ? '' : `<button class="btn btn-secondary btn-sm" onclick="App.markNotificationRead(${n.id})" type="button" style="padding: 4px 10px; font-size: 0.75rem;">Marcar como lida</button>`}
                  <button class="btn btn-primary btn-sm" onclick="App.openNotification(${n.id}, '${escapeAttr(n.target_hash || '')}')" type="button" style="padding: 4px 10px; font-size: 0.75rem;">Abrir</button>
                </div>
              </div>
            `).join('');
          }
        }
      }

      (list || []).filter(n => !n.read).slice(0,5).forEach(n => {
        if (!lastNotifIds.has(n.id) && window.Notification && Notification.permission === 'granted') {
          new Notification(n.title || 'Controle de Campo', { body: n.body || '', tag: 'cc-'+n.id });
        }
        lastNotifIds.add(n.id);
      });
    } catch (_) {}
  }
  function renderNotifications(list){
    // Obsolete - using subpage
  }
  function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(v){ return String(v ?? '').replace(/'/g, '\\&#39;'); }
  
  if (window.App) {
    App.openNotification = async function(id, hash){
      await api(`/api/notificacoes/${id}/read`, { method:'PUT' }).catch(()=>{});
      if (hash) window.location.hash = hash;
      setTimeout(pollNotifications, 400);
    };

    App.loadNotificationPage = async function() {
      await pollNotifications();
    };

    App.markNotificationRead = async function(id) {
      await api(`/api/notificacoes/${id}/read`, { method:'PUT' }).catch(()=>{});
      pollNotifications();
    };

    App.markAllNotificationsRead = async function() {
      try {
        const list = await api('/api/notificacoes');
        const unread = (list || []).filter(n => !n.read);
        for (const n of unread) {
          await api(`/api/notificacoes/${n.id}/read`, { method:'PUT' }).catch(()=>{});
        }
        pollNotifications();
      } catch(e) {}
    };

    App.setupPushNotificationsManual = async function(options) {
      const silent = !!(options && options.silent);
      const fail = (msg) => { if (!silent) alert(msg); return false; };
      if (!window.isSecureContext) return fail('Notificações Push exigem HTTPS. No Render/domínio HTTPS deve funcionar normalmente.');
      if (!('serviceWorker' in navigator)) return fail('Este navegador não suporta Service Worker. Use Chrome ou Edge atualizado.');
      if (!('Notification' in window)) return fail('Este navegador não suporta a API de Notificações. Use Chrome ou Edge atualizado.');
      if (!('PushManager' in window)) return fail('Este navegador não suporta PushManager/Web Push. Use Chrome ou Edge atualizado.');
      try {
        const reg = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register('/sw.js');
        const keyResp = await api('/api/push/vapid-public-key').catch(()=>({publicKey:''}));
        if (!keyResp || !keyResp.publicKey) return fail('Chave pública VAPID não encontrada no servidor. Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Render.');

        let permission = Notification.permission;
        if (permission === 'default' && !silent) permission = await Notification.requestPermission();
        if (permission === 'default' && silent) return false;
        if (permission !== 'granted') return fail('Permissão de notificação negada. Ative as notificações deste site nas configurações do navegador e clique novamente em Receber Push no Celular.');

        const existing = await reg.pushManager.getSubscription();
        const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(keyResp.publicKey) });
        await api('/api/push/subscribe', {
          method:'POST',
          body: JSON.stringify({
            subscription: sub,
            permission,
            device: {
              platform: navigator.platform || '',
              userAgent: navigator.userAgent || '',
              language: navigator.language || '',
              installedPWA: (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!window.navigator.standalone
            }
          })
        });
        if (!silent) alert('Notificações Push ativadas com sucesso neste dispositivo!');
        return true;
      } catch (err) {
        console.error(err);
        return fail('Erro ao ativar notificações: ' + (err.message || err));
      }
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
      if (!clean.includes('#notificacoes')) clean.push('#notificacoes');
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


/* ===== correcoes-despesa-movimentacao-final-30-06.js ===== */

/* Correções finais 30/06: correção completa de despesa + permissão do gestor de equipamentos */
(function(){
  'use strict';
  const moneyNum = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v).trim().replace(/\s/g,'');
    if (s.includes(',') && s.includes('.')) return Number(s.replace(/\./g,'').replace(',','.')) || 0;
    if (s.includes(',')) return Number(s.replace(',','.')) || 0;
    return Number(s) || 0;
  };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const currentUser = () => (window.Store && Store.getLoggedUser ? Store.getLoggedUser() : {}) || {};
  const permsOf = (u) => Array.isArray(u.permissions) ? u.permissions : [];
  const hasPerm = (name) => {
    const u = currentUser();
    const p = permsOf(u).map(norm);
    const target = norm(name);
    return p.includes(target) || p.some(x => x.includes(target));
  };
  function canConfirmMovement(){
    const u = currentUser();
    const profile = norm(u.profile);

    // Regra obrigatória: vendedor e supervisor só visualizam o dossiê.
    // Mesmo que tenham alguma permissão genérica marcada, não podem aprovar/reprovar.
    if (profile === 'vendedor' || profile === 'supervisor') return false;

    if (profile === 'administrador' || hasPerm('Administrador') || hasPerm('Administrador (Acesso Total)')) return true;
    if (profile.includes('responsavel equipamentos') || profile.includes('gestor de equipamentos') || profile.includes('patrimonio')) return true;
    return hasPerm('Confirmação de Movimentação') || hasPerm('Confirmação de Troca') || hasPerm('Avaliação de Movimentação');
  }

  function setVal(id, val){ const el = document.getElementById(id); if (el) el.value = val ?? ''; }
  function normalizeMediaUrl(url){
    if (!url) return '';
    if (window.TempPhotosCache && window.TempPhotosCache[url]) return window.TempPhotosCache[url];
    const raw = String(url).trim();
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) return raw;
    return '/' + raw.replace(/^\/+/, '');
  }
  function ensureCurrentMediaBox(kind, url){
    const input = document.getElementById(kind === 'odo' ? 'exp-odometro-img' : 'exp-comprovante-img');
    if (!input || !url) return;
    const id = kind === 'odo' ? 'cc-current-odometro' : 'cc-current-comprovante';
    let box = document.getElementById(id);
    if (!box) {
      box = document.createElement('div');
      box.id = id;
      box.style.cssText = 'margin-top:8px;padding:8px;border:1px dashed var(--border-color);border-radius:6px;font-size:12px;';
      input.insertAdjacentElement('afterend', box);
    }
    const src = normalizeMediaUrl(url);
    box.innerHTML = `<div style="margin-bottom:6px;font-weight:600;">Arquivo atual mantido. Envie outro somente se precisar substituir.</div>
      <img src="${src.replace(/"/g,'&quot;')}" style="max-height:90px;max-width:160px;border-radius:4px;border:1px solid var(--border-color);cursor:pointer;object-fit:cover;"
        onclick="event.stopPropagation(); App.showFacadeImage('${src.replace(/'/g, "\'")}')"
        onerror="this.style.display='none'; this.insertAdjacentHTML('afterend','<div style=&quot;color:#f59e0b;&quot;>Imagem antiga não encontrada. Envie novamente para substituir.</div>');">`;
  }
  function showPreview(kind, url){
    const src = normalizeMediaUrl(url);
    if (!src) return;
    const p = document.getElementById(kind === 'odo' ? 'preview-odometro' : 'preview-comprovante');
    const img = document.getElementById(kind === 'odo' ? 'img-preview-odometro' : 'img-preview-comprovante');
    if (p) p.style.display = 'block';
    if (img) {
      img.src = src;
      img.style.cursor = 'pointer';
      img.onclick = () => App.showFacadeImage(src);
      img.onerror = () => { img.style.display='none'; };
    }
    ensureCurrentMediaBox(kind, src);
  }
  function forceFullExpenseFormVisible(){
    ['group-exp-comuns','group-exp-abastecimento'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === 'group-exp-abastecimento' ? el.style.display : 'block';
    });
    const comuns = document.getElementById('group-exp-comuns');
    if (comuns) comuns.style.display = 'block';
    ['exp-val','exp-date','exp-comprovante-img','exp-obs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const fg = el.closest('.form-group');
        if (fg) fg.style.display = 'block';
      }
    });
  }
  function updateExpenseConditionalFields(){
    const finalidade = document.getElementById('exp-finalidade')?.value || '';
    const groupOutro = document.getElementById('group-exp-descreva');
    const groupAbast = document.getElementById('group-exp-abastecimento');
    if (groupOutro) groupOutro.style.display = (finalidade === 'Outro' || finalidade === 'Outros') ? 'block' : 'none';
    if (groupAbast) groupAbast.style.display = finalidade === 'Abastecimento' ? 'block' : 'none';
    const desc = document.getElementById('exp-descreva');
    if (desc) desc.required = (finalidade === 'Outro' || finalidade === 'Outros');
    const veiculo = document.getElementById('exp-veiculo');
    const km = document.getElementById('exp-km');
    const odo = document.getElementById('exp-odometro-img');
    if (veiculo) veiculo.required = finalidade === 'Abastecimento';
    if (km) km.required = finalidade === 'Abastecimento';
    if (odo) odo.required = false;
  }
  async function api(path, options={}){
    if (window.App && App.fetchFromApi) return App.fetchFromApi(path, options);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Erro na requisição');
    return data;
  }
  async function uploadIfSelected(inputId, fallback){
    const file = document.getElementById(inputId)?.files?.[0];
    if (file && window.App && App.uploadFile) return App.uploadFile(file);
    return fallback || '';
  }
  function installCorrectionSubmitHandler(){
    const form = document.getElementById('expense-form');
    if (!form || form.dataset.fullCorrectionHandler === '1') return;
    form.dataset.fullCorrectionHandler = '1';
    form.addEventListener('submit', async function(e){
      const id = form.dataset.correctionId;
      if (!id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (form.dataset.savingCorrection === 'true') return;
      form.dataset.savingCorrection = 'true';
      const current = window.__expenseCorrectionOriginal || {};
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const finalidade = document.getElementById('exp-finalidade')?.value || '';
        const payload = {
          unitId: document.getElementById('exp-unit')?.value || current.unitId || '',
          finalidade,
          operacao: document.getElementById('exp-operacao')?.value || '',
          descreva: document.getElementById('exp-descreva')?.value || '',
          veiculo: document.getElementById('exp-veiculo')?.value || '',
          km: document.getElementById('exp-km')?.value || null,
          value: moneyNum(document.getElementById('exp-val')?.value),
          date: document.getElementById('exp-date')?.value || current.date || '',
          time: current.time || '',
          observation: document.getElementById('exp-obs')?.value || '',
          foto_odometro: await uploadIfSelected('exp-odometro-img', current.foto_odometro),
          foto_comprovante: await uploadIfSelected('exp-comprovante-img', current.foto_comprovante)
        };
        await api(`/api/despesas-reembolsos/${encodeURIComponent(id)}/correct`, { method:'PUT', body: JSON.stringify(payload) });
        delete form.dataset.correctionId;
        window.__expenseCorrectionOriginal = null;
        form.reset();
        const comp = document.getElementById('exp-comprovante-img'); if (comp) comp.required = true;
        const container = document.getElementById('expense-form-container'); if (container) container.classList.add('hidden');
        const title = document.querySelector('#expense-form-card .card-title'); if (title) title.textContent = 'Registrar Despesas de Viagem';
        if (btn) btn.textContent = 'Registrar Despesa';
        if (window.App?.showToast) App.showToast('Despesa corrigida e reenviada para aprovação.'); else alert('Despesa corrigida e reenviada para aprovação.');
        if (window.App?.loadExpenses) await App.loadExpenses();
        if (window.UI?.renderDashboard) UI.renderDashboard();
      } catch (err) {
        alert('Erro ao corrigir despesa: ' + (err.message || err.error || err));
      } finally {
        form.dataset.savingCorrection = 'false';
        if (btn) btn.disabled = false;
      }
    }, true);
  }

  if (window.App) {
    App.correctExpenseAndResubmit = async function(id){
      if (!id) return alert('Não foi possível identificar a despesa.');
      try {
        const current = await api(`/api/despesas-reembolsos/${encodeURIComponent(id)}`);
        const currentStatus = norm(current.status);
        if (!currentStatus.includes('correc') && !currentStatus.includes('reprov')) return alert('Esta despesa não está aguardando correção ou refazimento.');
        const correctionUser = currentUser();
        const correctionProfile = norm(correctionUser.profile);
        const correctionPermissions = Array.isArray(correctionUser.permissions) ? correctionUser.permissions.map(norm) : [];
        const correctionAdmin = correctionProfile.includes('admin')
          || correctionPermissions.some(permission => permission.includes('admin'));
        if (String(current.userId) !== String(correctionUser.id) && !correctionAdmin) return alert('Você só pode corrigir despesas lançadas por você.');
        window.location.hash = '#despesas';
        setTimeout(() => {
          const form = document.getElementById('expense-form');
          const container = document.getElementById('expense-form-container');
          if (!form || !container) return alert('Formulário de despesa não carregou. Tente novamente.');
          window.__expenseCorrectionOriginal = current;
          form.dataset.correctionId = current.id;
          container.classList.remove('hidden');
          forceFullExpenseFormVisible();
          const title = document.querySelector('#expense-form-card .card-title'); if (title) title.textContent = 'Corrigir Despesa e Reenviar';
          const btn = form.querySelector('button[type="submit"]'); if (btn) btn.textContent = 'Salvar Correção e Reenviar';
          if (window.UI?.populateUnitDropdowns) UI.populateUnitDropdowns();
          setVal('exp-unit', current.unitId);
          setVal('exp-finalidade', current.finalidade);
          setVal('exp-operacao', current.operacao);
          setVal('exp-descreva', current.descreva);
          setVal('exp-veiculo', current.veiculo);
          setVal('exp-km', current.km);
          setVal('exp-val', moneyNum(current.value).toFixed(2));
          setVal('exp-date', current.date);
          setVal('exp-obs', current.observation || '');
          const comp = document.getElementById('exp-comprovante-img'); if (comp) comp.required = !current.foto_comprovante;
          const odo = document.getElementById('exp-odometro-img'); if (odo) odo.required = false;
          updateExpenseConditionalFields();
          forceFullExpenseFormVisible();
          showPreview('comp', current.foto_comprovante);
          showPreview('odo', current.foto_odometro);
          installCorrectionSubmitHandler();
          form.scrollIntoView({behavior:'smooth', block:'start'});
        }, 350);
      } catch (err) {
        alert('Erro ao abrir despesa para correção: ' + (err.message || err.error || err));
      }
    };

    const oldShowMovementDetails = App.showMovementDetails?.bind(App);
    if (oldShowMovementDetails) {
      App.showMovementDetails = async function(id){
        await oldShowMovementDetails(id);
        const panel = document.getElementById('dossie-manager-panel');
        const mov = App.currentMovementDossier;
        
        // 1. Correct display of the manager approval panel
        if (panel) {
          if (canConfirmMovement() && mov && mov.status === 'Pendente') {
            panel.style.display = 'block';
            panel.dataset.targetId = id;
            
            // Populate and show the manager-only fields
            const subBlock = document.getElementById('dossie-substituicao-block');
            if (subBlock) {
              const needsManagerEquipment = ['Troca', 'Adição'].includes(mov.tipo_solicitacao);
              subBlock.style.display = needsManagerEquipment ? 'block' : 'none';
              
              const titleEl = document.getElementById('dossie-sub-title');
              const helpEl = document.getElementById('dossie-sub-help');
              if (titleEl) titleEl.textContent = mov.tipo_solicitacao === 'Adição' ? '✅ EQUIPAMENTO CONFIRMADO NA ADIÇÃO' : '🔄 EQUIPAMENTO DE SUBSTITUIÇÃO';
              if (helpEl) helpEl.textContent = mov.tipo_solicitacao === 'Adição' ? 'Preencha o patrimônio, modelo e voltagem confirmados para instalar no cliente.' : 'Preencha os dados do equipamento que será enviado para substituição. Não use listas pré-definidas — preencha manualmente.';
            }
          } else {
            panel.style.display = 'none';
            panel.dataset.targetId = '';
          }
        }

        // 2. Hide/show details for Vendedor profile
        const u = currentUser();
        const profile = norm(u.profile);
        const isSeller = profile === 'vendedor';
        
        // Troca new equipment details
        const trocaContainer = document.getElementById('dossie-eq-troca-container');
        if (trocaContainer && trocaContainer.children[1]) {
          trocaContainer.children[1].style.display = isSeller ? 'none' : '';
        }
        
        // Adição specs block
        const specsGrid = document.querySelector('#dossie-eq-padrao-container > div');
        if (specsGrid) {
          specsGrid.style.display = (isSeller && mov && mov.tipo_solicitacao === 'Adição') ? 'none' : 'grid';
        }
        
        // Timeline link
        const timelineLink = document.getElementById('btn-show-timeline-dossie');
        if (timelineLink) {
          timelineLink.style.display = (isSeller && mov && mov.tipo_solicitacao === 'Adição') ? 'none' : '';
        }
      };
    }
  }

  const oldRenderExpenses = window.UI?.renderExpenses?.bind(UI);
  if (oldRenderExpenses) {
    UI.renderExpenses = function(expenses){
      oldRenderExpenses(expenses);
      const user = currentUser();
      document.querySelectorAll('#expenses-table-body tr').forEach((tr, idx) => {
        const exp = (expenses || [])[idx];
        if (!exp) return;
        const cell = tr.querySelector('td:last-child');
        if (!cell) return;
        const expenseStatus = norm(exp.status);
        if ((expenseStatus.includes('correc') || expenseStatus.includes('reprov'))
          && (String(exp.userId) === String(user.id) || isAdmin())) {
          if (!cell.querySelector('.cc-btn-corrigir-despesa')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-warning btn-sm cc-btn-corrigir-despesa';
            btn.textContent = expenseStatus.includes('reprov') ? 'Refazer Despesa' : 'Corrigir Despesa';
            btn.style.marginLeft = '6px';
            btn.onclick = (e) => { e.stopPropagation(); App.correctExpenseAndResubmit(exp.id); };
            cell.appendChild(btn);
          }
        }
      });
    };
  }

  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'exp-finalidade') updateExpenseConditionalFields(); }, true);
})();


/* ===== correcoes-finais-30-06.js ===== */

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


/* ===== correcoes-clientes-fotos-30-06.js ===== */

(function(){
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const isAdmin = () => {
    const u = (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || {};
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    return u.profile === 'Administrador' || perms.includes('Administrador') || perms.includes('Administrador (Acesso Total)');
  };
  const getAllClientsSafe = () => (Store.getAllClients ? Store.getAllClients() : Store.getClients()).filter(c => !c.deleted && !c.excluido && c.active !== false);
  const fmtDate = (c) => c.date || c.data_cadastro || c.created_at || c.createdAt || '-';
  const sellerName = (id) => (window.UI && UI.getUserName ? UI.getUserName(id) : (id || '-'));
  const scoreText = (c) => {
    const score = (c.score ?? '');
    const cls = c.classification || c.scoreClassification || '';
    return `${score !== '' ? 'Score ' + esc(score) : 'Score -'}${cls ? ' • ' + esc(cls) : ''}`;
  };

  function installCss(){
    if (document.getElementById('clientes-compactos-css')) return;
    const style = document.createElement('style');
    style.id = 'clientes-compactos-css';
    style.textContent = `
      #clients-table-body tr.cliente-compact-row{cursor:pointer;}
      .cliente-compact-card{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;}
      .cliente-compact-main{min-width:0;flex:1;}
      .cliente-compact-name{font-weight:800;color:var(--text-main);font-size:.9rem;line-height:1.15;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}
      .cliente-compact-meta{font-size:.72rem;color:var(--text-muted);line-height:1.25;white-space:normal;overflow-wrap:anywhere;word-break:break-word;margin-top:2px;}
      .cliente-compact-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center;}
      #clients-table-body .btn-xs{padding:3px 8px;font-size:.72rem;line-height:1.2;border-radius:6px;}
      #modal-client-details .client-ficha-compact{max-width:100%;overflow-x:hidden;}
      #modal-client-details .client-section{border:1px solid var(--border-color);border-radius:10px;padding:10px;margin-bottom:10px;background:rgba(255,255,255,.015);}
      #modal-client-details .client-section h4{margin:0 0 7px;color:var(--primary-color);font-size:.9rem;border-bottom:1px solid var(--border-color);padding-bottom:6px;}
      #modal-client-details .client-field{display:grid;grid-template-columns:minmax(92px,34%) minmax(0,1fr);gap:8px;border-bottom:1px solid rgba(255,255,255,.04);padding:5px 0;font-size:.78rem;line-height:1.25;}
      #modal-client-details .client-field:last-child{border-bottom:0;}
      #modal-client-details .client-label{color:var(--text-muted);font-weight:700;overflow-wrap:anywhere;}
      #modal-client-details .client-value{color:var(--text-main);font-weight:600;white-space:normal;overflow-wrap:anywhere;word-break:break-word;min-width:0;}
      #modal-client-details .client-photos-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;}
      #modal-client-details .photo-card{border:1px solid var(--border-color);border-radius:8px;padding:7px;text-align:center;min-width:0;}
      #modal-client-details .photo-card img{width:100%;height:86px;object-fit:cover;border-radius:6px;cursor:pointer;}
      #modal-client-details .photo-card b{display:block;font-size:.72rem;margin-bottom:5px;overflow-wrap:anywhere;}
      #modal-client-details .photo-empty{height:70px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--border-color);border-radius:6px;color:var(--text-muted);font-size:.72rem;}
      @media(max-width:700px){
        .table-responsive{overflow-x:hidden!important;}
        #clients-table-body tr.cliente-compact-row{display:block;border:1px solid var(--border-color);border-radius:10px;margin:7px 0;padding:8px;background:rgba(15,23,42,.75);}
        #clients-table-body tr.cliente-compact-row td{display:block!important;border:0!important;padding:0!important;width:100%!important;}
        #modal-client-details .client-field{grid-template-columns:1fr;gap:2px;padding:6px 0;}
      }
    `;
    document.head.appendChild(style);
  }

  function renderPhotoCard(label, url){
    const finalUrl = (window.App && App.resolveMediaUrl ? App.resolveMediaUrl(url) : url) || '';
    if (!finalUrl) return `<div class="photo-card"><b>${esc(label)}</b><div class="photo-empty">Imagem não enviada</div></div>`;
    return `<div class="photo-card"><b>${esc(label)}</b><img src="${esc(finalUrl)}" alt="${esc(label)}" onclick="App.showFacadeImage && App.showFacadeImage('${esc(finalUrl).replace(/'/g,'\\&#39;')}')" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'photo-empty',textContent:'Imagem indisponível'}))"></div>`;
  }
  function field(label, value){
    if (value === undefined || value === null || value === '') return '';
    return `<div class="client-field"><div class="client-label">${esc(label)}</div><div class="client-value">${esc(value)}</div></div>`;
  }

  function patchUI(){
    if (!window.UI || !window.Store || UI.__clientesCompactPatched) return;
    UI.__clientesCompactPatched = true;
    const oldRefresh = window.App && App.refreshAllLists;

    UI.renderClients = function(clients){
      installCss();
      const activeUnitId = Store.getActiveUnitId && Store.getActiveUnitId();
      const user = Store.getLoggedUser && Store.getLoggedUser();
      let list = Array.isArray(clients) ? clients.slice() : [];
      list = list.filter(c => !c.deleted && !c.excluido && c.active !== false);
      if (activeUnitId && activeUnitId !== 'all') list = list.filter(c => c.unitId === activeUnitId);
      if (user && user.profile === 'Vendedor') list = list.filter(c => c.userId === user.id);
      const body = document.getElementById('clients-table-body');
      if (!body) return;
      body.innerHTML = list.map(c => {
        const adminBtn = isAdmin() ? `<button class="btn btn-danger btn-xs" onclick="event.stopPropagation(); App.deleteClientAdmin('${esc(c.id)}')">Apagar</button>` : '';
        return `<tr class="cliente-compact-row" onclick="App.showClientDetails('${esc(c.id)}')"><td colspan="10"><div class="cliente-compact-card"><div class="cliente-compact-main"><div class="cliente-compact-name">${esc(c.name || c.nomeFantasia || c.companyName || 'Cliente sem nome')}</div><div class="cliente-compact-meta">${esc(sellerName(c.userId))} • ${esc(fmtDate(c))} • ${scoreText(c)}</div></div><div class="cliente-compact-actions"><button class="btn btn-primary btn-xs" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button>${adminBtn}</div></div></td></tr>`;
      }).join('') || `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:12px;">Nenhum cliente cadastrado.</td></tr>`;
    };

    UI.showClientDetails = function(client){
      installCss();
      if (window.App) window.App.currentClientFicha = client;
      const modal = document.getElementById('modal-client-details');
      const content = document.getElementById('client-details-content');
      if (!modal || !content) return;
      const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
      const products = Array.isArray(client.products) ? client.products.join(', ') : (client.products || '---');
      const adminDelete = isAdmin() ? `<button class="btn btn-danger" type="button" onclick="App.deleteClientAdmin('${esc(client.id)}'); document.getElementById('modal-client-details').style.display='none'">Apagar Cliente</button>` : '';
      content.innerHTML = `<div class="client-ficha-compact">
        <div class="client-section"><h4>Registro</h4>${field('ID', client.id)}${field('Status', client.status)}${field('Score', `${client.score ?? '-'} ${client.classification || ''}`)}</div>
        <div class="client-section"><h4>1. Identificação Comercial</h4>${field('Nome Fantasia', client.name)}${field('Razão Social', client.companyName)}${field('CNPJ', client.cnpj)}${field('Inscrição Estadual', client.ie)}${field('Categoria', client.category)}${field('Telefone', client.phone)}${field('E-mail', client.email)}${field('Vendedor', sellerName(client.userId))}${field('Unidade', UI.getUnitName ? UI.getUnitName(client.unitId) : client.unitId)}</div>
        <div class="client-section"><h4>2. Logística e Localização</h4>${field('Cidade', client.city)}${field('UF', client.state)}${field('CEP', client.cep)}${field('Rua', client.street)}${field('Número', client.number)}${field('Bairro', client.neighborhood)}${field('Endereço', client.addressFull)}${field('Localização', client.locationType)}${field('Pavimentação', client.pavementType)}${field('Horário Receb.', client.deliverySchedule)}${field('1º Pedido', client.firstOrderPayment)}${field('Motivo', client.firstOrderReason)}${field('Recompra', client.repurchasePayment)}</div>
        <div class="client-section"><h4>3. Mercado</h4>${field('Amaretto próximo', client.nearbyAmaretto)}${field('Concorrência', client.nearbyCompetitor)}${field('Já trabalha com sorvete', client.iceCreamExperience)}${field('Duas marcas', client.dualBrandPreference)}</div>
        <div class="client-section"><h4>4. Equipamentos e Financeiro</h4>${field('Qtd Equip.', client.equipmentQty)}${field('Equip. solicitado', client.requestedEqType)}${field('Padrão envio', client.sendableEqType)}${field('Produtos', products)}${field('Valor 1ª compra', money(client.firstOrderValue))}${field('Média mensal', money(client.predictedAverage))}${field('Bonificação', client.hasBonus)}${field('Valor bonificação', client.bonusValue ? money(client.bonusValue) : '')}</div>
        <div class="client-section"><h4>5. Análise do Vendedor</h4><div class="client-value" style="font-style:italic;">${esc(client.sellerAnalysis || 'Nenhuma análise inserida.')}</div></div>
        <div class="client-section"><h4>6. Fotos do Cadastro</h4><div class="client-photos-grid">${renderPhotoCard('Fachada', client.photoFachada)}${renderPhotoCard('Interna 01', client.photoInterna01)}${renderPhotoCard('Interna 02', client.photoInterna02)}${renderPhotoCard('Interna 03', client.photoInterna03)}${renderPhotoCard('Externa Rua 01', client.photoRua01)}${renderPhotoCard('Externa Rua 02', client.photoRua02)}${renderPhotoCard('Foto CNPJ', client.photoCnpj)}</div></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:10px;border-top:1px solid var(--border-color);padding-top:10px;">${adminDelete}<button class="btn btn-primary" type="button" onclick="App.generateClientPdfFromCurrent && App.generateClientPdfFromCurrent()">Gerar PDF</button><button class="btn btn-secondary" type="button" onclick="document.getElementById('modal-client-details').style.display='none'">Fechar Ficha</button></div>
      </div>`;
      modal.style.display = 'flex';
    };
  }

  function patchApp(){
    if (!window.App || !window.Store || App.__clientesFotosPatched) return;
    App.__clientesFotosPatched = true;
    const oldUploadFile = App.uploadFile && App.uploadFile.bind(App);
    if (oldUploadFile) {
      App.uploadFile = async function(file){
        if (!file) return '';
        const url = await oldUploadFile(file);
        if (!url || /^data:/.test(url) || url.startsWith('blob:')) throw new Error('Upload não retornou URL persistente do banco.');
        return url;
      };
    }
    App.deleteClientAdmin = async function(id){
      if (!isAdmin()) return alert('Somente administrador pode apagar clientes.');
      if (!confirm('Tem certeza que deseja apagar este cliente?\nEsta ação não poderá ser desfeita.')) return;
      try {
        if (Store.deleteClient) await Store.deleteClient(id);
        else Store.saveClients(getAllClientsSafe().filter(c => String(c.id) !== String(id)));
        if (App.fetchFromApi) await App.fetchFromApi('/api/clientes/' + encodeURIComponent(id), { method:'DELETE' }).catch(()=>{});
        App.refreshAllLists && App.refreshAllLists();
        App.showToast ? App.showToast('Cliente apagado com sucesso.') : alert('Cliente apagado com sucesso.');
      } catch (err) {
        console.error(err);
        alert('Erro ao apagar cliente: ' + (err.message || err));
      }
    };

    // Ao abrir cadastro novo, limpa apenas previews e campos de arquivo, sem mexer em dados após erro.
    document.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest('#btn-open-client-form');
      if (!btn) return;
      setTimeout(() => {
        ['fachada','interna01','interna02','interna03','rua01','rua02','cnpj'].forEach(s => {
          const input = document.getElementById('client-photo-' + s);
          const img = document.getElementById('preview-img-' + s);
          const box = document.getElementById('preview-container-' + s);
          if (input) input.value = '';
          if (img) img.removeAttribute('src');
          if (box) box.style.display = 'none';
        });
      }, 0);
    }, true);
  }

  function fixPaymentOptions(){
    const sel = document.getElementById('client-first-order-payment');
    if (!sel || sel.dataset.onlyThreeOptions === '1') return;
    const current = sel.value;
    sel.innerHTML = '<option value="" selected disabled>Selecione...</option><option value="À vista">À vista</option><option value="Boleto">Boleto</option><option value="Metade à vista, metade no boleto">Metade à vista, metade no boleto</option>';
    if (['À vista','Boleto','Metade à vista, metade no boleto'].includes(current)) sel.value = current;
    sel.dataset.onlyThreeOptions = '1';
  }

  function start(){ installCss(); patchUI(); patchApp(); fixPaymentOptions(); }
  document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('hashchange', () => setTimeout(start,50));
  setInterval(start, 1000);
})();


/* ===== general-filters.js ===== */

/*
 * General Filters & Excel Export Manager
 * Correção 01/07: relatórios Excel completos, cabeçalhos em português e links das mídias.
 */
(function() {
  'use strict';

  const REPORT_TITLES = {
    clientes: 'CLIENTES EXTERNOS',
    aprovacao: 'CLIENTES EXTERNOS / APROVAÇÃO',
    prospeccao: 'PROSPECÇÃO',
    equipamentos: 'EQUIPAMENTOS',
    movimentacao: 'MOVIMENTAÇÃO DE EQUIPAMENTOS',
    chamados: 'CHAMADOS MECÂNICOS',
    despesas: 'DESPESAS DE VIAGEM',
    'solicitacao-despesas': 'SOLICITAÇÕES DE SALDO',
    usuarios: 'USUÁRIOS',
    'simulador-troca': 'SIMULADOR DE TROCA',
    notificacoes: 'NOTIFICAÇÕES'
  };

  const FiltersManager = {
    caches: {},
    configs: {
      clientes: { renderMethod: 'renderClients', tbodyId: 'clients-table-body', fields: ['search','empresa','unitId','city','category','status','vendedor','supervisor','period'] },
      aprovacao: { renderMethod: 'renderApprovals', tbodyId: 'approvals-table-body', fields: ['search','empresa','unitId','city','vendedor','supervisor','status'] },
      prospeccao: { renderMethod: 'renderProspects', tbodyId: 'prospects-table-body', fields: ['search','empresa','unitId','period','vendedor','supervisor','status','city'] },
      equipamentos: { renderMethod: 'renderEquipments', tbodyId: 'equipments-table-body', fields: ['search','empresa','unitId','type','model','serial','situation'] },
      movimentacao: { renderMethod: 'renderMovements', tbodyId: 'movements-table-body', fields: ['search','empresa','unitId','vendedor','client','status','serial','responsible','period'] },
      chamados: { renderMethod: 'renderTickets', tbodyId: 'tickets-table-body', fields: ['search','empresa','unitId','vendedor','client','status','priority','serial','responsible','period'] },
      despesas: { renderMethod: 'renderExpenses', tbodyId: 'expenses-table-body', fields: ['search','empresa','unitId','vendedor','supervisor','status','period'] },
      'solicitacao-despesas': { renderMethod: 'renderBalances', tbodyId: 'balances-table-body', fields: ['search','empresa','unitId','vendedor','supervisor','status','period'] },
      usuarios: { renderMethod: 'renderUsers', tbodyId: 'users-table-body', fields: ['search','empresa','unitId','profile','status'] },
      'simulador-troca': { renderMethod: 'renderExchangeHistory', tbodyId: 'exchange-history-list', fields: ['search','empresa','unitId','vendedor','supervisor','client','period'] },
      notificacoes: { renderMethod: 'loadNotificationPage', tbodyId: 'notif-page-list', fields: ['search','status','period'] }
    },

    ensureFilterPanel(moduleKey) {
      const config = this.configs[moduleKey];
      const tbody = document.getElementById(config && config.tbodyId);
      if (!config || !tbody) return;
      const parentCard = tbody.closest('.card') || tbody.parentElement;
      if (!parentCard) return;

      let bar = parentCard.querySelector('.general-filter-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'general-filter-bar no-print';
        bar.style.cssText = 'padding:16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border-color);display:flex;flex-direction:column;gap:12px;';
        bar.innerHTML = `<div class="filter-fields-row" style="display:flex;flex-wrap:wrap;gap:12px;width:100%;align-items:flex-start;">${this.buildFilterControls(moduleKey)}</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end;width:100%;border-top:1px dashed var(--border-color);padding-top:10px;margin-top:6px;"><button type="button" class="btn btn-secondary btn-clear-filters" style="height:32px;padding:0 12px;font-size:.78rem;">✕ Limpar Filtros</button><button type="button" class="btn btn-success btn-export-excel" style="height:32px;padding:0 12px;font-size:.78rem;background-color:#10b981;border:1px solid #059669;color:#fff;">📥 Exportar Excel</button><button type="button" class="btn btn-secondary btn-export-all" style="height:32px;padding:0 12px;font-size:.78rem;">🗂️ Exportar Tudo</button></div>`;
        const header = parentCard.querySelector('.card-header');
        if (header) header.insertAdjacentElement('afterend', bar); else parentCard.insertBefore(bar, parentCard.firstChild);

        bar.querySelectorAll('.filter-ctrl').forEach(ctrl => {
          ctrl.addEventListener(ctrl.tagName === 'SELECT' ? 'change' : 'input', () => {
            if (ctrl.tagName === 'SELECT') ctrl.dataset.userHasChanged = '1';
            this.triggerFiltering(moduleKey);
          });
        });
        bar.querySelector('.btn-clear-filters')?.addEventListener('click', () => this.clearFilters(moduleKey));
        bar.querySelector('.btn-export-excel')?.addEventListener('click', () => this.exportExcel(moduleKey, true));
        bar.querySelector('.btn-export-all')?.addEventListener('click', () => this.exportExcel(moduleKey, false));
      }

      bar.querySelectorAll('.select-ctrl').forEach(select => {
        const field = select.dataset.field;
        const current = select.value;
        const values = this.getUniqueValues(this.caches[moduleKey] || [], field);
        select.innerHTML = `<option value="">Todos</option>${values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('')}`;
        
        if (!select.dataset.userHasChanged) {
          if (field === 'status' && (moduleKey === 'clientes' || moduleKey === 'chamados')) {
            if (values.includes('Pendente')) {
              select.value = 'Pendente';
            }
          }
        } else if ([...select.options].some(o => o.value === current)) {
          select.value = current;
        }
      });
    },

    buildFilterControls(moduleKey) {
      const labels = { empresa:'Empresa', unitId:'Unidade', city:'Cidade', category:'Categoria', status:'Status', vendedor:'Vendedor', supervisor:'Supervisor', type:'Tipo', model:'Modelo', serial:'Patrimônio', situation:'Situação', plate:'Placa', number:'Número OS', responsible:'Responsável', profile:'Perfil', client:'Cliente', priority:'Prioridade' };
      return (this.configs[moduleKey].fields || []).map(field => {
        if (field === 'search') return `<div class="filter-group" style="flex:2;min-width:180px;display:flex;flex-direction:column;gap:4px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-muted);">Buscar Texto</label><input type="text" class="filter-ctrl search-ctrl" data-field="search" placeholder="Pesquisar..." style="height:36px;padding:0 10px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;font-size:.82rem;"></div>`;
        if (field === 'period') return `<div class="filter-group" style="flex:1.5;min-width:140px;display:flex;flex-direction:column;gap:4px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-muted);">Período</label><select class="filter-ctrl period-ctrl" data-field="period" style="height:36px;padding:0 10px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;font-size:.82rem;"><option value="">Qualquer data</option><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option></select></div>`;
        return `<div class="filter-group" style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:4px;"><label style="font-size:.72rem;font-weight:600;color:var(--text-muted);">${labels[field] || field}</label><select class="filter-ctrl select-ctrl" data-field="${field}" style="height:36px;padding:0 10px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;font-size:.82rem;"><option value="">Todos</option></select></div>`;
      }).join('');
    },

    getUniqueValues(data, field) {
      const set = new Set();
      (Array.isArray(data) ? data : []).forEach(item => {
        const value = String(this.getFilterValue(item, field) || '').trim();
        if (value && !['null','undefined','—','-'].includes(value.toLowerCase())) set.add(value);
      });
      return [...set].sort((a,b) => a.localeCompare(b, 'pt-BR'));
    },

    getFilterValue(item, field) {
      if (field === 'empresa') return pick(item, ['empresa_id','company_id','empresa_nome','company_name','empresa','base','empresaBase']);
      if (field === 'unitId') return unitName(pick(item, ['unitId','unit_id','unidade','unidade_id']));
      if (field === 'city') return pick(item, ['city','cidade','clientCity','cliente_cidade']);
      if (field === 'category') return pick(item, ['category','categoria','finalidade']);
      if (field === 'status') return item.read !== undefined ? (item.read ? 'Lida' : 'Não lida') : pick(item, ['status']);
      if (field === 'vendedor') return pick(item, ['vendedor_nome','vendedor_solicitante','seller_name','vendedor','seller','cliente_vendedor']) || userName(pick(item, ['userId','user_id','vendedor_id','seller_id']));
      if (field === 'supervisor') return pick(item, ['supervisor_nome','supervisor']);
      if (field === 'type') return pick(item, ['type','tipo','equipmentType','tipo_solicitacao']);
      if (field === 'model') return pick(item, ['model','modelo','modelo_novo']);
      if (field === 'serial') return pick(item, ['equipmentSerial','patrimonio','patrimonio_novo','serial']);
      if (field === 'responsible') return pick(item, ['responsible','responsavel','mechanic','mecanico']);
      if (field === 'profile') return pick(item, ['profile','perfil']);
      if (field === 'client') return pick(item, ['client','cliente','cliente_nome','clientName','name','nomeFantasia','cliente_nome_fantasia']);
      if (field === 'priority') return pick(item, ['priority','prioridade']);
      return pick(item, [field]);
    },

    getFilterValues(moduleKey) {
      const parentCard = document.getElementById(this.configs[moduleKey].tbodyId)?.closest('.card');
      const values = {};
      parentCard?.querySelectorAll('.filter-ctrl').forEach(ctrl => { if (ctrl.dataset.field) values[ctrl.dataset.field] = ctrl.value.trim(); });
      return values;
    },

    triggerFiltering(moduleKey) {
      const config = this.configs[moduleKey];
      const data = this.filterData(this.caches[moduleKey] || [], this.getFilterValues(moduleKey), moduleKey);
      if (window.UI && UI['_original_' + config.renderMethod]) UI['_original_' + config.renderMethod](data);
    },

    clearFilters(moduleKey) {
      const parentCard = document.getElementById(this.configs[moduleKey].tbodyId)?.closest('.card');
      parentCard?.querySelectorAll('.filter-ctrl').forEach(ctrl => {
        ctrl.value = '';
        if (ctrl.tagName === 'SELECT') ctrl.dataset.userHasChanged = '1';
      });
      this.triggerFiltering(moduleKey);
    },

    filterData(data, filters, moduleKey) {
      const list = Array.isArray(data) ? data : [];
      return list.filter(item => {
        if (filters.search) {
          const q = normalize(filters.search);
          if (!Object.values(item || {}).some(v => normalize(String(v || '')).includes(q))) return false;
        }
        for (const [key, value] of Object.entries(filters)) {
          if (!value || ['search','period'].includes(key)) continue;
          if (String(this.getFilterValue(item, key) || '').trim() !== value) return false;
        }
        if (filters.period) {
          const d = parseDate(pick(item, ['date','created_at','createdAt','data','data_cadastro']));
          if (!d) return false;
          const today = new Date(); today.setHours(0,0,0,0);
          const day = new Date(d); day.setHours(0,0,0,0);
          if (filters.period === 'today' && day.getTime() !== today.getTime()) return false;
          if (filters.period === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); if (day.getTime() !== y.getTime()) return false; }
          if (filters.period === 'week') { const w = new Date(today); w.setDate(w.getDate() - 7); if (day < w) return false; }
          if (filters.period === 'month') { const m = new Date(today); m.setDate(m.getDate() - 30); if (day < m) return false; }
        }
        return true;
      });
    },

    exportExcel(moduleKey, useFiltered) {
      if (!window.XLSX) return alert('Biblioteca Excel (SheetJS) não carregada. Aguarde ou recarregue a página.');
      let list = this.caches[moduleKey] || [];
      if (useFiltered) list = this.filterData(list, this.getFilterValues(moduleKey), moduleKey);
      if (!Array.isArray(list) || list.length === 0) return alert('Nenhum registro encontrado para exportar.');
      const loggedUser = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
      const meta = [
        [`RELATÓRIO: ${REPORT_TITLES[moduleKey] || moduleKey.toUpperCase()}`],
        ['Data da Exportação:', new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')],
        ['Usuário Responsável:', loggedUser ? `${loggedUser.name || ''} (${loggedUser.username || loggedUser.id || ''})` : 'Sistema'],
        ['Empresa de Origem:', loggedUser ? (loggedUser.empresa_id || loggedUser.company_id || 'Todas') : 'Todas'],
        ['Unidade Vinculada:', loggedUser ? unitName(loggedUser.unitId || 'Todas') : 'Todas'],
        []
      ];
      const rows = list.map(item => mapRow(moduleKey, item));
      const ws = XLSX.utils.aoa_to_sheet(meta);
      XLSX.utils.sheet_add_json(ws, rows, { origin: 'A7' });
      const width = rows[0] ? Object.keys(rows[0]).map(k => ({ wch: Math.max(16, Math.min(45, String(k).length + 4)) })) : [];
      ws['!cols'] = width;
      applyHyperlinks(ws);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dados');
      XLSX.writeFile(wb, `${slug(REPORT_TITLES[moduleKey] || moduleKey)}_${Date.now()}.xlsx`);
    },

    getCollectedFiles() {
      const files = [];
      const add = (url, type, item, module) => {
        const link = mediaUrl(url);
        if (!link || link === '—') return;
        files.push({
          name: link.split('/').pop().split('?')[0] || 'arquivo',
          type,
          client: pick(item, ['name','client','cliente_nome','cliente','cliente_nome_fantasia']) || '—',
          vendedor: pick(item, ['vendedor','vendedor_solicitante','seller_name']) || userName(pick(item, ['userId','user_id','vendedor_id','seller_id'])),
          unidade: unitName(pick(item, ['unitId','unit_id'])),
          date: formatDate(pick(item, ['created_at','createdAt','date','data'])),
          module,
          relatedId: pick(item, ['id']) || '—',
          url: link
        });
      };
      const clients = getStoreList('getClients');
      clients.forEach(c => ['photoFachada','photoInterna01','photoInterna02','photoInterna03','photoRua01','photoRua02','photoCnpj'].forEach(k => add(c[k], labelMedia(k), c, 'Clientes')));
      getStoreList('getExpenses').forEach(e => { add(e.foto_odometro || e.photoOdometro, 'Imagem do Odômetro', e, 'Despesas'); add(e.foto_comprovante || e.photo || e.photoComprovante, 'Imagem do Comprovante', e, 'Despesas'); });
      getStoreList('getMovements').forEach(m => ['foto_equipamento_url','foto_antes_url','foto_depois_url','video_url','fotoAntigo','fotoNovo','fotoRecolha','fotoAntes','fotoDepois'].forEach(k => add(m[k], labelMedia(k), m, 'Movimentações')));
      getStoreList('getTickets').forEach(t => ['defectPhoto','defectVideo','fotoAntes','fotoDepois','fotoPlaqueta','videoAtendimento'].forEach(k => add(t[k], labelMedia(k), t, 'Chamados')));
      return files;
    },

    renderExportacaoArquivosPage() {
      const tbody = document.getElementById('files-table-body');
      if (!tbody) return;
      const files = this.getCollectedFiles();
      this.caches['exportar-arquivos'] = files;
      tbody.innerHTML = files.map(f => `<tr><td>${escapeHtml(f.name)}</td><td>${escapeHtml(f.type)}</td><td>${escapeHtml(f.client)}</td><td>${escapeHtml(f.vendedor)}</td><td>${escapeHtml(f.unidade)}</td><td>${escapeHtml(f.date)}</td><td>${escapeHtml(f.module)}</td><td>${escapeHtml(f.relatedId)}</td><td><a href="${escapeAttr(f.url)}" target="_blank" class="btn btn-secondary btn-sm">Ver / Baixar</a></td></tr>`).join('') || '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted);">Nenhum arquivo encontrado.</td></tr>';
    },

    exportFilesExcel() {
      if (!window.XLSX) return alert('Biblioteca Excel não carregada.');
      const rows = this.getCollectedFiles().map(f => ({ 'Nome do Arquivo': f.name, 'Tipo de Arquivo': f.type, 'Cliente Relacionado': f.client, 'Vendedor': f.vendedor, 'Unidade': f.unidade, 'Data de Envio': f.date, 'Módulo de Origem': f.module, 'Registro Relacionado': f.relatedId, 'Link de Download': f.url }));
      if (!rows.length) return alert('Nenhum arquivo para exportar.');
      const ws = XLSX.utils.json_to_sheet(rows); applyHyperlinks(ws); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Arquivos'); XLSX.writeFile(wb, `arquivos_midias_${Date.now()}.xlsx`);
    }
  };

  function initUIInterceptors() {
    if (!window.UI) return;
    Object.keys(FiltersManager.configs).forEach(moduleKey => {
      const config = FiltersManager.configs[moduleKey];
      const method = config.renderMethod;
      if (UI[method] && !UI['_original_' + method]) {
        UI['_original_' + method] = UI[method];
        UI[method] = function(data) {
          if (Array.isArray(data)) {
            FiltersManager.caches[moduleKey] = data;
            FiltersManager.ensureFilterPanel(moduleKey);
            const filtered = FiltersManager.filterData(data, FiltersManager.getFilterValues(moduleKey), moduleKey);
            return UI['_original_' + method].call(UI, filtered);
          }
          const result = UI['_original_' + method].apply(UI, arguments);
          if (result && typeof result.then === 'function') {
            return result.then(fetched => {
              if (Array.isArray(fetched)) {
                FiltersManager.caches[moduleKey] = fetched;
                FiltersManager.ensureFilterPanel(moduleKey);
                return UI['_original_' + method].call(UI, FiltersManager.filterData(fetched, FiltersManager.getFilterValues(moduleKey), moduleKey));
              }
              return fetched;
            });
          }
          FiltersManager.ensureFilterPanel(moduleKey);
          return result;
        };
      }
    });
  }

  function mapRow(moduleKey, item) {
    if (moduleKey === 'despesas') return expenseRow(item);
    if (moduleKey === 'chamados') return ticketRow(item);
    if (moduleKey === 'movimentacao') return movementRow(item);
    if (moduleKey === 'clientes' || moduleKey === 'aprovacao') return clientRow(item);
    return genericRow(item);
  }

  function expenseRow(e) {
    return {
      'ID': value(pick(e, ['id'])),
      'Data': formatDate(pick(e, ['date','data','created_at','createdAt'])),
      'Hora': value(pick(e, ['time','hora'])),
      'Vendedor Solicitante': value(pick(e, ['vendedor','vendedor_nome']) || userName(pick(e, ['userId','user_id','usuario_id']))),
      'Unidade Vinculada': value(unitName(pick(e, ['unitId','unit_id','unidade']))),
      'Finalidade': value(pick(e, ['finalidade','category','categoria'])),
      'Tipo de Operação': value(pick(e, ['operacao','operation','tipo_operacao'])),
      'Veículo': value(pick(e, ['veiculo','vehicle'])),
      'Quilometragem (KM)': value(pick(e, ['km','quilometragem'])),
      'Valor (R$)': money(pick(e, ['value','valor','amount'])),
      'Observação': value(pick(e, ['observation','observacao','description','descreva'])),
      'Status': value(pick(e, ['status'])),
      'Empresa': value(pick(e, ['empresa_id','company_id','empresa'])),
      'Usuário Responsável': value(userName(pick(e, ['userId','user_id','usuario_id']))),
      'Link da Imagem do Odômetro': mediaUrl(pick(e, ['foto_odometro','photoOdometro','odometerPhoto'])),
      'Link da Imagem do Comprovante': mediaUrl(pick(e, ['foto_comprovante','photo','photoComprovante','receiptPhoto'])),
      'Outras Mídias': mediaList(e, ['media','midias','attachments','anexos'])
    };
  }

  function ticketRow(t) {
    return {
      'OS': value(pick(t, ['id','os'])),
      'Data de Abertura': formatDate(pick(t, ['created_at','createdAt','date','data'])),
      'Hora de Abertura': value(pick(t, ['startTime','hora_inicio','time'])),
      'Mecânico Responsável': value(pick(t, ['mechanic','mecanico'])),
      'Unidade': value(unitName(pick(t, ['unitId','unit_id']))),
      'Vendedor Responsável': value(pick(t, ['vendedor','seller','seller_name']) || userName(pick(t, ['userId','user_id']))),
      'Tipo de Equipamento': value(pick(t, ['equipmentType','tipo_equipamento'])),
      'Patrimônio / Serial': value(pick(t, ['equipmentSerial','patrimonio','serial'])),
      'Cliente': value(pick(t, ['client','cliente'])),
      'Nome Fantasia': value(pick(t, ['fantasyName','nomeFantasia'])),
      'Cidade': value(pick(t, ['city','cidade'])),
      'Endereço': value(pick(t, ['address','endereco'])),
      'Descrição Simplificada da Falha': value(pick(t, ['title','falha','falha_relatada'])),
      'Prioridade': value(pick(t, ['priority','prioridade'])),
      'Peças Utilizadas': listText(pick(t, ['parts','pecas'])),
      'Serviços Executados': listText(pick(t, ['services','servicos'])),
      'Descrição do Problema': value(pick(t, ['faultDescription','descricao_falha'])),
      'Solução Aplicada': value(pick(t, ['solutionDescription','solucao'])),
      'Estado Pós Atendimento': value(pick(t, ['eqStatusAfter','estado_pos'])),
      'Carga de Gás (g)': value(pick(t, ['gasCharge','carga_gas'])),
      'Observações': value(pick(t, ['additionalNotes','observations','observacoes'])),
      'Link da Foto do Defeito': mediaUrl(pick(t, ['defectPhoto'])),
      'Link do Vídeo do Defeito': mediaUrl(pick(t, ['defectVideo'])),
      'Link da Foto Antes do Reparo': mediaUrl(pick(t, ['fotoAntes'])),
      'Link da Foto Depois do Reparo': mediaUrl(pick(t, ['fotoDepois'])),
      'Link da Foto da Plaqueta': mediaUrl(pick(t, ['fotoPlaqueta'])),
      'Link do Vídeo do Atendimento': mediaUrl(pick(t, ['videoAtendimento'])),
      'Status': value(pick(t, ['status'])),
      'Hora de Conclusão': value(pick(t, ['endTime','hora_conclusao']))
    };
  }

  function movementRow(m) {
    return {
      'ID': value(pick(m, ['id'])),
      'Data': formatDate(pick(m, ['created_at','createdAt','date','data'])),
      'Hora': formatTime(pick(m, ['created_at','createdAt','time','hora'])),
      'Tipo de Solicitação': value(pick(m, ['tipo_solicitacao','type','tipo'])),
      'Empresa/Base': value(pick(m, ['empresa','empresa_id','base'])),
      'Unidade': value(unitName(pick(m, ['unitId','unit_id','unidade']))),
      'Vendedor Solicitante': value(pick(m, ['vendedor_solicitante','seller','vendedor']) || userName(pick(m, ['vendedor_id','userId']))),
      'Código do Cliente': value(pick(m, ['cliente_codigo','clientCode'])),
      'Nome Fantasia': value(pick(m, ['cliente_nome','clientName','name'])),
      'Cidade': value(pick(m, ['cliente_cidade','clientCity','city'])),
      'Endereço Comercial': value(pick(m, ['cliente_endereco','clientAddress','address'])),
      'Vendedor Responsável': value(pick(m, ['cliente_vendedor','sellerName'])),
      'Patrimônio': value(pick(m, ['patrimonio','serial'])),
      'Modelo': value(pick(m, ['modelo','model'])),
      'Voltagem': value(pick(m, ['voltagem','voltage'])),
      'Patrimônio Novo': value(pick(m, ['patrimonio_novo','newPatrimonio'])),
      'Modelo Novo / Solicitado': value(pick(m, ['modelo_novo','requestedEqType'])),
      'Voltagem Nova': value(pick(m, ['voltagem_nova'])),
      'Quantidade': value(pick(m, ['quantidade','quantity'])),
      'Motivo / Detalhes': value(pick(m, ['detalhe_troca_adicao','motivo_recolhimento','observacao','motivo'])),
      'Status': value(pick(m, ['status'])),
      'Link da Foto do Equipamento': mediaUrl(pick(m, ['foto_equipamento_url','fotoAntigo','fotoRecolha'])),
      'Link da Foto Antes': mediaUrl(pick(m, ['foto_antes_url','fotoAntes'])),
      'Link da Foto Depois': mediaUrl(pick(m, ['foto_depois_url','fotoDepois','fotoNovo'])),
      'Link do Vídeo': mediaUrl(pick(m, ['video_url','videoTroca']))
    };
  }

  function clientRow(c) {
    return {
      'ID': value(pick(c, ['id'])),
      'Data do Cadastro': formatDate(pick(c, ['created_at','createdAt','date','data_cadastro'])),
      'Vendedor Responsável': value(pick(c, ['vendedor','seller_name']) || userName(pick(c, ['userId','user_id','seller_id']))),
      'Nome do Comércio': value(pick(c, ['name','nomeFantasia','tradeName'])),
      'Razão Social': value(pick(c, ['companyName','razaoSocial','razao_social'])),
      'CNPJ': value(pick(c, ['cnpj'])),
      'Inscrição Estadual': value(pick(c, ['ie','inscricaoEstadual','inscricao_estadual'])),
      'Categoria do Cliente': value(pick(c, ['category','categoria'])),
      'Telefone Comercial': value(pick(c, ['phone','telefone'])),
      'E-mail Comercial': value(pick(c, ['email'])),
      'Cidade': value(pick(c, ['city','cidade'])),
      'UF': value(pick(c, ['state','uf'])),
      'CEP': value(pick(c, ['cep','zipcode'])),
      'Rua / Logradouro': value(pick(c, ['street','logradouro'])),
      'Número': value(pick(c, ['number','numero'])),
      'Bairro': value(pick(c, ['neighborhood','bairro'])),
      'Endereço Completo': value(pick(c, ['addressFull','enderecoCompleto','address'])),
      'Localização do Comércio': value(pick(c, ['locationType','localizacaoComercio'])),
      'Pavimentação da Rua': value(pick(c, ['pavementType','pavimentacao'])),
      'Horário de Recebimento': value(pick(c, ['deliverySchedule','horarioRecebimento'])),
      'Unidade Vinculada': value(unitName(pick(c, ['unitId','unit_id']))),
      'Ponto Amaretto Próximo': value(pick(c, ['nearbyAmaretto','amarettoProximo'])),
      'Concorrência Próxima': value(pick(c, ['nearbyCompetitor','concorrenciaProxima'])),
      'Trabalha com Sorvete/Picolé': value(pick(c, ['iceCreamExperience','trabalhaSorvete'])),
      'Trabalhará com Duas Marcas': value(pick(c, ['dualBrandPreference','duasMarcas'])),
      'Quantidade de Equipamentos': value(pick(c, ['equipmentQty','quantidadeEquipamentos'])),
      'Tipo de Equipamento Solicitado': value(pick(c, ['requestedEqType','tipoEquipamentoSolicitado'])),
      'Equipamento que Pode Ser Enviado': value(pick(c, ['sendableEqType','equipamentoEnviado'])),
      'Produtos que Irá Trabalhar': listText(pick(c, ['products','produtos'])),
      'Média Prevista Mensal': money(pick(c, ['predictedAverage','mediaPrevista'])),
      'Valor da Primeira Compra': money(pick(c, ['firstOrderValue','valorPrimeiraCompra'])),
      'Forma de Pagamento Primeiro Pedido': value(pick(c, ['firstOrderPayment','pagamentoPrimeiroPedido'])),
      'Forma de Recompra': value(pick(c, ['repurchasePayment','formaRecompra'])),
      'Bonificação': value(pick(c, ['hasBonus','bonificacao'])),
      'Roteiro Indicado': value(pick(c, ['route','roteiro','sellerRoute'])),
      'Análise do Vendedor': value(pick(c, ['sellerAnalysis','analiseVendedor'])),
      'Link da Foto da Fachada': mediaUrl(pick(c, ['photoFachada'])),
      'Link da Foto Interna 01': mediaUrl(pick(c, ['photoInterna01'])),
      'Link da Foto Interna 02': mediaUrl(pick(c, ['photoInterna02'])),
      'Link da Foto Interna 03': mediaUrl(pick(c, ['photoInterna03'])),
      'Link da Foto Externa Rua 01': mediaUrl(pick(c, ['photoRua01'])),
      'Link da Foto Externa Rua 02': mediaUrl(pick(c, ['photoRua02'])),
      'Link da Foto do CNPJ': mediaUrl(pick(c, ['photoCnpj'])),
      'Status': value(pick(c, ['status']))
    };
  }

  function genericRow(item) {
    const out = {};
    Object.keys(item || {}).forEach(k => { out[toPtLabel(k)] = Array.isArray(item[k]) ? item[k].join(' | ') : value(item[k]); });
    return out;
  }

  function pick(obj, keys) { for (const k of keys) { if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]; } return ''; }
  function value(v) { return (v === undefined || v === null || v === '') ? '—' : v; }
  function money(v) {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'number') return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v);
    let raw = String(v).replace(/[^0-9,.-]/g,'').trim();
    if (!raw) return '—';
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',','.');
    const n = Number(raw);
    return Number.isFinite(n) ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n) : String(v);
  }
  function normalize(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function unitName(id) { if (!id) return ''; return (window.UI && UI.getUnitName && UI.getUnitName(id)) || id; }
  function userName(id) { if (!id) return ''; return (window.UI && UI.getUserName && UI.getUserName(id)) || id; }
  function parseDate(v) { if (!v) return null; if (/^\d{2}\/\d{2}\/\d{4}/.test(String(v))) { const [d,m,y] = String(v).split(/[\/\s,]+/); return new Date(y, m - 1, d); } const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function formatDate(v) { const d = parseDate(v); return d ? d.toLocaleDateString('pt-BR') : value(v); }
  function formatTime(v) { if (!v) return '—'; if (/^\d{2}:\d{2}/.test(String(v))) return String(v).slice(0,5); const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }); }
  function listText(v) { if (!v) return '—'; if (Array.isArray(v)) return v.join(' | '); try { const a = JSON.parse(v); if (Array.isArray(a)) return a.join(' | '); } catch(_) {} return String(v); }
  function mediaList(obj, keys) { const arr = []; keys.forEach(k => { const v = obj && obj[k]; if (Array.isArray(v)) v.forEach(x => arr.push(mediaUrl(x))); else if (v) arr.push(mediaUrl(v)); }); return arr.filter(x => x && x !== '—').join(' | ') || '—'; }
  function mediaUrl(url) { let raw = Array.isArray(url) ? url[0] : url; if (!raw) return '—'; if (typeof raw === 'object') raw = raw.url || raw.path || raw.src || ''; raw = String(raw || '').trim(); if (!raw || ['null','undefined','—','-'].includes(raw.toLowerCase()) || raw.startsWith('data:')) return raw.startsWith('data:') ? 'Mídia salva em base64/local; reenviar para gerar link público.' : '—'; if (window.TempPhotosCache && window.TempPhotosCache[raw]) raw = window.TempPhotosCache[raw]; if (raw.startsWith('http://') || raw.startsWith('https://')) return raw; if (raw.startsWith('/')) return window.location.origin + raw; return window.location.origin + '/' + raw.replace(/^\/+/, ''); }
  function labelMedia(k) { return ({ photoFachada:'Foto da Fachada', photoInterna01:'Foto Interna 01', photoInterna02:'Foto Interna 02', photoInterna03:'Foto Interna 03', photoRua01:'Foto Externa Rua 01', photoRua02:'Foto Externa Rua 02', photoCnpj:'Foto do CNPJ', foto_odometro:'Imagem do Odômetro', foto_comprovante:'Imagem do Comprovante', foto_antes_url:'Foto Antes', foto_depois_url:'Foto Depois', foto_equipamento_url:'Foto do Equipamento', video_url:'Vídeo', defectPhoto:'Foto do Defeito', defectVideo:'Vídeo do Defeito', fotoAntes:'Foto Antes', fotoDepois:'Foto Depois', fotoPlaqueta:'Foto da Plaqueta', videoAtendimento:'Vídeo do Atendimento' }[k] || k); }
  function getStoreList(method) { try { return (window.Store && Store[method] && Store[method]()) || []; } catch(_) { return []; } }
  function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(v) { return escapeHtml(v).replace(/`/g, '&#96;'); }
  function slug(v) { return normalize(v).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') || 'relatorio'; }
  function toPtLabel(k) { return String(k).replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^\w/, c => c.toUpperCase()); }
  function applyHyperlinks(ws) { const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1'); for (let C = range.s.c; C <= range.e.c; C++) { const header = ws[XLSX.utils.encode_cell({ r: 6, c: C })]?.v || ws[XLSX.utils.encode_cell({ r: 0, c: C })]?.v || ''; if (!normalize(header).includes('link')) continue; for (let R = range.s.r; R <= range.e.r; R++) { const addr = XLSX.utils.encode_cell({ r: R, c: C }); const cell = ws[addr]; const val = cell && String(cell.v || ''); if (/^https?:\/\//.test(val)) cell.l = { Target: val, Tooltip: 'Abrir mídia' }; } } }

  window.addEventListener('hashchange', () => setTimeout(() => Object.keys(FiltersManager.configs).forEach(k => FiltersManager.ensureFilterPanel(k)), 200));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUIInterceptors); else initUIInterceptors();
  setInterval(initUIInterceptors, 1200);
  window.FiltersManager = FiltersManager;
})();



/* Correção adicional 01/07 - PDFs completos via jsPDF, download direto e sem aba about:blank */
(function(){
  'use strict';
  if (window.__ccPdfJsPdfCompleto0107) return;
  window.__ccPdfJsPdfCompleto0107 = true;

  const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      if (window.jspdf && window.jspdf.jsPDF) return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function val(v){
    if (v === undefined || v === null || v === '' || v === 'null' || v === 'undefined') return '—';
    return String(v);
  }

  function money(v){
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'number') return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
    let raw = String(v).replace(/[^0-9,.-]/g,'').trim();
    if (!raw) return '—';
    if (raw.includes(',')) raw = raw.replace(/\./g,'').replace(',', '.');
    const n = Number(raw);
    return Number.isFinite(n) ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n) : String(v);
  }

  function unitName(id){ return (window.UI && UI.getUnitName && id) ? UI.getUnitName(id) : val(id); }
  function userName(id){ return (window.UI && UI.getUserName && id) ? UI.getUserName(id) : val(id); }
  function expenseUser(exp){
    return (window.UI && UI.getExpenseUserName) ? UI.getExpenseUserName(exp) : (exp && (exp.vendedor || exp.vendedor_nome || userName(exp.userId || exp.usuario_id || exp.user_id)));
  }

  function list(v){
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [parsed]; } catch(_) {}
    return String(v).split(',').map(x=>x.trim()).filter(Boolean);
  }

  function mediaUrl(url){
    let raw = url;
    if (Array.isArray(raw)) raw = raw[0];
    if (raw && typeof raw === 'object') raw = raw.url || raw.path || raw.src || '';
    raw = String(raw || '').trim();
    if (!raw || ['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].includes(raw)) return '';
    if (window.TempPhotosCache && window.TempPhotosCache[raw]) raw = window.TempPhotosCache[raw];
    if (raw.startsWith('data:')) return raw;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return window.location.origin + raw;
    return window.location.origin + '/' + raw.replace(/^\/+/, '');
  }

  function slug(v){
    return String(v || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'arquivo';
  }

  async function imageToDataUrl(url){
    const src = mediaUrl(url);
    if (!src) return '';
    if (src.startsWith('data:image/')) return src;
    try {
      const res = await fetch(src, {mode:'cors', credentials:'same-origin'});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      return await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('Não foi possível carregar imagem no PDF:', src, err);
      return '';
    }
  }

  function setupDoc(title){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'p', unit:'mm', format:'a4'});
    doc.setProperties({ title });
    return doc;
  }

  function pageBorder(doc, title){
    doc.setDrawColor(37,99,235);
    doc.setLineWidth(0.8);
    doc.rect(7,7,196,283);
    doc.setFillColor(37,99,235);
    doc.rect(7,7,196,17,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(255,255,255);
    doc.text(title, 12, 18);
    doc.setTextColor(0,0,0);
  }

  function ensurePage(doc, y, needed, title){
    if (y + needed <= 280) return y;
    doc.addPage();
    pageBorder(doc, title);
    return 32;
  }

  function section(doc, y, title, reportTitle){
    y = ensurePage(doc, y, 12, reportTitle);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(37,99,235);
    doc.text(title, 12, y);
    doc.setDrawColor(210,210,210);
    doc.line(12, y + 2, 198, y + 2);
    doc.setTextColor(0,0,0);
    return y + 8;
  }

  function field(doc, x, y, label, value, w){
    w = w || 85;
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80,80,80);
    doc.text(String(label).toUpperCase(), x, y);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(0,0,0);
    const lines = doc.splitTextToSize(val(value), w);
    doc.text(lines, x, y + 5);
    return y + 5 + (lines.length * 4);
  }

  function fieldBox(doc, x, y, label, value, w, h){
    w = w || 85;
    h = h || 16;
    doc.setDrawColor(220,220,220);
    doc.roundedRect(x-2, y-4, w+4, h, 1.5, 1.5);
    return field(doc, x, y, label, value, w);
  }

  function textBlock(doc, y, label, value, reportTitle){
    const lines = doc.splitTextToSize(val(value), 180);
    const h = 13 + lines.length * 4;
    y = ensurePage(doc, y, h, reportTitle);
    doc.setDrawColor(220,220,220);
    doc.roundedRect(12, y-4, 186, h, 1.5, 1.5);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80,80,80);
    doc.text(String(label).toUpperCase(), 15, y);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(0,0,0);
    doc.text(lines, 15, y+5);
    return y + h + 3;
  }

  async function addImageBox(doc, x, y, w, h, label, url){
    doc.setDrawColor(210,210,210);
    doc.roundedRect(x, y, w, h, 2, 2);
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.text(label, x+3, y+5);
    const data = await imageToDataUrl(url);
    if (data) {
      try {
        const type = data.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(data, type, x+3, y+8, w-6, h-14, undefined, 'FAST');
      } catch (err) {
        console.warn('Erro ao inserir imagem:', err);
        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        doc.text('Imagem anexada, mas não foi possível inserir no PDF.', x+3, y+18);
      }
    } else {
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      doc.setTextColor(120,120,120);
      doc.text('Imagem não enviada ou indisponível.', x+3, y+18);
      doc.setTextColor(0,0,0);
    }
    const link = mediaUrl(url);
    if (link && !link.startsWith('data:')) {
      doc.setFont('helvetica','normal');
      doc.setFontSize(6);
      doc.setTextColor(37,99,235);
      const lines = doc.splitTextToSize(link, w-6);
      doc.text(lines.slice(0,2), x+3, y+h-5);
      try { doc.link(x+3, y+h-11, w-6, 8, {url: link}); } catch(_) {}
      doc.setTextColor(0,0,0);
    }
  }

  function footer(doc){
    const pages = doc.internal.getNumberOfPages();
    for (let i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.setTextColor(100,100,100);
      doc.text(`Controle de Campo • Gerado em ${new Date().toLocaleString('pt-BR')} • Página ${i} de ${pages}`, 105, 287, {align:'center'});
      doc.setTextColor(0,0,0);
    }
  }

  async function getExpenseById(id){
    let arr = [];
    if (Array.isArray(window.AppExpensesCache)) arr = window.AppExpensesCache;
    if (!arr.length && window.Store && Store.getExpenses) arr = Store.getExpenses() || [];
    let exp = arr.find(e => String(e.id) === String(id));
    if (!exp && window.App && App.fetchFromApi) {
      try { exp = await App.fetchFromApi('/api/despesas-reembolsos/' + encodeURIComponent(id)); } catch(_){}
    }
    return exp;
  }

  async function generateExpensePdf(id){
    try {
      await loadScript(JSPDF_CDN);
      const exp = await getExpenseById(id);
      if (!exp) return alert('Despesa não encontrada para gerar PDF.');

      const title = 'COMPROVANTE DE DESPESA DE VIAGEM';
      const doc = setupDoc(`Despesa ${exp.id}`);
      pageBorder(doc, title);

      let y = 34;
      doc.setFont('helvetica','bold');
      doc.setFontSize(11);
      doc.text(`Despesa ID: #${val(exp.id)}`, 12, y);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, 120, y);
      y += 8;

      fieldBox(doc, 14, y, 'Data / Hora', [exp.date || exp.data || exp.created_at || exp.createdAt, exp.time || exp.hora].filter(Boolean).join(' às '), 80);
      fieldBox(doc, 108, y, 'Status', exp.status, 80);
      y += 20;

      y = section(doc, y, '1. Dados da Despesa', title);
      fieldBox(doc, 14, y, 'Vendedor Solicitante', exp.vendedor || exp.vendedor_nome || expenseUser(exp), 80);
      fieldBox(doc, 108, y, 'Unidade Vinculada', unitName(exp.unitId || exp.unit_id || exp.unidade), 80);
      y += 20;
      const finalidade = (exp.finalidade === 'Outro' || exp.finalidade === 'Outros') ? `Outro${exp.descreva ? ' - ' + exp.descreva : ''}` : (exp.finalidade || exp.category || exp.categoria);
      fieldBox(doc, 14, y, 'Finalidade', finalidade, 80);
      fieldBox(doc, 108, y, 'Tipo de Operação', exp.operacao || exp.operation || exp.tipo_operacao, 80);
      y += 20;
      fieldBox(doc, 14, y, 'Valor', money(exp.value ?? exp.valor ?? exp.amount), 80);
      fieldBox(doc, 108, y, 'Empresa', exp.empresa_id || exp.company_id || exp.empresa, 80);
      y += 20;

      if ((String(exp.finalidade || '').toLowerCase() === 'abastecimento') || exp.veiculo || exp.km) {
        y = section(doc, y, '2. Dados do Abastecimento / Veículo', title);
        fieldBox(doc, 14, y, 'Veículo', exp.veiculo || exp.vehicle, 80);
        fieldBox(doc, 108, y, 'Quilometragem (KM)', exp.km || exp.quilometragem, 80);
        y += 20;
      }

      y = section(doc, y, '3. Observações e Aprovação', title);
      y = textBlock(doc, y, 'Observação', exp.observation || exp.observacao || exp.description || exp.descreva, title);
      y = textBlock(doc, y, 'Histórico / Parecer', exp.approval_note || exp.motivo || exp.justificativa || `Status atual: ${val(exp.status)}`, title);

      y = section(doc, y, '4. Anexos / Comprovantes Fotográficos', title);
      y = ensurePage(doc, y, 88, title);
      await addImageBox(doc, 12, y, 88, 82, 'Comprovante', exp.foto_comprovante || exp.photo || exp.photoComprovante || exp.receiptPhoto);
      await addImageBox(doc, 110, y, 88, 82, 'Odômetro / KM', exp.foto_odometro || exp.photoOdometro || exp.odometerPhoto);
      y += 88;

      footer(doc);
      doc.save(`Despesa-${slug(exp.id)}.pdf`);
      if (window.App && App.showToast) App.showToast('PDF da despesa baixado com sucesso.');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF da despesa: ' + (err.message || err));
    }
  }

  function ticketFromFormOrStore(id){
    const tickets = (window.Store && Store.getTickets && Store.getTickets()) || [];
    const saved = tickets.find(t => String(t.id) === String(id)) || {};

    const form = document.getElementById('ticket-form');
    const hasForm = form && String(form.dataset.ticketId || '') === String(id);
    if (!hasForm) {
      return { ...saved, clientCode: saved.clientCode || saved.cliente_codigo || '', clientSeller: saved.clientSeller || saved.cliente_vendedor || '', seller: userName(saved.userId), unit: unitName(saved.unitId) };
    }

    const startDateVal = document.getElementById('ticket-start-date')?.value || '';
    const dateFormatted = startDateVal ? startDateVal.split('-').reverse().join('/') : (saved.date || '');
    const parts = [];
    document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle[data-part].active').forEach(btn => parts.push(btn.getAttribute('data-part')));
    const outraPecaInput = document.getElementById('ticket-outra-peca');
    if (outraPecaInput && outraPecaInput.value.trim() && document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-part="Outra Peça"].active')) parts.push('Outra: ' + outraPecaInput.value.trim());

    const services = [];
    document.querySelectorAll('#modal-ficha-tecnica .btn-part-toggle[data-service].active').forEach(btn => services.push(btn.getAttribute('data-service')));
    const outroServicoInput = document.getElementById('ticket-outro-servico');
    if (outroServicoInput && outroServicoInput.value.trim() && document.querySelector('#modal-ficha-tecnica .btn-part-toggle[data-service="Outro Serviço"].active')) services.push('Outro: ' + outroServicoInput.value.trim());

    const imgUrl = (imgId, fallback) => {
      const img = document.getElementById(imgId);
      return (img && img.src && img.parentElement && img.parentElement.style.display !== 'none') ? img.src : (fallback || '');
    };

    return {
      ...saved,
      id,
      date: dateFormatted,
      status: saved.status || 'Em Atendimento',
      mechanic: document.getElementById('ticket-mechanic')?.value || saved.mechanic || '',
      startTime: document.getElementById('ticket-start-time')?.value || saved.startTime || '',
      endTime: document.getElementById('ticket-end-time')?.value || saved.endTime || '',
      equipmentType: document.getElementById('ticket-eq-type-text')?.value || saved.equipmentType || '',
      equipmentSerial: document.getElementById('ticket-eq-serial')?.value || saved.equipmentSerial || '',
      client: document.getElementById('ticket-client-name')?.value || saved.client || '',
      city: saved.city || '',
      address: saved.address || '',
      clientCode: saved.clientCode || saved.cliente_codigo || '',
      clientSeller: saved.clientSeller || saved.cliente_vendedor || '',
      seller: document.getElementById('ticket-seller-text')?.value || userName(saved.userId),
      unit: document.getElementById('ticket-unit-text')?.value || unitName(saved.unitId),
      title: document.getElementById('ticket-title')?.value || saved.title || '',
      priority: document.getElementById('ticket-priority-text')?.value || saved.priority || '',
      faultDescription: document.getElementById('ticket-fault-description')?.value || saved.faultDescription || '',
      solutionDescription: document.getElementById('ticket-solution-description')?.value || saved.solutionDescription || '',
      eqStatusAfter: document.getElementById('ticket-eq-status-after')?.value || saved.eqStatusAfter || '',
      gasCharge: document.getElementById('ticket-gas-charge')?.value || saved.gasCharge || '',
      additionalNotes: document.getElementById('ticket-additional-notes')?.value || saved.additionalNotes || '',
      parts: parts.length ? parts : saved.parts,
      services: services.length ? services : saved.services,
      fotoAntes: imgUrl('preview-img-ticket-foto-antes', saved.fotoAntes),
      fotoDepois: imgUrl('preview-img-ticket-foto-depois', saved.fotoDepois),
      fotoPlaqueta: imgUrl('preview-img-ticket-foto-plaqueta', saved.fotoPlaqueta),
      defectPhoto: saved.defectPhoto || '',
      defectVideo: saved.defectVideo || '',
      videoAtendimento: saved.videoAtendimento || ''
    };
  }

  async function generateTicketPdfById(id){
    try {
      await loadScript(JSPDF_CDN);
      const ticket = ticketFromFormOrStore(id);
      if (!ticket || !ticket.id) return alert('Chamado não encontrado.');

      const title = 'FICHA TÉCNICA DE MANUTENÇÃO - ORDEM DE SERVIÇO';
      const doc = setupDoc(`Ficha Técnica ${ticket.id}`);
      pageBorder(doc, title);

      let y = 34;
      doc.setFont('helvetica','bold');
      doc.setFontSize(11);
      doc.text(`OS: #${val(ticket.id)}`, 12, y);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text(`Status: ${val(ticket.status)}`, 120, y);
      y += 10;

      y = section(doc, y, '1. Identificação do Atendimento', title);
      fieldBox(doc, 14, y, 'Mecânico Responsável', ticket.mechanic, 80);
      fieldBox(doc, 108, y, 'Data de Realização', ticket.date, 80);
      y += 20;
      fieldBox(doc, 14, y, 'Hora de Início / Conclusão', `${val(ticket.startTime)} / ${val(ticket.endTime)}`, 80);
      fieldBox(doc, 108, y, 'Unidade Vinculada', ticket.unit || unitName(ticket.unitId), 80);
      y += 22;

      y = section(doc, y, '2. Identificação do Equipamento', title);
      fieldBox(doc, 14, y, 'Tipo de Equipamento', ticket.equipmentType, 54);
      fieldBox(doc, 75, y, 'Nº Patrimônio / Serial', ticket.equipmentSerial, 54);
      fieldBox(doc, 136, y, 'Cliente Vinculado', ticket.client, 54);
      y += 20;
      fieldBox(doc, 14, y, 'Código do Cliente', ticket.clientCode || ticket.cliente_codigo || '-', 54);
      fieldBox(doc, 75, y, 'Vendedor do Cliente', ticket.clientSeller || ticket.cliente_vendedor || '-', 54);
      fieldBox(doc, 136, y, 'Vendedor Solicitante', ticket.seller || userName(ticket.userId), 54);
      y += 20;
      fieldBox(doc, 14, y, 'Prioridade', ticket.priority, 54);
      fieldBox(doc, 75, y, 'Estado Pós Atendimento', ticket.eqStatusAfter, 54);
      fieldBox(doc, 136, y, 'Grupo de Cliente', ticket.clientGroup || ticket.cliente_grupo || '-', 54);
      y += 20;
      fieldBox(doc, 14, y, 'Cidade', ticket.city || '-', 54);
      fieldBox(doc, 75, y, 'Endereço', ticket.address || '-', 116);
      y += 20;
      y = textBlock(doc, y, 'Descrição Simplificada da Falha', ticket.title, title);

      y = section(doc, y, '3. Peças Utilizadas', title);
      const parts = list(ticket.parts);
      y = ensurePage(doc, y, 14 + Math.ceil((parts.length || 1)/4)*8, title);
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      if (parts.length) {
        let x = 14;
        parts.forEach(p => {
          const w = Math.min(55, Math.max(25, doc.getTextWidth(String(p)) + 8));
          if (x + w > 195) { x = 14; y += 8; }
          doc.roundedRect(x, y-5, w, 7, 1.5, 1.5);
          doc.text(String(p).toUpperCase(), x+3, y);
          x += w + 4;
        });
      } else {
        doc.text('—', 14, y);
      }
      y += 14;

      y = section(doc, y, '4. Serviços Executados', title);
      const services = list(ticket.services);
      y = ensurePage(doc, y, 14 + Math.ceil((services.length || 1)/4)*8, title);
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      if (services.length) {
        let x = 14;
        services.forEach(s => {
          const w = Math.min(55, Math.max(25, doc.getTextWidth(String(s)) + 8));
          if (x + w > 195) { x = 14; y += 8; }
          doc.roundedRect(x, y-5, w, 7, 1.5, 1.5);
          doc.text(String(s).toUpperCase(), x+3, y);
          x += w + 4;
        });
      } else {
        doc.text('—', 14, y);
      }
      y += 14;

      y = section(doc, y, '5. Laudo e Diagnóstico Técnico', title);
      y = textBlock(doc, y, 'Descrição Detalhada do Problema Encontrado', ticket.faultDescription, title);
      y = textBlock(doc, y, 'Solução Aplicada / Laudo Técnico', ticket.solutionDescription, title);
      fieldBox(doc, 14, y, 'Carga de Gás (gramas)', ticket.gasCharge ? `${ticket.gasCharge}g` : '—', 80);
      fieldBox(doc, 108, y, 'Observações Adicionais', ticket.additionalNotes, 80);
      y += 23;

      y = section(doc, y, '6. Fotos e Vídeo da Visita', title);
      y = ensurePage(doc, y, 145, title);
      await addImageBox(doc, 12, y, 88, 66, 'Foto do Defeito', ticket.defectPhoto);
      await addImageBox(doc, 110, y, 88, 66, 'Foto Antes do Reparo', ticket.fotoAntes);
      y += 72;
      y = ensurePage(doc, y, 76, title);
      await addImageBox(doc, 12, y, 88, 66, 'Foto Depois do Reparo', ticket.fotoDepois);
      await addImageBox(doc, 110, y, 88, 66, 'Foto da Plaqueta', ticket.fotoPlaqueta);
      y += 72;

      const v1 = mediaUrl(ticket.defectVideo);
      const v2 = mediaUrl(ticket.videoAtendimento);
      if (v1 || v2) {
        y = ensurePage(doc, y, 16, title);
        doc.setFont('helvetica','bold');
        doc.setFontSize(8);
        doc.text('Links de vídeos:', 14, y);
        y += 5;
        doc.setFont('helvetica','normal');
        doc.setFontSize(7);
        doc.setTextColor(37,99,235);
        if (v1) { doc.text(doc.splitTextToSize('Vídeo do defeito: ' + v1, 180), 14, y); y += 8; }
        if (v2) { doc.text(doc.splitTextToSize('Vídeo do atendimento: ' + v2, 180), 14, y); y += 8; }
        doc.setTextColor(0,0,0);
      }

      y = ensurePage(doc, y, 35, title);
      y += 22;
      doc.line(20, y, 90, y);
      doc.line(120, y, 190, y);
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      doc.text('Assinatura do Técnico', 55, y+5, {align:'center'});
      doc.text('Assinatura do Cliente / Responsável', 155, y+5, {align:'center'});

      footer(doc);
      doc.save(`Ficha-Tecnica-${slug(ticket.id)}.pdf`);
      if (window.App && App.showToast) App.showToast('PDF do chamado baixado com sucesso.');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF do chamado: ' + (err.message || err));
    }
  }

  function install(){
    if (!window.App) return false;

    App.generateExpenseComprovantePdf = generateExpensePdf;
    App.generateRegisteredExpensePdf = generateExpensePdf;
    App.generateRegisteredExpensePDF = generateExpensePdf;
    App.generateExpenseReceiptPdf = generateExpensePdf;
    App.generateExpenseProofPdf = generateExpensePdf;

    App.generateTicketPdf = generateTicketPdfById;
    App.generateTicketPdfFromForm = function(){
      const form = document.getElementById('ticket-form');
      const id = form && form.dataset.ticketId;
      if (!id) return alert('Nenhuma Ordem de Serviço carregada no formulário.');
      return generateTicketPdfById(id);
    };
    App.printTicketData = function(ticket){
      return generateTicketPdfById(ticket && ticket.id);
    };

    return true;
  }

  function start(){ install(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.addEventListener('hashchange', () => setTimeout(start, 300));
  setInterval(start, 1000);
})();


/* ===== correcao-chamados-mobile-detalhes.js ===== */

/* Correção: card ultra compacto e modal bonito para chamados mecânicos */
(function(){
  'use strict';
  if (window.__ccChamadosMobileCompactoBonito) return;
  window.__ccChamadosMobileCompactoBonito = true;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function validUrl(url) {
    const v = String(url || '').trim();
    return !!v && !['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].includes(v);
  }
  function seller(ticket) { return ticket.seller || (window.UI && UI.getUserName ? UI.getUserName(ticket.userId) : ticket.userId) || ''; }
  function unit(ticket) { return ticket.unit || (window.UI && UI.getUnitName ? UI.getUnitName(ticket.unitId) : ticket.unitId) || ''; }
  function statusClass(status) { if (status === 'Resolvido') return 'badge-success'; if (status === 'Em Atendimento') return 'badge-primary'; return 'badge-warning'; }
  function priorityClass(priority) { if (priority === 'Alta') return 'badge-danger'; if (priority === 'Média') return 'badge-warning'; return 'badge-primary'; }
  function mediaItems(ticket) {
    const items = [];
    if (validUrl(ticket.defectPhoto)) items.push({ url: ticket.defectPhoto, label: 'Foto do Defeito', kind: 'image' });
    if (validUrl(ticket.defectVideo)) items.push({ url: ticket.defectVideo, label: 'Vídeo do Defeito', kind: 'video' });
    if (validUrl(ticket.fotoAntes)) items.push({ url: ticket.fotoAntes, label: 'Foto Antes', kind: 'image' });
    if (validUrl(ticket.fotoDepois)) items.push({ url: ticket.fotoDepois, label: 'Foto Depois', kind: 'image' });
    if (validUrl(ticket.fotoPlaqueta)) items.push({ url: ticket.fotoPlaqueta, label: 'Foto Plaqueta', kind: 'image' });
    if (validUrl(ticket.videoAtendimento)) items.push({ url: ticket.videoAtendimento, label: 'Vídeo Atendimento', kind: 'video' });
    return items;
  }
  function injectStyle(){
    if (document.getElementById('cc-chamados-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'cc-chamados-compact-style';
    style.textContent = `
      #modal-ticket-details-mobile .login-card { text-align: left !important; }
      #modal-ticket-details-mobile .cc-detail-card { background: rgba(255,255,255,.025); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; margin-top: 10px; }
      #modal-ticket-details-mobile .cc-detail-title { margin: 0 0 10px; color: var(--primary-color); font-size: .9rem; font-weight: 800; text-align: left; }
      #modal-ticket-details-mobile .cc-detail-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 14px; align-items: start; }
      #modal-ticket-details-mobile .cc-detail-item { min-width: 0; text-align: left; }
      #modal-ticket-details-mobile .cc-detail-item small { display:block; color: var(--text-muted); font-weight: 700; font-size: .68rem; line-height: 1.1; margin-bottom: 3px; text-transform: uppercase; letter-spacing: .02em; }
      #modal-ticket-details-mobile .cc-detail-item b { display:block; color: var(--text-main); font-size: .84rem; line-height: 1.25; word-break: break-word; font-weight: 650; }
      #modal-ticket-details-mobile .cc-detail-full { grid-column: span 2; }
      #modal-ticket-details-mobile .cc-detail-wide { grid-column: 1 / -1; }
      @media (max-width: 768px) {
        #tickets-table-body tr.cc-ticket-compact-row { display: block !important; margin: 8px 0 !important; border: 1px solid var(--border-color) !important; border-radius: 12px !important; background: rgba(17,24,39,.96) !important; overflow: hidden !important; }
        #tickets-table-body tr.cc-ticket-compact-row td { display: block !important; padding: 9px 10px !important; border: 0 !important; min-height: 0 !important; }
        #tickets-table-body tr.cc-ticket-compact-row td:before { display: none !important; content: none !important; }
        #tickets-table-body tr.cc-ticket-compact-row .cc-line { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #tickets-table-body tr.cc-ticket-compact-row .badge-status { font-size: .62rem !important; padding: 3px 7px !important; }
        #modal-ticket-details-mobile .cc-detail-card { padding: 10px; margin-top: 8px; }
        #modal-ticket-details-mobile .cc-detail-title { font-size: .82rem; margin-bottom: 8px; }
        #modal-ticket-details-mobile .cc-detail-grid { grid-template-columns: 1fr 1fr; gap: 7px 10px; }
        #modal-ticket-details-mobile .cc-detail-item small { font-size: .66rem; text-transform: none; letter-spacing: 0; }
        #modal-ticket-details-mobile .cc-detail-item b { font-size: .78rem; }
        #modal-ticket-details-mobile .cc-detail-full, #modal-ticket-details-mobile .cc-detail-wide { grid-column: 1 / -1; }
      }`;
    document.head.appendChild(style);
  }
  function item(label, value, full) {
    const has = value !== undefined && value !== null && String(value).trim() !== '';
    return '<div class=\"cc-detail-item' + (full ? ' cc-detail-wide' : '') + '\"><small>' + esc(label) + '</small><b>' + (has ? esc(value) : '—') + '</b></div>';
  }
  function card(title, html) { return '<section class=\"cc-detail-card\"><h4 class=\"cc-detail-title\">' + esc(title) + '</h4><div class=\"cc-detail-grid\">' + html + '</div></section>'; }
  function actionButton(ticket, isStaff) {
    if (ticket.status === 'Aberto') return isStaff ? '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.startTicketService(\'' + esc(ticket.id) + '\')\" style=\"padding:5px 8px;font-size:.68rem;white-space:nowrap;\">INICIAR</button>' : '';
    if (ticket.status === 'Em Atendimento') return isStaff ? '<button class=\"btn btn-success btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\" style=\"padding:5px 8px;font-size:.68rem;white-space:nowrap;\">FICHA</button>' : '';
    return '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\" style=\"padding:5px 8px;font-size:.68rem;white-space:nowrap;\">LAUDO</button>';
  }
  function installRenderTickets(){
    if (!window.UI || !window.Store) return false;
    UI.renderTickets = function(tickets) {
      injectStyle();
      const activeUnitId = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
      const user = Store.getLoggedUser ? Store.getLoggedUser() : null;
      let list = Array.isArray(tickets) ? tickets.slice() : [];
      if (activeUnitId !== 'all') list = list.filter(t => t.unitId === activeUnitId);
      if (user && user.profile === 'Vendedor') list = list.filter(t => String(t.userId) === String(user.id));
      const body = document.getElementById('tickets-table-body');
      if (!body) return;
      const profile = String(user && user.profile || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const permissions = Array.isArray(user && user.permissions) ? user.permissions.map(function(p){ return String(p || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }) : [];
      const staffText = [profile].concat(permissions).join(' | ');
      const isStaff = !!user && (staffText.includes('admin') || staffText.includes('mecan') || staffText.includes('manutenc') || staffText.includes('responsavel equipamento') || staffText.includes('gestor equipamento') || staffText.includes('administrar chamado'));
      body.innerHTML = list.map(function(ticket){
        const clientName = ticket.fantasyName || ticket.client || 'Cliente não informado';
        const city = ticket.city ? ' • ' + ticket.city : '';
        const equip = [ticket.equipmentSerial, ticket.equipmentType].filter(Boolean).join(' • ') || 'Equipamento não informado';
        const resp = seller(ticket) || ticket.mechanic || '';
        const anexos = mediaItems(ticket).length;
        const anexosText = anexos ? ' • ' + anexos + ' anexo' + (anexos > 1 ? 's' : '') : '';
        return '<tr class=\"mobile-summary-row cc-ticket-compact-row\" onclick=\"App.showTicketDetails(\'' + esc(ticket.id) + '\')\">' +
          '<td colspan=\"12\">' +
            '<div style=\"display:grid;gap:4px;\">' +
              '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;\"><div class=\"cc-line\" style=\"font-size:.82rem;font-weight:800;\"><span style=\"font-family:monospace;font-weight:900;\">' + esc(ticket.id || '') + '</span> • ' + esc(clientName) + esc(city) + '</div><span style=\"display:flex;align-items:center;gap:4px;flex-shrink:0;\"><span class=\"badge-status ' + priorityClass(ticket.priority) + '\">' + esc(ticket.priority || '—') + '</span><span class=\"badge-status ' + statusClass(ticket.status) + '\">' + esc(ticket.status || '—') + '</span></span></div>' +
              '<div class=\"cc-line\" style=\"font-size:.72rem;color:var(--text-muted);font-weight:700;\">' + esc(equip) + ' • ' + esc(ticket.date || 'S/D') + (resp ? ' • ' + esc(resp) : '') + esc(anexosText) + '</div>' +
              '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;\"><span class=\"cc-line\" style=\"font-size:.72rem;color:var(--text-muted);\">Toque para ver detalhes completos</span>' + actionButton(ticket, isStaff) + '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');
    };
    return true;
  }
  function installDetails(){
    if (!window.App || !window.Store) return false;
    App.showTicketDetails = function(id) {
      injectStyle();
      const tickets = (Store.getTickets && Store.getTickets()) || [];
      const ticket = tickets.find(t => String(t.id) === String(id));
      if (!ticket) return alert('Chamado não encontrado.');
      let modal = document.getElementById('modal-ticket-details-mobile');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ticket-details-mobile';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:8px;';
        document.body.appendChild(modal);
      }
      modal.innerHTML = '<div class=\"login-card\" style=\"max-width:860px;width:100%;max-height:92vh;overflow:auto;padding:14px!important;border-radius:12px!important;text-align:left!important;\"><div style=\"display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;\"><div style=\"min-width:0;\"><h3 style=\"margin:0;color:var(--primary-color);font-size:1rem;line-height:1.1;\">Detalhes do Chamado</h3><div style=\"font-size:.72rem;color:var(--text-muted);margin-top:2px;\">' + esc(ticket.id || '') + '</div></div><div style=\"display:flex;gap:6px;flex-shrink:0;\"><button class=\"btn btn-primary\" onclick=\"App.generateTicketPdf(\'' + esc(ticket.id) + '\')\" style=\"width:auto;font-size:.72rem;padding:6px 9px;\">PDF</button><button class=\"btn btn-secondary\" onclick=\"document.getElementById(\'modal-ticket-details-mobile\').style.display=\'none\'\" style=\"width:auto;font-size:.72rem;padding:6px 9px;\">Fechar</button></div></div><div id=\"modal-ticket-details-mobile-content\"></div></div>';
      const mediaHtml = (function(){
        const items = mediaItems(ticket);
        if (!items.length) return '';
        return '<section class=\"cc-detail-card\"><h4 class=\"cc-detail-title\">Anexos</h4><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;\">' + items.map(function(media){
          const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[media.url]) || media.url;
          const body = media.kind === 'video' ? '<a href=\"' + esc(finalUrl) + '\" target=\"_blank\" style=\"display:flex;align-items:center;justify-content:center;height:58px;color:var(--primary-color);font-weight:800;font-size:.72rem;text-decoration:none;\">Vídeo</a>' : '<img src=\"' + esc(finalUrl) + '\" style=\"width:100%;height:58px;object-fit:cover;border-radius:6px;cursor:pointer;\" onclick=\"App.showFacadeImage(\'' + esc(finalUrl) + '\')\" onerror=\"this.parentElement.style.display=\'none\'\">';
          return '<div style=\"background:rgba(255,255,255,.025);border:1px solid var(--border-color);border-radius:8px;padding:6px;text-align:center;\"><small style=\"display:block;color:var(--text-muted);font-size:.62rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">' + esc(media.label) + '</small>' + body + '</div>';
        }).join('') + '</div></section>';
      })();
      const parts = Array.isArray(ticket.parts) ? ticket.parts.join(', ') : (ticket.parts || '');
      const services = Array.isArray(ticket.services) ? ticket.services.join(', ') : (ticket.services || '');
      const html =
        card('Resumo', item('Data', ticket.date) + item('Status', ticket.status) + item('Prioridade', ticket.priority) + item('Unidade', unit(ticket))) +
        card('Abertura', item('Vendedor', seller(ticket)) + item('Tipo', ticket.equipmentType) + item('Patrimônio', ticket.equipmentSerial) + item('Cliente', ticket.client) + item('Fantasia', ticket.fantasyName) + item('Cidade', ticket.city) + item('Endereço', ticket.address, true) + item('Falha', ticket.title, true) + item('Obs.', ticket.observations, true)) +
        card('Atendimento', item('Mecânico', ticket.mechanic) + item('Início', ticket.startTime) + item('Conclusão', ticket.endTime) + item('Situação', ticket.eqStatusAfter) + item('Peças', parts, true) + item('Serviços', services, true) + item('Problema', ticket.faultDescription, true) + item('Solução', ticket.solutionDescription, true) + item('Gás (g)', ticket.gasCharge) + item('Obs. finais', ticket.additionalNotes, true)) + mediaHtml;
      document.getElementById('modal-ticket-details-mobile-content').innerHTML = html;
      modal.style.display = 'flex';
      modal.onclick = function(e){ if (e.target === modal) modal.style.display = 'none'; };
    };
    return true;
  }
  function install(){ const ok = installRenderTickets() & installDetails(); if (ok && window.Store && window.UI && Store.getTickets) UI.renderTickets(Store.getTickets()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 100); });
})();


/* ===== correcao-chamados-detalhe-profissional.js ===== */

/* Correção: detalhe profissional de chamado em desktop e mobile */
(function(){
  'use strict';
  if (window.__ccChamadoDetalheProfissional) return;
  window.__ccChamadoDetalheProfissional = true;
  function esc(value){ return String(value == null ? '' : value).replace(/[&<>\"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[ch]; }); }
  function ok(value){ return value !== undefined && value !== null && String(value).trim() !== ''; }
  function val(value){ return ok(value) ? esc(value) : '<span class=\"cc-pro-empty\">-</span>'; }
  function seller(ticket){ return ticket.seller || (window.UI && UI.getUserName ? UI.getUserName(ticket.userId) : ticket.userId) || ''; }
  function unit(ticket){ return ticket.unit || (window.UI && UI.getUnitName ? UI.getUnitName(ticket.unitId) : ticket.unitId) || ''; }
  function validUrl(url){ var v = String(url || '').trim(); return !!v && ['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].indexOf(v) === -1; }
  function mediaItems(ticket){ var items=[]; if(validUrl(ticket.defectPhoto)) items.push({url:ticket.defectPhoto,label:'Foto do defeito',kind:'image'}); if(validUrl(ticket.defectVideo)) items.push({url:ticket.defectVideo,label:'Vídeo do defeito',kind:'video'}); if(validUrl(ticket.fotoAntes)) items.push({url:ticket.fotoAntes,label:'Foto antes',kind:'image'}); if(validUrl(ticket.fotoDepois)) items.push({url:ticket.fotoDepois,label:'Foto depois',kind:'image'}); if(validUrl(ticket.fotoPlaqueta)) items.push({url:ticket.fotoPlaqueta,label:'Plaqueta',kind:'image'}); if(validUrl(ticket.videoAtendimento)) items.push({url:ticket.videoAtendimento,label:'Vídeo atendimento',kind:'video'}); return items; }
  function injectStyle(){
    if(document.getElementById('cc-chamado-pro-style')) return;
    var style=document.createElement('style');
    style.id='cc-chamado-pro-style';
    style.textContent=[
      '#modal-ticket-details-mobile{padding:18px!important;align-items:center!important;justify-content:center!important;}',
      '#modal-ticket-details-mobile .cc-pro-modal{width:min(1060px,calc(100vw - 44px))!important;max-height:90vh!important;overflow:auto!important;padding:0!important;border-radius:14px!important;border:1px solid var(--border-color)!important;background:#101827!important;box-shadow:0 24px 80px rgba(0,0,0,.48)!important;text-align:left!important;}',
      '#modal-ticket-details-mobile .cc-pro-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px 12px;background:linear-gradient(180deg,rgba(16,24,39,.98),rgba(16,24,39,.94));border-bottom:1px solid var(--border-color);}',
      '#modal-ticket-details-mobile .cc-pro-title{min-width:0;}',
      '#modal-ticket-details-mobile .cc-pro-title h3{margin:0;color:var(--primary-color);font-size:1.16rem;line-height:1.1;font-weight:850;}',
      '#modal-ticket-details-mobile .cc-pro-title p{margin:5px 0 0;color:var(--text-muted);font-size:.78rem;line-height:1.25;}',
      '#modal-ticket-details-mobile .cc-pro-actions{display:flex;gap:8px;flex-shrink:0;}',
      '#modal-ticket-details-mobile .cc-pro-actions .btn{width:auto!important;min-height:34px!important;padding:7px 12px!important;font-size:.78rem!important;border-radius:8px!important;}',
      '#modal-ticket-details-mobile .cc-pro-body{padding:16px 18px 18px;}',
      '#modal-ticket-details-mobile .cc-pro-summary{display:grid;grid-template-columns:1.2fr .9fr .9fr .9fr;gap:10px;margin-bottom:12px;}',
      '#modal-ticket-details-mobile .cc-pro-stat{border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.025);min-width:0;}',
      '#modal-ticket-details-mobile .cc-pro-stat small,#modal-ticket-details-mobile .cc-pro-field small{display:block;color:var(--text-muted);font-size:.66rem;line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:.025em;margin-bottom:4px;}',
      '#modal-ticket-details-mobile .cc-pro-stat b,#modal-ticket-details-mobile .cc-pro-field b{display:block;color:var(--text-main);font-size:.88rem;line-height:1.25;font-weight:750;word-break:break-word;}',
      '#modal-ticket-details-mobile .cc-pro-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);gap:12px;align-items:start;}',
      '#modal-ticket-details-mobile .cc-pro-stack{display:grid;gap:12px;min-width:0;}',
      '#modal-ticket-details-mobile .cc-pro-card{border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,.022);overflow:hidden;}',
      '#modal-ticket-details-mobile .cc-pro-card-head{padding:10px 12px;background:rgba(37,99,235,.075);border-bottom:1px solid rgba(37,99,235,.18);}',
      '#modal-ticket-details-mobile .cc-pro-card-head h4{margin:0;color:var(--primary-color);font-size:.86rem;line-height:1.1;font-weight:850;}',
      '#modal-ticket-details-mobile .cc-pro-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;padding:12px;}',
      '#modal-ticket-details-mobile .cc-pro-field{min-width:0;text-align:left;}',
      '#modal-ticket-details-mobile .cc-pro-field-wide{grid-column:1/-1;}',
      '#modal-ticket-details-mobile .cc-pro-empty{color:var(--text-muted);font-weight:650;}',
      '#modal-ticket-details-mobile .cc-pro-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;padding:12px;}',
      '#modal-ticket-details-mobile .cc-pro-media-card{border:1px solid var(--border-color);border-radius:10px;padding:7px;background:rgba(255,255,255,.025);text-align:left;}',
      '#modal-ticket-details-mobile .cc-pro-media-card small{display:block;color:var(--text-muted);font-size:.66rem;font-weight:750;line-height:1.1;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#modal-ticket-details-mobile .cc-pro-media-card img{width:100%;height:74px;object-fit:cover;border-radius:7px;cursor:pointer;display:block;}',
      '#modal-ticket-details-mobile .cc-pro-video{display:flex;align-items:center;justify-content:center;height:74px;border-radius:7px;background:rgba(37,99,235,.08);color:var(--primary-color);font-size:.78rem;font-weight:800;text-decoration:none;}',
      '@media(max-width:768px){#modal-ticket-details-mobile{padding:8px!important;}#modal-ticket-details-mobile .cc-pro-modal{width:100%!important;max-height:92vh!important;border-radius:12px!important;}#modal-ticket-details-mobile .cc-pro-header{padding:12px;}#modal-ticket-details-mobile .cc-pro-title h3{font-size:1rem;}#modal-ticket-details-mobile .cc-pro-title p{font-size:.72rem;}#modal-ticket-details-mobile .cc-pro-actions .btn{padding:6px 9px!important;font-size:.72rem!important;}#modal-ticket-details-mobile .cc-pro-body{padding:10px;}#modal-ticket-details-mobile .cc-pro-summary{grid-template-columns:1fr 1fr;gap:8px;}#modal-ticket-details-mobile .cc-pro-grid{grid-template-columns:1fr;gap:10px;}#modal-ticket-details-mobile .cc-pro-stack{gap:10px;}#modal-ticket-details-mobile .cc-pro-fields{grid-template-columns:1fr 1fr;gap:8px 10px;padding:10px;}#modal-ticket-details-mobile .cc-pro-stat{padding:8px 10px;}#modal-ticket-details-mobile .cc-pro-stat small,#modal-ticket-details-mobile .cc-pro-field small{font-size:.64rem;text-transform:none;letter-spacing:0;}#modal-ticket-details-mobile .cc-pro-stat b,#modal-ticket-details-mobile .cc-pro-field b{font-size:.78rem;}#modal-ticket-details-mobile .cc-pro-field-wide{grid-column:1/-1;}#modal-ticket-details-mobile .cc-pro-media{grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;padding:10px;}#modal-ticket-details-mobile .cc-pro-media-card img,#modal-ticket-details-mobile .cc-pro-video{height:58px;}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function stat(label,value){return '<div class=\"cc-pro-stat\"><small>'+esc(label)+'</small><b>'+val(value)+'</b></div>';}
  function field(label,value,wide){return '<div class=\"cc-pro-field'+(wide?' cc-pro-field-wide':'')+'\"><small>'+esc(label)+'</small><b>'+val(value)+'</b></div>';}
  function fieldHtml(label,html,wide){return '<div class=\"cc-pro-field'+(wide?' cc-pro-field-wide':'')+'\"><small>'+esc(label)+'</small><b>'+(html||'-')+'</b></div>';}
  function card(title,fields){return '<section class=\"cc-pro-card\"><div class=\"cc-pro-card-head\"><h4>'+esc(title)+'</h4></div><div class=\"cc-pro-fields\">'+fields+'</div></section>';}
  function mediaHtml(ticket){var items=mediaItems(ticket); if(!items.length) return ''; return '<section class=\"cc-pro-card\"><div class=\"cc-pro-card-head\"><h4>Anexos</h4></div><div class=\"cc-pro-media\">'+items.map(function(media){var url=(window.TempPhotosCache&&window.TempPhotosCache[media.url])||media.url; var body=media.kind==='video'?'<a class=\"cc-pro-video\" href=\"'+esc(url)+'\" target=\"_blank\">Abrir vídeo</a>':'<img src=\"'+esc(url)+'\" onclick=\"App.showFacadeImage(\''+esc(url)+'\')\" onerror=\"this.parentElement.style.display=\'none\'\">'; return '<div class=\"cc-pro-media-card\"><small>'+esc(media.label)+'</small>'+body+'</div>';}).join('')+'</div></section>';}
  function install(){
    if(!window.App||!window.Store) return false;
    App.showTicketDetails=function(id){
      injectStyle();
      var tickets=(Store.getTickets&&Store.getTickets())||[];
      var ticket=tickets.find(function(t){return String(t.id)===String(id);});
      if(!ticket) return alert('Chamado não encontrado.');
      var modal=document.getElementById('modal-ticket-details-mobile');
      if(!modal){modal=document.createElement('div');modal.id='modal-ticket-details-mobile';modal.style.cssText='display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.72);align-items:center;justify-content:center;';document.body.appendChild(modal);}
      var subtitle=[ticket.fantasyName||ticket.client,ticket.city,ticket.equipmentSerial].filter(Boolean).join(' • ');
      modal.innerHTML='<div class=\"login-card cc-pro-modal\"><header class=\"cc-pro-header\"><div class=\"cc-pro-title\"><h3>Detalhes do chamado</h3><p>'+esc(ticket.id||'')+(subtitle?' | '+esc(subtitle):'')+'</p></div><div class=\"cc-pro-actions\"><button class=\"btn btn-primary\" onclick=\"App.generateTicketPdf(\''+esc(ticket.id)+'\')\">PDF</button><button class=\"btn btn-secondary\" onclick=\"document.getElementById(\'modal-ticket-details-mobile\').style.display=\'none\'\">Fechar</button></div></header><div class=\"cc-pro-body\" id=\"modal-ticket-details-mobile-content\"></div></div>';
      var parts=Array.isArray(ticket.parts)?ticket.parts.join(', '):(ticket.parts||'');
      var services=Array.isArray(ticket.services)?ticket.services.join(', '):(ticket.services||'');
      var resumo='<div class=\"cc-pro-summary\">'+stat('OS',ticket.id)+stat('Data',ticket.date)+stat('Status',ticket.status)+stat('Prioridade',ticket.priority)+'</div>';
      var codeVal = ticket.clientCode || ticket.cliente_codigo || '';
      var codeHtml = codeVal ? '<span style="background-color:#fef08a;color:#1e293b;padding:2px 6px;border-radius:4px;font-weight:700;display:inline-block;">' + esc(codeVal) + '</span>' : '<span class="cc-pro-empty">-</span>';
      var groupVal = ticket.clientGroup || ticket.cliente_grupo || '';
      var groupHtml = groupVal ? esc(groupVal) : '<span class="cc-pro-empty">-</span>';
      var abertura=card('Abertura do chamado',field('Unidade',unit(ticket))+field('Vendedor',seller(ticket))+field('Tipo',ticket.equipmentType)+field('Patrimônio',ticket.equipmentSerial)+field('Cliente',ticket.client)+field('Fantasia',ticket.fantasyName)+fieldHtml('Código do Cliente',codeHtml)+fieldHtml('Grupo de Cliente',groupHtml)+field('Cidade',ticket.city)+field('Endereço',ticket.address)+field('Falha relatada',ticket.title,true)+field('Observações',ticket.observations,true));
      var atendimento=card('Atendimento técnico',field('Mecânico',ticket.mechanic)+field('Início',ticket.startTime)+field('Conclusão',ticket.endTime)+field('Situação pós',ticket.eqStatusAfter)+field('Peças utilizadas',parts,true)+field('Serviços executados',services,true)+field('Problema encontrado',ticket.faultDescription,true)+field('Solução aplicada',ticket.solutionDescription,true)+field('Carga de gás',ticket.gasCharge)+field('Observações finais',ticket.additionalNotes,true));
      document.getElementById('modal-ticket-details-mobile-content').innerHTML=resumo+'<div class=\"cc-pro-grid\"><div class=\"cc-pro-stack\">'+abertura+'</div><div class=\"cc-pro-stack\">'+atendimento+mediaHtml(ticket)+'</div></div>';
      modal.style.display='flex';
      modal.onclick=function(e){if(e.target===modal) modal.style.display='none';};
    };
    return true;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
  window.addEventListener('hashchange',function(){setTimeout(install,100);});
})();


/* ===== correcao-chamados-desktop-redimensionavel.js ===== */

/* Correção: modal de chamados redimensionável no desktop */
(function(){
  'use strict';
  if (window.__ccChamadoDesktopResizable) return;
  window.__ccChamadoDesktopResizable = true;

  var STORAGE_KEY = 'cc_ticket_modal_desktop_size_v1';
  var MIN_W = 720;
  var MIN_H = 520;
  var DEFAULT_W = 980;
  var DEFAULT_H = 760;

  function isDesktop(){ return window.matchMedia && window.matchMedia('(min-width: 769px)').matches; }
  function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
  function getSavedSize(){
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        width: Number(saved.width) || DEFAULT_W,
        height: Number(saved.height) || DEFAULT_H
      };
    } catch (_) {
      return { width: DEFAULT_W, height: DEFAULT_H };
    }
  }
  function saveSize(width, height){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: Math.round(width), height: Math.round(height) })); } catch (_) {}
  }
  function injectStyle(){
    if (document.getElementById('cc-ticket-resize-style')) return;
    var style = document.createElement('style');
    style.id = 'cc-ticket-resize-style';
    style.textContent = [
      '@media (min-width: 769px){',
      '  #modal-ticket-details-mobile{align-items:center!important;justify-content:center!important;padding:18px!important;}',
      '  #modal-ticket-details-mobile .cc-pro-modal, #modal-ticket-details-mobile .cc-ticket-modal{resize:none!important;position:relative!important;max-width:calc(100vw - 56px)!important;max-height:calc(100vh - 56px)!important;}',
      '  #modal-ticket-details-mobile .cc-pro-body, #modal-ticket-details-mobile .cc-ticket-body{height:calc(100% - 67px);overflow:auto;}',
      '  #modal-ticket-details-mobile .cc-resize-handle{position:absolute;right:5px;bottom:5px;width:18px;height:18px;border-right:3px solid rgba(156,163,175,.75);border-bottom:3px solid rgba(156,163,175,.75);cursor:nwse-resize;border-radius:2px;opacity:.75;z-index:8;}',
      '  #modal-ticket-details-mobile .cc-resize-handle:hover{opacity:1;border-color:var(--primary-color);}',
      '  #modal-ticket-details-mobile .cc-resize-hint{font-size:.68rem;color:var(--text-muted);margin-left:8px;white-space:nowrap;}',
      '}',
      '@media (max-width: 768px){#modal-ticket-details-mobile .cc-resize-handle,#modal-ticket-details-mobile .cc-resize-hint{display:none!important;}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function modalBox(){
    var modal = document.getElementById('modal-ticket-details-mobile');
    if (!modal) return null;
    return modal.querySelector('.cc-pro-modal') || modal.querySelector('.cc-ticket-modal') || modal.querySelector('.login-card');
  }
  function applyDesktopSize(box){
    if (!box || !isDesktop()) return;
    var maxW = window.innerWidth - 56;
    var maxH = window.innerHeight - 56;
    var saved = getSavedSize();
    var width = clamp(saved.width, MIN_W, maxW);
    var height = clamp(saved.height, MIN_H, maxH);
    box.style.width = width + 'px';
    box.style.height = height + 'px';
    box.style.maxWidth = maxW + 'px';
    box.style.maxHeight = maxH + 'px';
  }
  function addHint(box){
    if (!box || !isDesktop()) return;
    var actions = box.querySelector('.cc-pro-actions') || box.querySelector('.cc-ticket-actions');
    if (actions && !actions.querySelector('.cc-resize-hint')) {
      var hint = document.createElement('span');
      hint.className = 'cc-resize-hint';
      hint.textContent = 'arraste o canto para ajustar';
      actions.appendChild(hint);
    }
  }
  function enableResize(box){
    if (!box || !isDesktop() || box.querySelector('.cc-resize-handle')) return;
    var handle = document.createElement('div');
    handle.className = 'cc-resize-handle';
    handle.title = 'Arraste para aumentar ou diminuir';
    box.appendChild(handle);

    var startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
    function onMove(event){
      if (!resizing) return;
      var maxW = window.innerWidth - 56;
      var maxH = window.innerHeight - 56;
      var nextW = clamp(startW + (event.clientX - startX), MIN_W, maxW);
      var nextH = clamp(startH + (event.clientY - startY), MIN_H, maxH);
      box.style.width = nextW + 'px';
      box.style.height = nextH + 'px';
      event.preventDefault();
    }
    function onUp(){
      if (!resizing) return;
      resizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveSize(box.offsetWidth, box.offsetHeight);
      document.body.style.userSelect = '';
    }
    handle.addEventListener('mousedown', function(event){
      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      startW = box.offsetWidth;
      startH = box.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.userSelect = 'none';
      event.preventDefault();
      event.stopPropagation();
    });
  }
  function enhance(){
    injectStyle();
    var box = modalBox();
    if (!box) return;
    if (isDesktop()) {
      applyDesktopSize(box);
      addHint(box);
      enableResize(box);
    } else {
      box.style.width = '';
      box.style.height = '';
      box.style.maxWidth = '';
      box.style.maxHeight = '';
    }
  }
  function wrapShowDetails(){
    if (!window.App || !App.showTicketDetails || App.showTicketDetails.__ccResizableWrapped) return false;
    var original = App.showTicketDetails.bind(App);
    App.showTicketDetails = function(){
      var result = original.apply(App, arguments);
      setTimeout(enhance, 0);
      setTimeout(enhance, 80);
      return result;
    };
    App.showTicketDetails.__ccResizableWrapped = true;
    return true;
  }
  function install(){
    wrapShowDetails();
    enhance();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 120); });
  window.addEventListener('resize', function(){ setTimeout(enhance, 80); });
})();


/* ===== clientes-importador-sistema.js ===== */

/*
 * Clientes Importador do Sistema
 * Adiciona uma guia isolada na tela Gestão de Clientes, sem alterar funções existentes.
 * Os dados importados ficam separados e agora são salvos também no banco via app_kv_store.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'controle_comercial_clientes_importador_sistema_v1';
  const STORE_KEY = 'clientes_importador_sistema';
  const CENTRAL_STORAGE_KEY = 'controle_campo_db_global_' + STORE_KEY;

  const VISIBLE_FIELDS = [
    { key: 'codigo', label: 'Código', required: true, aliases: ['codigo', 'código', 'cod', 'cód', 'codigo cliente', 'codigo do cliente', 'cód cliente', 'cod cliente'] },
    { key: 'fantasia', label: 'Fantasia', required: true, aliases: ['fantasia', 'nome fantasia', 'cliente', 'nome cliente', 'razao fantasia'] },
    { key: 'grupo', label: 'Grupo de Cliente', required: false, aliases: ['grupo de cliente', 'grupo de clientes', 'grupo', 'grupo cliente', 'grupo_cliente', 'grupo do cliente'] },
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
    currentDisplayRows: [],
    backendSyncInProgress: false,
    lastBackendSyncAt: 0
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


  function isAdminUser() {
    try {
      const user = window.Store && typeof Store.getLoggedUser === 'function' ? Store.getLoggedUser() : null;
      const permissionText = Array.isArray(user?.permissions) ? user.permissions.join(' ') : '';
      const roleText = normalize([user?.profile, user?.role, permissionText].filter(Boolean).join(' '));
      return roleText.includes('administrador') || roleText.includes('admin');
    } catch (err) {
      return false;
    }
  }

  function readCentralRows() {
    try {
      const raw = localStorage.getItem(CENTRAL_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Falha ao ler clientes importados do cache central:', err);
      return [];
    }
  }

  function writeCentralRows(rows) {
    try {
      localStorage.setItem(CENTRAL_STORAGE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
    } catch (err) {
      console.warn('Falha ao gravar cache central de clientes importados:', err);
    }
  }

  function applyAdminVisibility(panel = findClientesPanel()) {
    if (!panel) return;
    const canImport = isAdminUser();
    const openButton = panel.querySelector('#btn-clientes-importador-open');
    if (openButton) {
      openButton.style.display = canImport ? '' : 'none';
      openButton.setAttribute('aria-hidden', canImport ? 'false' : 'true');
      openButton.disabled = !canImport;
    }
    const clearAllButton = panel.querySelector('#btn-clientes-importador-clear-all');
    if (clearAllButton) {
      clearAllButton.style.display = canImport ? '' : 'none';
      clearAllButton.setAttribute('aria-hidden', canImport ? 'false' : 'true');
      clearAllButton.disabled = !canImport;
    }
  }

  async function syncRowsFromBackend(force = false) {
    if (!window.Store || typeof Store.backendRequest !== 'function' || !Store.getToken || !Store.getToken()) return false;
    const now = Date.now();
    if (state.backendSyncInProgress) return false;
    if (!force && state.lastBackendSyncAt && (now - state.lastBackendSyncAt) < 12000) return false;

    state.backendSyncInProgress = true;
    try {
      const localRows = getRows();
      const response = await Store.backendRequest(`/api/store/${encodeURIComponent(STORE_KEY)}`);
      const remoteRows = response && Array.isArray(response.data) ? response.data : [];

      // Se o banco já tem dados, ele vence e todos os aparelhos recebem a mesma lista.
      if (remoteRows.length) {
        writeCentralRows(remoteRows);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteRows));
        if (window.Store && typeof Store.saveList === 'function') {
          // Atualiza o cache global do Store sem reenviar quando não for administrador.
          const storageKey = 'controle_campo_db_global_' + STORE_KEY;
          localStorage.setItem(storageKey, JSON.stringify(remoteRows));
        }
      // Se o banco ainda está vazio, não apaga os clientes que já existem no computador.
      // Quando for admin, envia essa lista local para o banco para o celular e outros logins carregarem também.
      } else if (localRows.length) {
        writeCentralRows(localRows);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localRows));
        if (isAdminUser()) {
          await Store.backendRequest(`/api/store/${encodeURIComponent(STORE_KEY)}`, {
            method: 'POST',
            body: JSON.stringify({ data: localRows })
          });
        }
      } else {
        writeCentralRows([]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      }

      state.lastBackendSyncAt = Date.now();
      refreshFilterOptions();
      renderTable();
      return true;
    } catch (err) {
      console.warn('Não foi possível sincronizar clientes importados do banco:', err.message || err);
      return false;
    } finally {
      state.backendSyncInProgress = false;
    }
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
      const centralRows = readCentralRows();
      if (centralRows.length) return centralRows;

      if (window.Store && typeof Store.getList === 'function') {
        const rows = Store.getList(STORE_KEY, []);
        if (Array.isArray(rows) && rows.length) {
          writeCentralRows(rows);
          return rows;
        }

        // Migração automática da primeira versão, que salvava somente no navegador.
        const legacy = readLegacyRows();
        if (legacy.length) {
          writeCentralRows(legacy);
          if (typeof Store.saveList === 'function' && isAdminUser()) Store.saveList(STORE_KEY, legacy);
          return legacy;
        }
        return Array.isArray(rows) ? rows : [];
      }
      return readLegacyRows();
    } catch (err) {
      console.warn('Falha ao ler clientes importados:', err);
      const centralRows = readCentralRows();
      return centralRows.length ? centralRows : readLegacyRows();
    }
  }

  async function saveRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    // Backup local para não perder a importação caso a internet caia no meio.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeRows));
    } catch (err) {
      console.warn('Falha ao salvar backup local (limite de cota do navegador):', err);
    }
    writeCentralRows(safeRows);

    // Salva no armazenamento central do sistema e no banco PostgreSQL.
    try {
      if (window.Store && typeof Store.saveList === 'function') {
        Store.saveList(STORE_KEY, safeRows);
      }
    } catch (err) {
      console.warn('Falha ao salvar Store local:', err);
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
      #clientes-importador-table-body .clientes-importador-inline-detail-row { cursor:default !important; transform:none !important; }
      #clientes-importador-table-body .clientes-importador-inline-detail-row:hover { background:transparent !important; }
      #clientes-importador-table-body .clientes-importador-inline-detail-cell { display:block !important; width:100% !important; padding:0 !important; text-align:left !important; border:0 !important; }
      #clientes-importador-table-body .clientes-importador-inline-detail-cell::before { content:none !important; display:none !important; }
      #clientes-importador-table-body .clientes-importador-inline-detail-row .clientes-importador-detail-modal { width:100% !important; max-height:none !important; margin:8px 0 2px !important; box-shadow:none !important; }
      #clientes-importador-table-body .clientes-importador-inline-detail-row .clientes-importador-detail-head { position:sticky; top:0; z-index:2; background:var(--bg-card); }
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


      /* Ajuste fino do importador no celular: menos poluição visual, sem perder a ação de abrir detalhes. */
      @media (max-width: 768px) {
        #view-clientes .view-tabs {
          gap:6px !important;
          margin-bottom:10px !important;
          padding-bottom:8px !important;
          overflow-x:auto !important;
          flex-wrap:nowrap !important;
        }
        #view-clientes .view-tabs .view-tab-btn {
          min-height:34px !important;
          padding:6px 10px !important;
          font-size:.78rem !important;
          line-height:1.15 !important;
          flex:0 0 auto !important;
          width:auto !important;
          border-radius:8px !important;
        }
        #clientes-importador-card {
          padding:12px !important;
          border-radius:14px !important;
        }
        #clientes-importador-card .card-header {
          display:grid !important;
          grid-template-columns:minmax(0, 1fr) auto !important;
          align-items:center !important;
          gap:8px !important;
          margin-bottom:10px !important;
          padding-bottom:10px !important;
        }
        #clientes-importador-card .card-title {
          font-size:1rem !important;
          line-height:1.2 !important;
        }
        #btn-clientes-importador-open {
          width:auto !important;
          min-height:36px !important;
          height:36px !important;
          padding:0 12px !important;
          font-size:.78rem !important;
          white-space:nowrap !important;
        }
        #clientes-importador-card .general-filter-bar {
          padding:10px !important;
          gap:8px !important;
          border-radius:10px !important;
          margin-bottom:10px !important;
        }
        .clientes-importador-filter-row {
          gap:8px !important;
        }
        .clientes-importador-filter-group,
        .clientes-importador-filter-group.search {
          min-width:0 !important;
          width:100% !important;
          gap:3px !important;
        }
        .clientes-importador-filter-group label {
          font-size:.68rem !important;
          line-height:1.1 !important;
        }
        .clientes-importador-filter-group input,
        .clientes-importador-filter-group select {
          height:34px !important;
          min-height:34px !important;
          padding:0 9px !important;
          font-size:.78rem !important;
          border-radius:8px !important;
        }
        .clientes-importador-actions {
          display:grid !important;
          grid-template-columns:1fr 1fr !important;
          gap:6px !important;
          margin-top:2px !important;
          padding-top:8px !important;
        }
        .clientes-importador-actions .btn,
        .clientes-importador-actions button {
          width:100% !important;
          min-height:34px !important;
          height:34px !important;
          padding:0 8px !important;
          font-size:.72rem !important;
          line-height:1.1 !important;
          white-space:nowrap !important;
        }
        #btn-clientes-importador-export-all {
          grid-column:1 / -1 !important;
        }
        .clientes-importador-table-wrap {
          overflow:visible !important;
        }
        .clientes-importador-table-wrap table {
          min-width:0 !important;
        }
        #clientes-importador-table-body {
          gap:8px !important;
        }
        #clientes-importador-table-body tr {
          padding:10px !important;
          border-radius:12px !important;
        }
        #clientes-importador-table-body td {
          padding:5px 0 !important;
          font-size:.82rem !important;
          line-height:1.2 !important;
        }
        #clientes-importador-table-body td::before {
          font-size:.68rem !important;
          margin-bottom:1px !important;
        }
        /* Na listagem mobile deixa só os dados essenciais. O restante abre no card completo ao tocar na linha. */
        #clientes-importador-table-body td:nth-child(4),
        #clientes-importador-table-body td:nth-child(5),
        #clientes-importador-table-body td:nth-child(6),
        #clientes-importador-table-body td:nth-child(8),
        #clientes-importador-table-body td:nth-child(10) {
          display:none !important;
        }
        .clientes-importador-pagination {
          gap:8px !important;
          padding:8px 0 0 !important;
          font-size:.72rem !important;
        }
        .clientes-importador-pagination-info {
          line-height:1.25 !important;
        }
        .clientes-importador-page-btn {
          min-width:30px !important;
          height:30px !important;
          min-height:30px !important;
          padding:0 8px !important;
          font-size:.72rem !important;
        }
        #modal-clientes-importador-detail.clientes-importador-modal-overlay {
          padding:6px !important;
          align-items:flex-start !important;
        }
        #modal-clientes-importador-detail .clientes-importador-detail-modal {
          width:100% !important;
          max-height:calc(100dvh - 12px) !important;
          padding:12px !important;
          border-radius:12px !important;
        }
        .clientes-importador-detail-head {
          gap:8px !important;
          padding-bottom:10px !important;
          margin-bottom:10px !important;
        }
        .clientes-importador-detail-title {
          font-size:1rem !important;
          line-height:1.15 !important;
        }
        .clientes-importador-detail-subtitle {
          font-size:.74rem !important;
        }
        .clientes-importador-detail-section {
          padding:10px !important;
          margin-bottom:10px !important;
        }
        .clientes-importador-detail-section h4 {
          font-size:.82rem !important;
          margin-bottom:8px !important;
        }
        .clientes-importador-detail-item {
          padding:8px 9px !important;
          border-radius:8px !important;
        }
        .clientes-importador-detail-label {
          font-size:.64rem !important;
        }
        .clientes-importador-detail-value {
          font-size:.82rem !important;
        }
      }



      /* Correção final: filtros do importador em 2 colunas no celular, como Clientes Cadastrados. */
      @media (max-width: 900px) {
        #clientes-importador-card .general-filter-bar {
          padding:10px !important;
          gap:8px !important;
          border-radius:10px !important;
        }
        #clientes-importador-card .clientes-importador-filter-row {
          display:grid !important;
          grid-template-columns:repeat(2, minmax(0, 1fr)) !important;
          gap:9px 10px !important;
          width:100% !important;
          align-items:end !important;
        }
        #clientes-importador-card .clientes-importador-filter-group,
        #clientes-importador-card .clientes-importador-filter-group.search {
          min-width:0 !important;
          width:100% !important;
          max-width:100% !important;
          flex:none !important;
          gap:4px !important;
        }
        #clientes-importador-card .clientes-importador-filter-group.search {
          grid-column:1 / -1 !important;
        }
        #clientes-importador-card .clientes-importador-filter-group label {
          font-size:.72rem !important;
          line-height:1.15 !important;
          white-space:normal !important;
        }
        #clientes-importador-card .clientes-importador-filter-group input,
        #clientes-importador-card .clientes-importador-filter-group select {
          width:100% !important;
          height:38px !important;
          min-height:38px !important;
          padding:0 10px !important;
          font-size:.8rem !important;
          border-radius:8px !important;
        }
        #clientes-importador-card .clientes-importador-actions {
          display:grid !important;
          grid-template-columns:1fr 1fr !important;
          gap:8px !important;
          width:100% !important;
          padding-top:10px !important;
          margin-top:2px !important;
        }
        #clientes-importador-card .clientes-importador-actions .btn,
        #clientes-importador-card .clientes-importador-actions button {
          width:100% !important;
          min-height:38px !important;
          height:38px !important;
          padding:0 8px !important;
          font-size:.78rem !important;
          line-height:1.1 !important;
        }
        #btn-clientes-importador-export-all {
          grid-column:1 / -1 !important;
        }
      }

      @media (max-width: 380px) {
        #clientes-importador-card .clientes-importador-filter-row {
          grid-template-columns:1fr !important;
        }
        #clientes-importador-card .clientes-importador-actions {
          grid-template-columns:1fr !important;
        }
        #btn-clientes-importador-export-all {
          grid-column:auto !important;
        }
      }

      @media (max-width: 420px) {
        #clientes-importador-card .card-header {
          grid-template-columns:1fr !important;
        }
        #btn-clientes-importador-open {
          width:100% !important;
        }
        .clientes-importador-actions {
          grid-template-columns:1fr !important;
        }
        #btn-clientes-importador-export-all {
          grid-column:auto !important;
        }
      }


      /* Garante duas colunas de filtros também em celulares comuns de 390/414 px. */
      @media (max-width: 420px) and (min-width: 381px) {
        #clientes-importador-card .clientes-importador-filter-row {
          display:grid !important;
          grid-template-columns:repeat(2, minmax(0, 1fr)) !important;
        }
        #clientes-importador-card .clientes-importador-filter-group.search {
          grid-column:1 / -1 !important;
        }
        #clientes-importador-card .clientes-importador-actions {
          display:grid !important;
          grid-template-columns:1fr 1fr !important;
        }
        #clientes-importador-card #btn-clientes-importador-export-all {
          grid-column:1 / -1 !important;
        }
      }


      /* Correção mobile: o card de detalhes do cliente não deve cobrir o cabeçalho fixo. */
      @media (max-width: 900px) {
        #modal-clientes-importador-detail.clientes-importador-modal-overlay {
          top:118px !important;
          right:0 !important;
          bottom:0 !important;
          left:0 !important;
          height:auto !important;
          min-height:0 !important;
          padding:8px 6px 12px !important;
          align-items:flex-start !important;
          justify-content:center !important;
          overflow-y:auto !important;
          overscroll-behavior:contain !important;
        }
        #modal-clientes-importador-detail .clientes-importador-detail-modal {
          width:calc(100vw - 12px) !important;
          max-height:calc(100dvh - 136px) !important;
          margin:0 auto 12px !important;
        }
        #modal-clientes-importador-detail .clientes-importador-detail-head {
          position:sticky !important;
          top:0 !important;
          z-index:2 !important;
          background:var(--bg-card) !important;
        }
      }

      @media (max-width: 420px) {
        #modal-clientes-importador-detail.clientes-importador-modal-overlay {
          top:116px !important;
          padding:7px 6px 12px !important;
        }
        #modal-clientes-importador-detail .clientes-importador-detail-modal {
          max-height:calc(100dvh - 132px) !important;
        }
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
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <span class="card-title">Clientes Importador do Sistema</span>
            <div style="display:flex; gap:8px;">
              <button class="btn btn-danger" id="btn-clientes-importador-clear-all" type="button" style="display:none; background-color:var(--danger-color, #ef4444); border-color:var(--danger-color, #ef4444);">✕ Apagar Todos Clientes</button>
              <button class="btn btn-primary" id="btn-clientes-importador-open" type="button">+ Importar Clientes</button>
            </div>
          </div>

          <div class="general-filter-bar no-print" style="padding:16px;background:rgba(255,255,255,.02);border-bottom:1px solid var(--border-color);display:flex;flex-direction:column;gap:12px;">
            <div class="clientes-importador-filter-row">
              <div class="clientes-importador-filter-group search">
                <label for="clientes-importador-search">Buscar Texto</label>
                <input type="text" id="clientes-importador-search" placeholder="Pesquisar cliente...">
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
    applyAdminVisibility(panel);

    // Renderiza apenas uma vez por montagem da tela para não gerar loop de MutationObserver.
    if (createdOrRebuilt || panel.dataset.clientesImportadorInitialRendered !== '1') {
      refreshFilterOptions();
      renderTable();
      panel.dataset.clientesImportadorInitialRendered = '1';
    }

    syncRowsFromBackend(false);

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
      if (row) openClientDetail(row, rowEl);
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
    panel.querySelector('#btn-clientes-importador-clear-all')?.addEventListener('click', clearAllImportedClients);

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
      applyAdminVisibility(panel);
      refreshFilterOptions();
      renderTable();
      syncRowsFromBackend(true);
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

  async function clearAllImportedClients() {
    if (!isAdminUser()) {
      showToast('Somente administrador pode apagar os clientes importados.');
      return;
    }
    if (!confirm('Atenção: Esta ação irá apagar definitivamente todos os clientes importados do sistema. Deseja continuar?')) {
      return;
    }
    try {
      await saveRows([]);
      refreshFilterOptions();
      state.currentPage = 1;
      renderTable();
      showToast('Todos os clientes importados foram removidos com sucesso.');
    } catch (err) {
      console.error('Falha ao apagar todos os clientes importados:', err);
      alert('Não foi possível apagar os clientes. Erro: ' + (err.message || err));
    }
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

    removeInlineClientDetail();

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

  function removeInlineClientDetail() {
    document.querySelectorAll('.clientes-importador-inline-detail-row').forEach(row => row.remove());
  }

  function shouldUseInlineDetail() {
    return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  }

  function openInlineClientDetail(anchorRow, titleText, subtitleText, bodyHtml) {
    removeInlineClientDetail();
    if (!anchorRow || !anchorRow.parentNode) return false;

    const detailRow = document.createElement('tr');
    detailRow.className = 'clientes-importador-inline-detail-row';
    detailRow.innerHTML = `
      <td class="clientes-importador-inline-detail-cell" colspan="${FIELDS.length}">
        <div class="clientes-importador-detail-modal" role="dialog" aria-modal="false" aria-label="Informações do Cliente">
          <div class="clientes-importador-detail-head">
            <div>
              <h3 class="clientes-importador-detail-title"></h3>
              <p class="clientes-importador-detail-subtitle"></p>
            </div>
            <button type="button" class="clientes-importador-close" aria-label="Fechar">×</button>
          </div>
          <div class="clientes-importador-inline-detail-body"></div>
        </div>
      </td>
    `;

    detailRow.querySelector('.clientes-importador-detail-title').textContent = titleText;
    detailRow.querySelector('.clientes-importador-detail-subtitle').textContent = subtitleText;
    detailRow.querySelector('.clientes-importador-inline-detail-body').innerHTML = bodyHtml;
    detailRow.querySelector('.clientes-importador-close')?.addEventListener('click', removeInlineClientDetail);
    anchorRow.insertAdjacentElement('afterend', detailRow);
    setTimeout(() => detailRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
    return true;
  }

  function openClientDetail(row, anchorRow) {
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

    if (shouldUseInlineDetail() && openInlineClientDetail(anchorRow, fantasia, subtitle.textContent, body.innerHTML)) {
      modal.classList.remove('open');
      document.documentElement.classList.remove('clientes-importador-modal-active');
      document.body.classList.remove('clientes-importador-modal-active');
      return;
    }

    removeInlineClientDetail();
    modal.classList.add('open');
    modal.scrollTop = 0;
    const detailModal = modal.querySelector('.clientes-importador-detail-modal');
    if (detailModal) detailModal.scrollTop = 0;
    document.documentElement.classList.add('clientes-importador-modal-active');
    document.body.classList.add('clientes-importador-modal-active');
  }

  function closeClientDetail() {
    removeInlineClientDetail();
    const modal = document.getElementById('modal-clientes-importador-detail');
    modal?.classList.remove('open');
    document.documentElement.classList.remove('clientes-importador-modal-active');
    document.body.classList.remove('clientes-importador-modal-active');
  }

  function openImportModal() {
    if (!isAdminUser()) {
      showToast('Somente administrador pode importar planilha de clientes.');
      return;
    }
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

    rows.forEach(row => {
      const rowErrors = [];
      const codeNorm = normalize(row.codigo);
      const cnpjDigits = onlyDigits(row.cnpj);
      const cpfDigits = onlyDigits(row.cpf);

      if (isEmptyValue(row.codigo)) rowErrors.push({ line: row.__line, field: 'Código', message: 'Código vazio.' });
      if (isEmptyValue(row.fantasia)) rowErrors.push({ line: row.__line, field: 'Fantasia', message: 'Fantasia vazia.' });

      // Ignora silenciosamente registros já existentes na base (sem gerar erros na tela)
      let isAlreadyInDatabase = false;
      if (codeNorm && existingCodes.has(codeNorm)) isAlreadyInDatabase = true;
      if (cnpjDigits && existingCnpjs.has(cnpjDigits)) isAlreadyInDatabase = true;
      if (cpfDigits && existingCpfs.has(cpfDigits)) isAlreadyInDatabase = true;

      // Ignora duplicados dentro do próprio arquivo importado
      if (codeNorm) {
        if (seenCodes.has(codeNorm)) isAlreadyInDatabase = true;
        seenCodes.add(codeNorm);
      }
      if (cnpjDigits) {
        if (seenCnpjs.has(cnpjDigits)) isAlreadyInDatabase = true;
        seenCnpjs.add(cnpjDigits);
      }
      if (cpfDigits) {
        if (seenCpfs.has(cpfDigits)) isAlreadyInDatabase = true;
        seenCpfs.add(cpfDigits);
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else if (!isAlreadyInDatabase && !hasMappingError) {
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
    if (!isAdminUser()) {
      showToast('Somente administrador pode confirmar importação de clientes.');
      return;
    }
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
      const existingRows = getRows();
      const updatedRows = [...existingRows];
      rowsToSave.forEach(newRow => {
        const key = String(newRow.codigo).trim();
        const existingIdx = updatedRows.findIndex(r => String(r.codigo).trim() === key);
        if (existingIdx !== -1) {
          updatedRows[existingIdx] = {
            ...updatedRows[existingIdx],
            ...newRow
          };
        } else {
          updatedRows.push(newRow);
        }
      });
      await saveRows(updatedRows);
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


/* ===== autofill-clientes-importados-operacoes.js ===== */

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
    ['ticket-open-client-code-hidden', 'ticket-open-client-seller-imported', 'ticket-open-client-group-imported'].forEach(id => {
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
    setHiddenValue('ticket-open-client-group-imported', row.grupo || '');
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


/* ===== tutorial.js ===== */

// Central de Tutoriais - busca e inicialização isolada
(function(){
  function norm(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function initTutorialPage() {
    const page = document.querySelector('.tutorial-page[data-page="tutorial"]');
    if (!page || page.dataset.tutorialReady === '1') return;
    page.dataset.tutorialReady = '1';

    const search = page.querySelector('#tutorial-search');
    const cards = Array.from(page.querySelectorAll('[data-tutorial-card]'));
    const sections = Array.from(page.querySelectorAll('[data-tutorial-section]'));

    const empty = document.createElement('div');
    empty.className = 'tutorial-empty-state card';
    empty.textContent = 'Nenhum tutorial encontrado para a busca informada.';
    page.appendChild(empty);

    function applyFilter() {
      const q = norm(search && search.value);
      let visibleCount = 0;

      cards.forEach(card => {
        const match = !q || norm(card.innerText).includes(q);
        card.style.display = match ? '' : 'none';
      });

      sections.forEach(section => {
        const match = !q || norm(section.innerText).includes(q);
        section.style.display = match ? '' : 'none';
        if (match) visibleCount += 1;
      });

      empty.style.display = visibleCount ? 'none' : 'block';
    }

    if (search) search.addEventListener('input', applyFilter);

    page.querySelectorAll('.tutorial-go-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
      });
    });
  }

  function ensureTutorialAccess() {
    if (window.Store && Store.getUserAllowedRoutes && !Store.__tutorialFinalAccess) {
      const originalRoutes = Store.getUserAllowedRoutes.bind(Store);
      Store.getUserAllowedRoutes = function(user) {
        const routes = originalRoutes(user) || [];
        if (user && !routes.includes('#tutorial')) routes.push('#tutorial');
        return routes;
      };
      Store.__tutorialFinalAccess = true;
    }

    const user = window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null;
    const menu = document.getElementById('menu-tutorial');
    if (user && menu) menu.style.display = 'flex';
  }

  window.TutorialModule = { init: initTutorialPage, ensureAccess: ensureTutorialAccess };
  ensureTutorialAccess();
  document.addEventListener('DOMContentLoaded', function(){ ensureTutorialAccess(); initTutorialPage(); });
  window.addEventListener('hashchange', function(){ setTimeout(function(){ ensureTutorialAccess(); initTutorialPage(); }, 60); });
  setTimeout(function(){ ensureTutorialAccess(); if (window.UI && UI.applyPermissions) UI.applyPermissions(); }, 120);
})();


/* ===== clientes-cadastrados-global-aprovacao.js ===== */

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
    const profile = norm(user.profile || user.role || user.perfil);
    const perms = Array.isArray(user.permissions) ? user.permissions.map(norm) : [];
    const text = [profile, ...perms].join(' | ');
    if (profile.includes('admin') || profile.includes('administrador')) return true;
    if (profile.includes('responsavel') && profile.includes('equip')) return true;
    // Não liberar fila por permissão simples de Clientes/Cadastro.
    const allowedPerms = ['aprovacao de clientes','aprovar clientes','liberacao de cadastro de clientes','liberacao cadastro clientes','liberacao de clientes','movimentacao de equipamentos','movimentacao equipamento','liberacao de equipamento','liberacao de equipamentos','confirmacao de movimentacao','avaliacao de movimentacao'];
    return allowedPerms.some(p => text.includes(p));
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
        if (el) el.style.setProperty('display', allowed ? 'flex' : 'none', 'important');
      });
      document.querySelectorAll('#menu-aprovacao, .nav-link[href="#aprovacao"], .mobile-nav-item[href="#aprovacao"]').forEach(el => {
        el.style.setProperty('display', allowed ? 'flex' : 'none', 'important');
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
          <td data-label="Ações"><div class="client-approval-actions">
            <button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:0.75rem;margin-right:4px;" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button>
            <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveClient('${esc(c.id)}', 'Aprovado')">Aprovar</button>
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.approveClient('${esc(c.id)}', 'Reprovado')">Reprovar</button>
          </div></td>
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


/* ===== clientes-aprovacao-permissoes-correcao.js ===== */

/*
  Ajuste controlado 02/07 - fluxo de aprovação de clientes.
  Escopo: permissões da fila, aprovação/reprovação, retorno para correção e visibilidade segura.
  Não altera banco diretamente nem muda aparência geral; trabalha sobre as funções existentes.
*/
(function(){
  'use strict';
  if (window.__ccClientesAprovacaoPermissoesCorrecao) return;
  window.__ccClientesAprovacaoPermissoesCorrecao = true;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const clientKey = (c, idx) => String(c && (c.id || c.cnpj || c.cpf || c.codigo || c.name || c.companyName) || `cliente-${idx}`);
  const ownerId = (c) => String((c && (c.userId || c.user_id || c.usuario_id || c.usuarioId || c.vendedor_id || c.vendedorId || c.seller_id || c.sellerId || c.createdBy || c.created_by || c.ownerId)) || '');
  const ownerName = (c) => String((c && (c.vendedor_nome || c.vendedorName || c.sellerName || c.seller_name || c.vendedor || c.responsavel || c.responsavel_nome || c.userName || c.user_name)) || '');
  const nowBR = () => new Date().toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', hour12:false });

  function currentUser(){
    try { return (window.Store && Store.getLoggedUser && Store.getLoggedUser()) || null; } catch (_) { return null; }
  }

  function permissionsOf(user){
    if (!user) return [];
    if (Array.isArray(user.permissions)) return user.permissions.map(norm);
    try { return JSON.parse(user.permissions || '[]').map(norm); } catch (_) { return []; }
  }

  function canApproveClients(user){
    user = user || currentUser() || {};
    const profile = norm(user.profile || user.role || user.perfil);
    const perms = permissionsOf(user);
    const text = [profile, ...perms].join(' | ');
    if (profile.includes('admin') || profile.includes('administrador')) return true;
    if (profile.includes('responsavel') && profile.includes('equip')) return true;
    // Regra 02/07: somente admin, responsável de equipamentos ou permissão explícita de liberação/movimentação.
    // Permissão apenas de "Clientes"/"Cadastro de Clientes" NÃO libera fila de aprovação.
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
      'confirmacao de movimentacao',
      'avaliacao de movimentacao',
    ].some(p => text.includes(p));
  }

  function isOwner(client, user){
    user = user || currentUser();
    if (!client || !user) return false;
    const uid = String(user.id || '');
    const byId = ownerId(client) && uid && String(ownerId(client)) === uid;
    const byName = norm(ownerName(client)) && norm(ownerName(client)) === norm(user.name || user.username || user.email || '');
    return !!(byId || byName);
  }

  function isApproved(client){ return norm(client && client.status).includes('aprov'); }
  function isCorrection(client){
    const s = norm(client && client.status);
    return s.includes('ajuste') || s.includes('correc') || s.includes('reprov');
  }
  function isPendingLike(client){
    const s = norm(client && client.status);
    return !s || s.includes('pendent') || s.includes('aguard') || s.includes('ajuste') || s.includes('correc') || s.includes('reprov');
  }

  function isPendingDecision(client){
    const s = norm(client && client.status);
    return !s || s.includes('pendent') || s.includes('analise');
  }

  function visibleInClientsList(client, user){
    if (!client || client.deleted || client.excluido || client.active === false) return false;
    if (canApproveClients(user)) return true;
    // Vendedor/usuario comum ve apenas cadastros proprios, incluindo os devolvidos para correcao.
    return isApproved(client) || (isOwner(client, user) && isCorrection(client));
  }

  function visibleInApprovalQueue(client, user){
    if (!client || client.deleted || client.excluido || client.active === false) return false;
    if (!canApproveClients(user)) return false;
    const s = norm(client.status);
    return s.includes('pendent') || s.includes('analise') || !s;
  }

  function getAllClients(){
    try {
      if (window.Store && Store.getAllClients) return Store.getAllClients() || [];
      if (window.Store && Store.getClients) return Store.getClients() || [];
    } catch (_) {}
    return [];
  }

  function saveClientsLocal(list){
    if (window.Store && Store.saveClients) Store.saveClients(list);
  }

  async function saveClientsRemote(list){
    saveClientsLocal(list);
    if (window.Store && Store.backendRequest && Store.getToken && Store.getToken()) {
      try {
        await Store.backendRequest('/api/store/clients', { method:'POST', body: JSON.stringify({ data:list }) });
      } catch (err) {
        console.warn('Cadastro atualizado localmente; falha temporária ao sincronizar no banco:', err.message || err);
        throw err;
      }
    }
  }

  function showToast(msg, type){
    if (window.App && App.showToast) App.showToast(msg, type || 'success'); else alert(msg);
  }

  function applyUnitFilter(list){
    try {
      const activeUnitId = Store.getActiveUnitId && Store.getActiveUnitId();
      if (activeUnitId && activeUnitId !== 'all') return list.filter(c => String(c.unitId || '') === String(activeUnitId));
    } catch (_) {}
    return list;
  }

  function sellerName(id, client){
    const direct = client && (client.vendedor_nome || client.vendedorName || client.sellerName || client.seller_name || client.vendedor || client.responsavel || client.userName || client.user_name);
    try {
      const resolved = (window.UI && UI.getUserName && id) ? UI.getUserName(id) : '';
      if (resolved && resolved !== 'Usuário não localizado') return resolved;
    } catch (_) {}
    return direct || id || '-';
  }

  function unitName(id){
    try { return (window.UI && UI.getUnitName) ? UI.getUnitName(id) : (id || '-'); } catch (_) { return id || '-'; }
  }

  function scoreText(client){
    try { if (window.UI && UI.formatClientScore) return UI.formatClientScore(client); } catch (_) {}
    const score = client.score ?? '-';
    const cls = client.classification || client.scoreClassification || '';
    return `${score}${cls ? ' ' + cls : ''}`;
  }

  function statusBadge(client){
    const s = String(client.status || 'Pendente');
    let cls = 'badge-warning';
    if (norm(s).includes('aprov')) cls = 'badge-success';
    if (norm(s).includes('reprov')) cls = 'badge-danger';
    if (norm(s).includes('ajuste') || norm(s).includes('correc')) cls = 'badge-primary';
    const reason = client.rejectionReason ? ` (${esc(client.rejectionReason)})` : '';
    return `<span class="badge-status ${cls}" style="font-size:.72rem;">${esc(s)}${reason}</span>`;
  }

  function renderClientsSafe(inputClients){
    const body = document.getElementById('clients-table-body');
    if (!body) return;
    const user = currentUser();
    let list = Array.isArray(inputClients) ? inputClients.slice() : getAllClients();
    list = applyUnitFilter(list).filter(c => visibleInClientsList(c, user));
    list.sort((a,b) => String(b.createdAt || b.created_at || b.date || '').localeCompare(String(a.createdAt || a.created_at || a.date || '')));

    body.innerHTML = list.map(c => {
      const canEditCorrection = isOwner(c, user) && isCorrection(c);
      const actionCorrection = canEditCorrection ? `<button class="btn btn-warning btn-sm" style="padding:2px 8px;font-size:.75rem;margin-left:4px;" onclick="event.stopPropagation(); App.editClientCorrection('${esc(c.id)}')">Corrigir</button>` : '';
      const canDelete = canApproveClients(user) && window.App;
      const delBtn = canDelete ? `<button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:.75rem;margin-left:4px;" onclick="event.stopPropagation(); App.deleteClientAdmin ? App.deleteClientAdmin('${esc(c.id)}') : App.deleteClient('${esc(c.id)}', event)">Apagar</button>` : '';
      return `<tr class="mobile-summary-row" onclick="App.showClientDetails('${esc(c.id)}')">
        <td data-label="Cliente" style="font-weight:600;">${esc(c.name || c.nomeFantasia || c.companyName || '-')}<div class="mobile-only-subtext" style="font-size:.75rem;color:var(--text-muted);font-weight:normal;margin-top:4px;">${esc(c.city || '')} ${c.date ? '• ' + esc(c.date) : ''}</div></td>
        <td data-label="CNPJ" class="mobile-hide">${esc(c.cnpj || '-')}</td>
        <td data-label="Categoria" class="mobile-hide">${esc(c.category || c.categoria || 'Não definida')}</td>
        <td data-label="Telefone" class="mobile-hide">${esc(c.phone || c.telefone || '-')}</td>
        <td data-label="E-mail" class="mobile-hide">${esc(c.email || '-')}</td>
        <td data-label="Unidade" class="mobile-hide"><span class="badge-status badge-primary" style="font-size:.7rem;font-weight:500;">${esc(unitName(c.unitId))}</span></td>
        <td data-label="Vendedor" class="mobile-hide"><span style="font-size:.75rem;color:var(--text-muted);">${esc(sellerName(ownerId(c), c))}</span></td>
        <td data-label="Score" class="mobile-hide">${esc(scoreText(c))}</td>
        <td data-label="Status">${statusBadge(c)}</td>
        <td data-label="Ações"><button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:.75rem;" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button>${actionCorrection}${delBtn}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:12px;">Nenhum cliente cadastrado.</td></tr>`;
  }

  function renderApprovalsSafe(inputClients){
    const body = document.getElementById('approvals-table-body');
    if (!body) return;
    const user = currentUser();
    const approver = canApproveClients(user);
    let list = Array.isArray(inputClients) ? inputClients.slice() : getAllClients();
    list = applyUnitFilter(list).filter(c => visibleInApprovalQueue(c, user));
    if (!list.length) {
      const msg = approver ? 'Nenhum cadastro pendente de aprovação.' : 'Nenhum cadastro seu aguardando aprovação ou correção.';
      body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:14px;">${msg}</td></tr>`;
      return;
    }
    body.innerHTML = list.map(c => {
      const owner = isOwner(c, user);
      const needsCorrection = isCorrection(c);
      const canCorrect = !approver && owner && needsCorrection;
      const actions = approver ? `<button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:.75rem;margin-right:4px;" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button><button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveClient('${esc(c.id)}','Aprovado')">Aprovar</button><button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.approveClient('${esc(c.id)}','Reprovado')">Reprovar</button>` : `<button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:.75rem;margin-right:4px;" onclick="event.stopPropagation(); App.showClientDetails('${esc(c.id)}')">Ver Ficha</button>${canCorrect ? `<button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); App.editClientCorrection('${esc(c.id)}')">Corrigir</button>` : `<span style="font-size:.75rem;color:var(--text-muted);">Aguardando análise</span>`}`;
      return `<tr class="mobile-summary-row" onclick="App.showClientDetails('${esc(c.id)}')">
        <td data-label="Cliente" style="font-weight:600;">${esc(c.name || c.companyName || '-')}</td>
        <td data-label="CNPJ">${esc(c.cnpj || '-')}</td>
        <td data-label="Telefone">${esc(c.phone || '-')}</td>
        <td data-label="E-mail">${esc(c.email || '-')}</td>
        <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:.7rem;font-weight:500;">${esc(unitName(c.unitId))}</span></td>
        <td data-label="Vendedor"><span style="font-size:.75rem;color:var(--text-muted);">${esc(sellerName(ownerId(c), c))}</span></td>
        <td data-label="Score">${esc(scoreText(c))}</td>
        <td data-label="Status">${statusBadge(c)}</td>
        <td data-label="Ações"><div class="client-approval-actions">${actions}</div></td>
      </tr>`;
    }).join('');
  }

  function patchStoreAndUi(){
    if (window.Store) {
      Store.canApproveClients = canApproveClients;
      if (!Store.__ccApprovalRoutesPatched2) {
        Store.__ccApprovalRoutesPatched2 = true;
        const oldAllowed = Store.getUserAllowedRoutes ? Store.getUserAllowedRoutes.bind(Store) : null;
        Store.getUserAllowedRoutes = function(user){
          let routes = oldAllowed ? (oldAllowed(user) || []) : ['#dashboard'];
          routes = Array.from(new Set(routes));
          if (user && !routes.includes('#clientes')) routes.push('#clientes');
          if (canApproveClients(user)) {
            if (!routes.includes('#aprovacao')) routes.push('#aprovacao');
          } else {
            routes = routes.filter(r => r !== '#aprovacao');
          }
          return routes;
        };
      }
    }
    if (window.UI && !UI.__ccApprovalRenderPatched2) {
      UI.__ccApprovalRenderPatched2 = true;
      UI.renderClients = renderClientsSafe;
      UI.renderApprovals = renderApprovalsSafe;
      UI._original_renderClients = renderClientsSafe;
      UI._original_renderApprovals = renderApprovalsSafe;
      const oldApply = UI.applyPermissions ? UI.applyPermissions.bind(UI) : null;
      UI.applyPermissions = function(){
        if (oldApply) oldApply();
        const allowed = canApproveClients(currentUser());
        ['tab-client-approvals','tab-client-approvals-queue'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.setProperty('display', allowed ? 'flex' : 'none', 'important');
        });
        document.querySelectorAll('#menu-aprovacao, .nav-link[href="#aprovacao"], .mobile-nav-item[href="#aprovacao"]').forEach(el => {
          el.style.setProperty('display', allowed ? 'flex' : 'none', 'important');
        });
        if (!allowed && window.location.hash === '#aprovacao') window.location.hash = '#clientes';
      };
    }
  }

  async function uploadOptionalPhotos(existingClient){
    const suffixes = ['fachada','interna01','interna02','interna03','rua01','rua02','cnpj'];
    const fieldMap = { fachada:'photoFachada', interna01:'photoInterna01', interna02:'photoInterna02', interna03:'photoInterna03', rua01:'photoRua01', rua02:'photoRua02', cnpj:'photoCnpj' };
    const result = {};
    suffixes.forEach(suffix => {
      const input = document.getElementById(`client-photo-${suffix}`);
      const field = fieldMap[suffix];
      result[suffix] = window.CCMediaPreserver
        ? CCMediaPreserver.clientValue(existingClient, field, input)
        : (existingClient[field] || '');
    });
    if (!window.App || !App.compressImageAndGetBase64 || !App.uploadBase64ToDatabase) return result;
    const cnpjVal = digits(document.getElementById('client-cnpj')?.value) || digits(existingClient.cnpj) || '00000000000000';
    for (const suffix of suffixes) {
      const fileInput = document.getElementById(`client-photo-${suffix}`);
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) continue;
      try {
        let url = fileInput.dataset.uploadedUrl;
        if (!url) {
          const base64 = await App.compressImageAndGetBase64(file);
          url = await App.uploadBase64ToDatabase(base64, `cliente-${cnpjVal}-${suffix}-${file.name || 'foto'}`, 'clientes');
        }
        if (url) {
          result[suffix] = url;
          fileInput.dataset.removeExisting = '0';
          fileInput.dataset.uploadedUrl = url; // cache back
        }
      } catch (err) {
        console.warn('Falha ao atualizar foto do cadastro em correção:', suffix, err.message || err);
      }
    }
    return result;
  }

  function setValue(id, value){
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value == null ? '' : value;
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function setProducts(products){
    const values = Array.isArray(products) ? products.map(String) : [];
    document.querySelectorAll('input[name="client-products"]').forEach(cb => { cb.checked = values.includes(String(cb.value)); });
  }

  function setFileRequired(required){
    ['fachada','interna01','interna02','interna03','rua01','rua02'].forEach(s => {
      const el = document.getElementById(`client-photo-${s}`);
      if (el) el.required = !!required;
    });
  }

  function clearCorrectionMode(){
    const form = document.getElementById('client-form');
    if (form) delete form.dataset.correctionId;
    if (window.App) App.currentClientCorrectionId = '';
    setFileRequired(true);
    const btn = form && form.querySelector('button[type="submit"]');
    if (btn && btn.dataset.normalText) btn.textContent = btn.dataset.normalText;
    const msg = document.getElementById('client-correction-alert');
    if (msg) msg.remove();
    
    // Seleciona automaticamente o vendedor logado e bloqueia a seleção ao cadastrar novo
    const loggedUser = window.Store ? Store.getLoggedUser() : null;
    const clientSeller = document.getElementById('client-seller');
    if (clientSeller && loggedUser) {
      clientSeller.value = loggedUser.id;
      clientSeller.disabled = true;
    }
  }

  async function submitCorrection(e){
    const form = document.getElementById('client-form');
    if (!form || !form.dataset.correctionId) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = form.dataset.correctionId;
    const user = currentUser();
    const clients = getAllClients();
    const idx = clients.findIndex(c => String(c.id) === String(id));
    if (idx < 0) return alert('Cadastro para correção não encontrado.');
    const previous = clients[idx];
    if (!isOwner(previous, user) && !canApproveClients(user)) return alert('Somente o vendedor que cadastrou ou um aprovador pode corrigir este cadastro.');
    if (isApproved(previous) && !canApproveClients(user)) return alert('Cadastro aprovado não pode ser alterado por aqui.');

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Reenviando...'; }
    try {
      const photoUrls = await uploadOptionalPhotos(previous);
      const updated = {
        ...previous,
        name: document.getElementById('client-name')?.value || previous.name,
        companyName: document.getElementById('client-company-name')?.value || '',
        cnpj: document.getElementById('client-cnpj')?.value || '',
        phone: document.getElementById('client-phone')?.value || '',
        email: document.getElementById('client-email')?.value || '',
        unitId: document.getElementById('client-unit')?.value || previous.unitId,
        userId: previous.userId || previous.user_id || user.id,
        category: document.getElementById('client-category')?.value || '',
        ie: document.getElementById('client-ie')?.value || '',
        city: document.getElementById('client-city')?.value || '',
        state: document.getElementById('client-state')?.value || '',
        cep: document.getElementById('client-cep')?.value || '',
        street: document.getElementById('client-street')?.value || '',
        number: document.getElementById('client-number')?.value || '',
        neighborhood: document.getElementById('client-neighborhood')?.value || '',
        addressFull: document.getElementById('client-address-full')?.value || '',
        locationType: document.getElementById('client-location-type')?.value || '',
        pavementType: document.getElementById('client-pavement-type')?.value || '',
        deliverySchedule: document.getElementById('client-delivery-schedule')?.value || '',
        nearbyAmaretto: document.getElementById('client-nearby-amaretto')?.value || '',
        nearbyCompetitor: document.getElementById('client-nearby-competitor')?.value || '',
        iceCreamExperience: document.getElementById('client-ice-cream-experience')?.value || '',
        dualBrandPreference: document.getElementById('client-dual-brand-preference')?.value || '',
        equipmentQty: document.getElementById('client-equipment-qty')?.value || '',
        requestedEqType: document.getElementById('client-requested-eq-type')?.value || '',
        sendableEqType: document.getElementById('client-sendable-eq-type')?.value || '',
        products: Array.from(document.querySelectorAll('input[name="client-products"]:checked')).map(el => el.value),
        predictedAverage: window.ccParseBrazilianMoney ? window.ccParseBrazilianMoney(document.getElementById('client-predicted-average')?.value || '0') : (parseFloat(document.getElementById('client-predicted-average')?.value || '0') || 0),
        firstOrderValue: window.ccParseBrazilianMoney ? window.ccParseBrazilianMoney(document.getElementById('client-first-order-value')?.value || '0') : (parseFloat(document.getElementById('client-first-order-value')?.value || '0') || 0),
        firstOrderPayment: document.getElementById('client-first-order-payment')?.value || '',
        firstOrderReason: document.getElementById('client-first-order-reason')?.value || '',
        repurchasePayment: document.getElementById('client-repurchase-payment')?.value || '',
        hasBonus: document.getElementById('client-has-bonus')?.value || '',
        bonusValue: window.ccParseBrazilianMoney ? window.ccParseBrazilianMoney(document.getElementById('client-bonus-value')?.value || '0') : (parseFloat(document.getElementById('client-bonus-value')?.value || '0') || 0),
        sellerAnalysis: document.getElementById('client-seller-analysis')?.value || '',
        route: document.getElementById('client-route')?.value || '',
        status: 'Pendente',
        rejectionReason: '',
        approvalReason: '',
        correctionRequested: false,
        correctionResubmittedAt: new Date().toISOString(),
        correctionResubmittedBy: user && user.id,
        photoFachada: photoUrls.fachada,
        photoInterna01: photoUrls.interna01,
        photoInterna02: photoUrls.interna02,
        photoInterna03: photoUrls.interna03,
        photoRua01: photoUrls.rua01,
        photoRua02: photoUrls.rua02,
        photoCnpj: photoUrls.cnpj
      };
      if (window.Scoring && Scoring.calculate) {
        const scoring = Scoring.calculate(updated);
        updated.score = scoring.score;
        updated.classification = scoring.classification;
      }
      clients[idx] = updated;
      await saveClientsRemote(clients);
      form.reset();
      clearCorrectionMode();
      document.getElementById('client-form-container')?.classList.add('hidden');
      if (window.App && App.refreshAllLists) App.refreshAllLists();
      showToast('Cadastro corrigido e reenviado para aprovação!');
    } catch (err) {
      alert('Não foi possível reenviar a correção agora: ' + (err.message || err));
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Enviar Cadastro Completo para Aprovação'; }
    }
  }


  function updateLocalClientStatus(id, status, reason, extra){
    const clients = getAllClients();
    const sid = String(id || '');
    const idx = clients.findIndex(c => String(c.id || c.cnpj || c.codigo || '') === sid);
    if (idx < 0) return null;
    const user = currentUser();
    const updated = {
      ...clients[idx],
      status,
      rejectionReason: reason || '',
      reviewedBy: user && user.id,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(extra || {})
    };
    clients[idx] = updated;
    if (window.Store && Store.saveClients) Store.saveClients(clients);
    return { updated, clients };
  }

  async function updateClientApprovalOnServer(id, status, reason, sendToCorrection){
    const payload = { status, reason: reason || '', sendToCorrection: !!sendToCorrection };
    if (window.Store && Store.backendRequest && Store.getToken && Store.getToken()) {
      const resp = await Store.backendRequest(`/api/clientes-aprovacao/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (resp && resp.client && window.Store && Store.saveClients) {
        const current = getAllClients();
        const sid = String(id || '');
        const idx = current.findIndex((client, index) => clientKey(client, index) === sid || String(client.id || '') === sid);
        if (idx >= 0) current[idx] = { ...current[idx], ...resp.client };
        else current.push(resp.client);
        Store.saveClients(current);
      }
      return resp;
    }
    throw new Error('Sessão autenticada não encontrada. Entre novamente antes de analisar o cadastro.');
  }

  function setApprovalBusy(id, busy, label){
    const safeId = String(id || '').replace(/'/g, "\\'");
    document.querySelectorAll(`button[onclick*="approveClient('${safeId}'"]`).forEach(btn => {
      if (!btn.dataset.ccOriginalLabel) btn.dataset.ccOriginalLabel = btn.textContent;
      btn.disabled = !!busy;
      btn.setAttribute('aria-busy', busy ? 'true' : 'false');
      btn.textContent = busy ? (label || 'Processando...') : btn.dataset.ccOriginalLabel;
    });
  }

  function patchApp(){
    if (!window.App || App.__ccApprovalFlowPatched2) return;
    App.__ccApprovalFlowPatched2 = true;

    App.approveClient = async function(id, newStatus){
      const user = currentUser();
      if (!canApproveClients(user)) return alert('Somente administrador ou usuário autorizado para liberação/movimentação de equipamentos pode aprovar ou reprovar clientes.');
      const client = getAllClients().find((item, index) => clientKey(item, index) === String(id) || String(item.id || '') === String(id));
      if (!client) return alert('Cadastro não encontrado. Atualize a tela e tente novamente.');
      if (!isPendingDecision(client)) return alert(`Este cadastro já foi analisado e está com status ${client.status || 'indefinido'}.`);
      if (newStatus === 'Reprovado') {
        const modal = document.getElementById('modal-rejection-reason');
        const form = document.getElementById('modal-rejection-form');
        if (!modal || !form) return alert('Modal de reprovação não encontrado.');
        form.dataset.targetId = id;
        const notes = document.getElementById('modal-rejection-notes');
        const select = document.getElementById('modal-rejection-select');
        const check = document.getElementById('modal-rejection-send-to-correction');
        if (notes) notes.value = '';
        if (select && !select.value) select.value = select.options && select.options[0] ? select.options[0].value : '';
        if (check) check.checked = true;
        modal.style.display = 'flex';
        return;
      }
      try {
        setApprovalBusy(id, true, 'Aprovando...');
        await updateClientApprovalOnServer(id, 'Aprovado', '', false);
        if (window.App && App.refreshAllLists) App.refreshAllLists();
        const details = document.getElementById('modal-client-details');
        if (details) details.style.display = 'none';
        showToast('Cadastro aprovado e salvo no banco!');
      } catch (err) {
        alert('Não foi possível salvar a aprovação no banco: ' + (err.message || err));
      } finally {
        setApprovalBusy(id, false);
      }
    };

    App.editClientCorrection = function(id){
      const user = currentUser();
      const clients = getAllClients();
      const client = clients.find(c => String(c.id) === String(id));
      if (!client) return alert('Cadastro não encontrado.');
      if (!isOwner(client, user) && !canApproveClients(user)) return alert('Somente o vendedor que cadastrou pode corrigir este cadastro.');
      if (!(norm(client.status).includes('ajuste') || norm(client.status).includes('correc') || norm(client.status).includes('reprov'))) {
        return alert('Este cadastro não está marcado para correção.');
      }
      window.location.hash = '#clientes';
      setTimeout(() => {
        document.getElementById('modal-client-details')?.style && (document.getElementById('modal-client-details').style.display = 'none');
        const container = document.getElementById('client-form-container');
        const form = document.getElementById('client-form');
        if (!container || !form) return alert('Formulário de cliente não encontrado.');
        container.classList.remove('hidden');
        form.dataset.correctionId = id;
        if (window.App) App.currentClientCorrectionId = id;
        setFileRequired(false);
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.dataset.normalText = btn.dataset.normalText || btn.textContent; btn.textContent = 'Reenviar Cadastro Corrigido'; }
        if (!document.getElementById('client-correction-alert')) {
          const box = document.createElement('div');
          box.id = 'client-correction-alert';
          box.className = 'alert-warning';
          box.style.cssText = 'border:1px solid #f59e0b;background:rgba(245,158,11,.12);color:#fbbf24;border-radius:8px;padding:10px 12px;margin:12px 0;font-size:.85rem;';
          box.innerHTML = `<strong>Cadastro em correção:</strong> ajuste as informações necessárias e reenvie para aprovação. Motivo: ${esc(client.rejectionReason || '-')}`;
          form.prepend(box);
        }
        const fill = () => {
          setValue('client-seller', ownerId(client));
          setValue('client-name', client.name || '');
          setValue('client-company-name', client.companyName || '');
          setValue('client-cnpj', client.cnpj || '');
          setValue('client-ie', client.ie || '');
          setValue('client-category', client.category || '');
          setValue('client-phone', client.phone || '');
          setValue('client-email', client.email || '');
          setValue('client-city', client.city || '');
          setValue('client-state', client.state || '');
          setValue('client-cep', client.cep || '');
          setValue('client-street', client.street || '');
          setValue('client-number', client.number || '');
          setValue('client-neighborhood', client.neighborhood || '');
          setValue('client-address-full', client.addressFull || '');
          setValue('client-location-type', client.locationType || '');
          setValue('client-pavement-type', client.pavementType || '');
          setValue('client-delivery-schedule', client.deliverySchedule || '');
          setValue('client-unit', client.unitId || '');
          setValue('client-nearby-amaretto', client.nearbyAmaretto || '');
          setValue('client-nearby-competitor', client.nearbyCompetitor || '');
          setValue('client-ice-cream-experience', client.iceCreamExperience || '');
          setValue('client-dual-brand-preference', client.dualBrandPreference || '');
          setValue('client-equipment-qty', client.equipmentQty || '');
          setValue('client-requested-eq-type', client.requestedEqType || '');
          setValue('client-sendable-eq-type', client.sendableEqType || '');
          setProducts(client.products || []);
          setValue('client-predicted-average', client.predictedAverage || '');
          setValue('client-first-order-value', client.firstOrderValue || '');
          setValue('client-first-order-payment', client.firstOrderPayment || '');
          setValue('client-first-order-reason', client.firstOrderReason || '');
          setValue('client-repurchase-payment', client.repurchasePayment || '');
          setValue('client-has-bonus', client.hasBonus || '');
          setValue('client-bonus-value', client.bonusValue || '');
          setValue('client-seller-analysis', client.sellerAnalysis || '');
          setValue('client-route', client.route || '');
        };
        fill(); setTimeout(fill, 200);
        container.scrollIntoView({ behavior:'smooth', block:'start' });
      }, 250);
    };

    const openBtn = document.getElementById('btn-open-client-form');
    if (openBtn && !openBtn.dataset.clearCorrectionBound) {
      openBtn.dataset.clearCorrectionBound = '1';
      openBtn.addEventListener('click', () => setTimeout(clearCorrectionMode, 50));
    }
  }

  function patchRejectionForm(){
    const form = document.getElementById('modal-rejection-form');
    if (!form || form.dataset.ccApprovalCaptureBound === '1') return;
    form.dataset.ccApprovalCaptureBound = '1';
    form.addEventListener('submit', async function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      const user = currentUser();
      if (!canApproveClients(user)) return alert('Sem permissão para aprovar/reprovar clientes.');
      const id = form.dataset.targetId;
      const reason = document.getElementById('modal-rejection-select')?.value || '';
      const notes = document.getElementById('modal-rejection-notes')?.value.trim() || '';
      const sendToCorrection = !!document.getElementById('modal-rejection-send-to-correction')?.checked;
      const finalStatus = sendToCorrection ? 'Aguardando Ajuste' : 'Reprovado';
      const fullReason = reason + (notes ? ' — ' + notes : '');
      if (!fullReason.trim()) return alert('Informe o motivo da reprovação ou da devolução para correção.');
      const submit = form.querySelector('button[type="submit"]');
      try {
        if (submit) {
          submit.disabled = true;
          submit.dataset.ccOriginalLabel = submit.dataset.ccOriginalLabel || submit.textContent;
          submit.textContent = 'Salvando análise...';
        }
        setApprovalBusy(id, true, 'Processando...');
        await updateClientApprovalOnServer(id, finalStatus, fullReason, sendToCorrection);
        const modal = document.getElementById('modal-rejection-reason');
        if (modal) modal.style.display = 'none';
        form.reset();
        if (window.App && App.refreshAllLists) App.refreshAllLists();
        showToast(sendToCorrection ? 'Cadastro enviado para correção do vendedor e salvo no banco!' : 'Cadastro reprovado e salvo no banco!');
      } catch (err) {
        alert('Não foi possível salvar a reprovação/correção no banco: ' + (err.message || err));
      } finally {
        setApprovalBusy(id, false);
        if (submit) {
          submit.disabled = false;
          submit.textContent = submit.dataset.ccOriginalLabel || 'Confirmar';
        }
      }
    }, true);
  }

  function patchClientDetailsButton(){
    if (!window.UI || UI.__ccDetailsCorrectionPatched2) return;
    UI.__ccDetailsCorrectionPatched2 = true;
    const oldShow = UI.showClientDetails ? UI.showClientDetails.bind(UI) : null;
    UI.showClientDetails = function(client){
      const result = oldShow ? oldShow(client) : undefined;
      setTimeout(() => {
        const modal = document.getElementById('modal-client-details');
        const content = document.getElementById('client-details-content');
        const user = currentUser();
        if (!modal || !content || !client || modal.style.display === 'none') return;
        const canCorrect = isOwner(client, user) && (norm(client.status).includes('ajuste') || norm(client.status).includes('correc') || norm(client.status).includes('reprov'));
        const pendingDecision = isPendingDecision(client);
        const canReview = canApproveClients(user);
        const reviewerId = client.reviewedBy || client.approvedBy || client.rejectedBy || '';
        let reviewerName = reviewerId || '-';
        try { if (reviewerId && window.UI && UI.getUserName) reviewerName = UI.getUserName(reviewerId) || reviewerName; } catch (_) {}
        const reviewedAt = client.reviewedAt || client.approvedAt || client.rejectedAt || client.approved_at || client.rejected_at || '';
        let formattedAt = '-';
        if (reviewedAt) {
          const parsed = new Date(reviewedAt);
          formattedAt = Number.isNaN(parsed.getTime()) ? String(reviewedAt) : parsed.toLocaleString('pt-BR');
        }
        if (!document.getElementById('client-review-decision-panel')) {
          const panel = document.createElement('div');
          panel.id = 'client-review-decision-panel';
          panel.style.cssText = 'border:1px solid var(--border-color);background:rgba(37,99,235,.08);border-radius:10px;padding:12px;margin:0 0 14px;';
          const buttons = canReview && pendingDecision
            ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;"><button class="btn btn-success" type="button" onclick="App.approveClient('${esc(client.id)}','Aprovado')">Aprovar cadastro</button><button class="btn btn-danger" type="button" onclick="App.approveClient('${esc(client.id)}','Reprovado')">Reprovar cadastro</button></div>`
            : '';
          const result = !pendingDecision
            ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:6px;">Responsável pela análise: <strong style="color:var(--text-main);">${esc(reviewerName)}</strong><br>Data e horário: <strong style="color:var(--text-main);">${esc(formattedAt)}</strong>${client.rejectionReason ? `<br>Motivo: <strong style="color:var(--danger);">${esc(client.rejectionReason)}</strong>` : ''}</div>`
            : '';
          const statusClass = pendingDecision ? 'badge-warning' : (norm(client.status).includes('aprov') ? 'badge-success' : 'badge-danger');
          panel.innerHTML = `<strong style="display:block;color:var(--primary-light);">Análise do cadastro</strong><div style="font-size:.82rem;margin-top:5px;">Status atual: <span class="badge-status ${statusClass}">${esc(client.status || 'Pendente')}</span></div>${result}${buttons}`;
          content.prepend(panel);
        }
        if (canCorrect && !document.getElementById('btn-client-correction-from-details')) {
          const btn = document.createElement('button');
          btn.id = 'btn-client-correction-from-details';
          btn.className = 'btn btn-warning';
          btn.type = 'button';
          btn.style.cssText = 'width:100%;margin:0 0 14px 0;min-height:40px;font-weight:700;';
          btn.textContent = 'Corrigir cadastro e reenviar para aprovação';
          btn.onclick = () => window.App && App.editClientCorrection && App.editClientCorrection(client.id);
          content.prepend(btn);
        }
      }, 80);
      return result;
    };
  }

  function start(){
    patchStoreAndUi();
    patchApp();
    patchRejectionForm();
    patchClientDetailsButton();
    const form = document.getElementById('client-form');
    if (form && form.dataset.ccCorrectionSubmitBound !== '1') {
      form.dataset.ccCorrectionSubmitBound = '1';
      form.addEventListener('submit', submitCorrection, true);
    }
    try {
      if (window.UI && UI.applyPermissions) UI.applyPermissions();
      if (window.location.hash === '#clientes' && window.UI && UI.renderClients) UI.renderClients(getAllClients());
      if (window.location.hash === '#aprovacao' && window.UI && UI.renderApprovals) UI.renderApprovals(getAllClients());
    } catch (_) {}
  }

  start();
  document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('hashchange', () => setTimeout(start, 80));
  setInterval(() => { patchStoreAndUi(); patchApp(); patchRejectionForm(); patchClientDetailsButton(); }, 3000);
})();


/* ===== clientes-aprovacao-ajuste-final.js ===== */

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
  const clientOwnerId = (c) => String((c && (c.userId || c.user_id || c.usuario_id || c.usuarioId || c.vendedor_id || c.vendedorId || c.seller_id || c.sellerId || c.createdBy || c.created_by || c.ownerId)) || '');
  const clientOwnerName = (c) => String((c && (c.vendedor_nome || c.vendedorName || c.sellerName || c.seller_name || c.vendedor || c.responsavel || c.responsavel_nome || c.userName || c.user_name)) || '');
  const isOwner = (c, u) => {
    const current = u || user();
    const idMatch = String(clientOwnerId(c)) && String(clientOwnerId(c)) === String(current.id || '');
    const nameMatch = norm(clientOwnerName(c)) && norm(clientOwnerName(c)) === norm(current.name || current.username || current.email || '');
    return !!(idMatch || nameMatch);
  };
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
    // Permissão "Clientes" ou "Cadastro de Clientes" não deve abrir Fila de Aprovações.
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
      'confirmacao de movimentacao',
      'avaliacao de movimentacao',
    ].some(x => text.includes(x));
  }

  function clientsForMainList(list){
    const u = user();
    const approver = canApproveClients(u);
    return (Array.isArray(list) ? list : []).filter(c => {
      if (isDeleted(c)) return false;
      if (approver) return true;
      // Vendedor ve apenas os proprios cadastros: aprovados ou devolvidos para correcao.
      return isApproved(c) || (isOwner(c, u) && isCorrection(c));
    });
  }

  function clientsForApprovalQueue(list){
    const u = user();
    const approver = canApproveClients(u);
    if (!approver) return [];
    return (Array.isArray(list) ? list : []).filter(c => {
      if (isDeleted(c)) return false;
      const s = statusNorm(c);
      return s.includes('pendent') || s.includes('analise') || !s;
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
        if (el) el.style.setProperty('display', allowed ? 'flex' : 'none', 'important');
      });
      document.querySelectorAll('#menu-aprovacao, .nav-link[href="#aprovacao"], .mobile-nav-item[href="#aprovacao"]').forEach(el => {
        el.style.setProperty('display', allowed ? 'flex' : 'none', 'important');
      });
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
    if (window.CCMediaPreserver) CCMediaPreserver.renderClientPhotos(client);
    const safeClient = window.CCMediaPreserver ? CCMediaPreserver.hydrateClient(client) : client;
    const photos = [
      ['Fachada', safeClient.photoFachada],
      ['Interna 1', safeClient.photoInterna01],
      ['Interna 2', safeClient.photoInterna02],
      ['Interna 3', safeClient.photoInterna03],
      ['Rua 1', safeClient.photoRua01],
      ['Rua 2', safeClient.photoRua02],
      ['CNPJ', safeClient.photoCnpj]
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


/* ===== equipamentos-importados.js ===== */

(function(){
  'use strict';
  if (window.__ccEquipamentosImportados) return;
  window.__ccEquipamentosImportados = true;
  var cache = [];
  var page = 1;
  var pageSize = 10;
  var previewRows = [];
  var previewHeaders = [];
  function norm(v){ return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>'"]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]; }); }
  function user(){ try { return Store.getLoggedUser() || {}; } catch(_) { return {}; } }
  function perms(u){ u = u || user(); return Array.isArray(u.permissions) ? u.permissions.map(norm) : []; }
  function isAdmin(u){ u = u || user(); var p = norm(u.profile); return p.indexOf('admin') >= 0 || p.indexOf('administrador') >= 0 || perms(u).some(function(x){ return x.indexOf('admin') >= 0 || x.indexOf('administrador') >= 0; }); }
  function canUse(u){ u = u || user(); var p = norm(u.profile); var text = [p].concat(perms(u)).join(' | '); return isAdmin(u) || text.indexOf('movimentacao de equipamentos') >= 0 || text.indexOf('movimentacao equipamento') >= 0 || text.indexOf('equipamentos') >= 0 || text.indexOf('responsavel equipamentos') >= 0 || text.indexOf('confirmacao de movimentacao') >= 0 || text.indexOf('avaliacao de movimentacao') >= 0; }
  function apiBase(){ return Store.getApiBaseUrl ? Store.getApiBaseUrl() : ''; }
  function api(endpoint, options){ return Store.backendRequest(endpoint, options || {}); }
  function unitName(id){ try { return UI.getUnitName ? UI.getUnitName(id) : id; } catch(_) { return id || '-'; } }
  function userName(id){ try { var n = UI.getUserName ? UI.getUserName(id) : id; return n === 'Usuário não localizado' ? id : n; } catch(_) { return id || '-'; } }
  function movementCards(){ var view = document.getElementById('view-movimentacao'); if (!view) return []; return Array.prototype.slice.call(view.children).filter(function(el){ return el.classList && el.classList.contains('card') && el.id !== 'imported-equipment-panel'; }); }
  function showTab(name){ var panel = document.getElementById('imported-equipment-panel'); var importBtn = document.getElementById('tab-equipamentos-importados'); var movBtn = document.getElementById('tab-movimentacao-principal'); var importing = name === 'importados'; movementCards().forEach(function(el){ el.style.display = importing ? 'none' : ''; }); if (panel) panel.style.display = importing ? 'block' : 'none'; if (importBtn) importBtn.classList.toggle('active', importing); if (movBtn) movBtn.classList.toggle('active', !importing); if (importing) loadList(); }
  function ensureUI(){
    if (window.location.hash !== '#movimentacao') return;
    var tabs = document.querySelector('#view-movimentacao .view-tabs');
    if (!tabs || !canUse()) return;
    var first = tabs.querySelector('a[href="#movimentacao"]');
    if (first && !first.id) { first.id = 'tab-movimentacao-principal'; first.addEventListener('click', function(ev){ ev.preventDefault(); showTab('movimentacao'); }); }
    if (!document.getElementById('tab-equipamentos-importados')) { var btn = document.createElement('a'); btn.href = '#movimentacao'; btn.id = 'tab-equipamentos-importados'; btn.className = 'view-tab-btn'; btn.textContent = 'Equipamentos Importados'; btn.addEventListener('click', function(ev){ ev.preventDefault(); showTab('importados'); }); tabs.appendChild(btn); }
    if (!document.getElementById('imported-equipment-panel')) { var panel = document.createElement('div'); panel.id = 'imported-equipment-panel'; panel.className = 'card'; panel.style.display = 'none'; panel.innerHTML = panelHtml(); tabs.insertAdjacentElement('afterend', panel); bindPanel(); }
    ensureAdicaoCodeField(); bindImportedLookup();
  }
  function panelHtml(){ var admin = isAdmin(); return '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><span class="card-title">Equipamentos Importados</span><span id="imported-equipment-count" style="color:var(--text-muted);font-size:.82rem;">0 registros</span></div>'+ 
    '<div style="padding:18px 20px;border-bottom:1px solid var(--border-color);"><form id="imported-equipment-form" style="display:grid;grid-template-columns:2fr 1fr auto;gap:10px;align-items:end;"><div class="form-group" style="margin:0;"><label for="imported-equipment-file">Planilha (.xlsx ou .csv)</label><input type="file" id="imported-equipment-file" accept=".xlsx,.xls,.csv,text/csv" required></div><div class="form-group" style="margin:0;"><label for="imported-equipment-unit">Unidade</label><select id="imported-equipment-unit"><option value="all">Todas</option></select></div><button type="submit" class="btn btn-primary" style="height:38px;">Mapear Colunas</button></form><div id="imported-equipment-mapping" style="display:none;margin-top:14px;padding-top:14px;border-top:1px dashed var(--border-color);"></div><p id="imported-equipment-message" style="margin:10px 0 0;color:var(--text-muted);font-size:.82rem;"></p></div>'+ 
    '<div style="padding:14px 20px;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;flex:1;"><input id="imported-equipment-search" type="text" placeholder="Buscar por patrimonio, contrato, modelo ou marca..." style="max-width:340px;width:100%;height:36px;padding:0 10px;background:var(--bg-input);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px;">' + (admin ? '<button type="button" id="btn-equipamentos-delete-all" class="btn btn-danger btn-sm" style="height:36px;display:inline-flex;align-items:center;gap:6px;"><i class="fas fa-trash-alt"></i> Excluir Todos</button>' : '') + '</div><div style="display:flex;gap:8px;align-items:center;"><button type="button" id="imported-equipment-prev" class="btn btn-secondary btn-sm">Anterior</button><span id="imported-equipment-page" style="color:var(--text-muted);font-size:.82rem;">1/1</span><button type="button" id="imported-equipment-next" class="btn btn-secondary btn-sm">Próxima</button></div></div>'+ 
    '<div class="table-responsive" style="padding:0 20px 20px;"><table><thead><tr><th>Nr. Contrato</th><th>Dt. Emissão</th><th>Patrimônio</th><th>Marca</th><th>Nr. Patrimônio</th><th>Unidade</th><th>Atualizado em</th><th>Usuário</th>'+(admin?'<th>Ações</th>':'')+'</tr></thead><tbody id="imported-equipment-body"><tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Carregando...</td></tr></tbody></table></div>'; }
  function bindPanel(){ setTimeout(function(){ var unit = document.getElementById('imported-equipment-unit'); if (unit && Store.getUnits) { var u = user(); var units = Store.getUnits() || []; if (u.unitId && u.unitId !== 'all') { unit.innerHTML = '<option value="'+esc(u.unitId)+'">'+esc(unitName(u.unitId))+'</option>'; unit.disabled = true; } else unit.innerHTML = '<option value="all">Todas</option>' + units.map(function(x){ return '<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>'; }).join(''); } }, 50); document.getElementById('imported-equipment-form')?.addEventListener('submit', previewFile); document.getElementById('imported-equipment-search')?.addEventListener('input', function(){ page = 1; renderList(); }); document.getElementById('imported-equipment-prev')?.addEventListener('click', function(){ if (page > 1) { page--; renderList(); } }); document.getElementById('imported-equipment-next')?.addEventListener('click', function(){ var total = Math.max(1, Math.ceil(filtered().length / pageSize)); if (page < total) { page++; renderList(); } }); document.getElementById('btn-equipamentos-delete-all')?.addEventListener('click', async function(){ if(!confirm('Deseja REALMENTE excluir TODOS os equipamentos importados do sistema? Esta ação é irreversível.')) return; try { var res = await api('/api/equipamentos-importados/delete-all', {method:'POST'}); if(res && res.success) { App.showToast('Todos os ' + (res.count || 0) + ' equipamentos foram excluídos.'); await loadList(); } } catch(err) { alert('Erro ao excluir: ' + (err.message || err)); } }); }
  function guessHeader(kind){
    var tests = kind === 'nr_contrato' ? ['contrato'] :
                kind === 'dt_emissao' ? ['emissao','data'] :
                kind === 'patrimonio' ? ['patrimonio'] :
                kind === 'marca' ? ['marca'] :
                ['nr','num','patrimonio'];
    return previewHeaders.find(function(h){ var n = norm(h); return tests.some(function(t){ return n.indexOf(t) >= 0; }); }) || '';
  }
  function selectHtml(id, selected){ return '<select id="'+id+'" required><option value="">Selecione...</option>'+previewHeaders.map(function(h){ return '<option value="'+esc(h)+'" '+(h===selected?'selected':'')+'>'+esc(h)+'</option>'; }).join('')+'</select>'; }
  function renderMapping(){
    var box = document.getElementById('imported-equipment-mapping');
    if (!box) return;
    box.style.display = 'block';
    var sample = previewRows.slice(0,3);
    box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,minmax(140px,1fr)) auto;gap:10px;align-items:end;">'
      + '<div class="form-group" style="margin:0;"><label>Nr. Contrato</label>'+selectHtml('map-eq-nr-contrato', guessHeader('nr_contrato'))+'</div>'
      + '<div class="form-group" style="margin:0;"><label>Dt. Emissão</label>'+selectHtml('map-eq-dt-emissao', guessHeader('dt_emissao'))+'</div>'
      + '<div class="form-group" style="margin:0;"><label>Patrimônio</label>'+selectHtml('map-eq-patrimonio', guessHeader('patrimonio'))+'</div>'
      + '<div class="form-group" style="margin:0;"><label>Marca</label>'+selectHtml('map-eq-marca', guessHeader('marca'))+'</div>'
      + '<div class="form-group" style="margin:0;"><label>Nr. Patrimônio</label>'+selectHtml('map-eq-nr-patrimonio', guessHeader('nr_patrimonio'))+'</div>'
      + '<button type="button" id="confirm-imported-equipment" class="btn btn-success" style="height:38px;">Importar</button></div>'
      + '<div style="margin-top:10px;color:var(--text-muted);font-size:.82rem;">'+previewRows.length+' linhas encontradas. Confira as colunas e confirme a importação.</div>'
      + previewTable(sample);
    document.getElementById('confirm-imported-equipment')?.addEventListener('click', importMapped);
  }
  function previewTable(rows){ if (!rows.length) return ''; var cols = previewHeaders.slice(0,6); return '<div class="table-responsive" style="margin-top:10px;"><table><thead><tr>'+cols.map(function(h){ return '<th>'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>'+rows.map(function(r){ return '<tr>'+cols.map(function(h){ return '<td>'+esc(r[h])+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>'; }
  async function previewFile(ev){ ev.preventDefault(); var file = document.getElementById('imported-equipment-file')?.files?.[0]; var msg = document.getElementById('imported-equipment-message'); if (!file) return; var fd = new FormData(); fd.append('file', file); if (msg) msg.textContent = 'Lendo planilha...'; try { var token = Store.getToken ? Store.getToken() : ''; var response = await fetch(apiBase() + '/api/equipamentos-importados/preview', { method:'POST', headers:{ Authorization:'Bearer ' + token }, body: fd }); var data = await response.json().catch(function(){ return {}; }); if (!response.ok) throw new Error(data.error || 'Erro ao ler planilha.'); previewRows = data.rows || []; previewHeaders = data.headers || []; if (!previewHeaders.length) throw new Error('Nenhuma coluna encontrada na planilha.'); if (msg) msg.textContent = 'Planilha carregada. Faça o mapeamento das colunas.'; renderMapping(); } catch(err) { previewRows = []; previewHeaders = []; if (msg) msg.textContent = err.message || String(err); } }
  async function importMapped(){
    var msg = document.getElementById('imported-equipment-message');
    var mapping = {
      nr_contrato: document.getElementById('map-eq-nr-contrato')?.value || '',
      dt_emissao: document.getElementById('map-eq-dt-emissao')?.value || '',
      patrimonio: document.getElementById('map-eq-patrimonio')?.value || '',
      marca: document.getElementById('map-eq-marca')?.value || '',
      nr_patrimonio: document.getElementById('map-eq-nr-patrimonio')?.value || ''
    };
    if (!mapping.patrimonio || !mapping.nr_patrimonio) {
      if (msg) msg.textContent = 'Selecione pelo menos as colunas de Patrimônio e Nr. Patrimônio.';
      return;
    }
    var fd = new FormData();
    fd.append('rows_json', JSON.stringify(previewRows));
    fd.append('mapping_json', JSON.stringify(mapping));
    fd.append('unitId', document.getElementById('imported-equipment-unit')?.value || 'all');
    if (msg) msg.textContent = 'Importando equipamentos...';
    try {
      var token = Store.getToken ? Store.getToken() : '';
      var response = await fetch(apiBase() + '/api/equipamentos-importados/import', { method:'POST', headers:{ Authorization:'Bearer ' + token }, body: fd });
      var data = await response.json().catch(function(){ return {}; });
      if (!response.ok) throw new Error(data.error || 'Erro ao importar.');
      if (msg) msg.textContent = 'Importação concluída: '+(data.created||0)+' criados, '+(data.updated||0)+' atualizados, '+(data.ignored||0)+' ignorados.';
      var box = document.getElementById('imported-equipment-mapping');
      if (box) box.style.display = 'none';
      previewRows = [];
      previewHeaders = [];
      var file = document.getElementById('imported-equipment-file');
      if (file) file.value = '';
      await loadList();
    } catch(err) {
      if (msg) msg.textContent = err.message || String(err);
    }
  }
  async function loadList(){ if (!canUse()) return; try { var params = new URLSearchParams(); var unitId = document.getElementById('imported-equipment-unit')?.value || ''; if (unitId) params.set('unitId', unitId); cache = await api('/api/equipamentos-importados' + (params.toString() ? '?' + params.toString() : '')); renderList(); } catch(err) { var body = document.getElementById('imported-equipment-body'); if (body) body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--danger);">'+esc(err.message || err)+'</td></tr>'; } }
  function filtered(){
    var q = norm(document.getElementById('imported-equipment-search')?.value || '');
    return (cache || []).filter(function(x){
      return !q || norm(x.codigo_equipamento).indexOf(q)>=0 || norm(x.nome_equipamento).indexOf(q)>=0 || norm(x.empresa_nome).indexOf(q)>=0 || norm(x.nr_contrato).indexOf(q)>=0 || norm(x.marca).indexOf(q)>=0;
    });
  }
  function renderList(){
    var body = document.getElementById('imported-equipment-body');
    if (!body) return;
    var admin = isAdmin();
    var list = filtered();
    var total = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > total) page = total;
    var slice = list.slice((page - 1) * pageSize, page * pageSize);
    var count = document.getElementById('imported-equipment-count');
    if (count) count.textContent = list.length + ' registros';
    var pageEl = document.getElementById('imported-equipment-page');
    if (pageEl) pageEl.textContent = page + '/' + total;
    body.innerHTML = slice.map(function(item){
      return '<tr>' +
        '<td>' + esc(item.nr_contrato || '-') + '</td>' +
        '<td>' + esc(item.dt_emissao || '-') + '</td>' +
        '<td>' + esc(item.nome_equipamento || item.patrimonio || '-') + '</td>' +
        '<td>' + esc(item.empresa_nome || item.marca || '-') + '</td>' +
        '<td style="font-family:monospace;font-weight:700;">' + esc(item.codigo_equipamento || item.nr_patrimonio) + '</td>' +
        '<td>' + esc(unitName(item.unitId)) + '</td>' +
        '<td>' + (item.updated_at ? new Date(item.updated_at).toLocaleString('pt-BR') : '-') + '</td>' +
        '<td>' + esc(userName(item.atualizado_por || item.criado_por)) + '</td>' +
        (admin ? '<td><button class="btn btn-secondary btn-sm" onclick="window.EquipamentosImportados.edit('+item.id+')">Editar</button><button class="btn btn-danger btn-sm" onclick="window.EquipamentosImportados.remove('+item.id+')">Excluir</button></td>' : '') +
        '</tr>';
    }).join('') || '<tr><td colspan="' + (admin ? 9 : 8) + '" style="text-align:center;color:var(--text-muted);">Nenhum equipamento importado.</td></tr>';
  }
  async function edit(id){
    if (!isAdmin()) return;
    var item = cache.find(function(x){ return Number(x.id) === Number(id); });
    if (!item) return;
    var nr_contrato = prompt('Nº Contrato:', item.nr_contrato || '');
    if (nr_contrato == null) return;
    var dt_emissao = prompt('Dt. Emissão:', item.dt_emissao || '');
    if (dt_emissao == null) return;
    var name = prompt('Patrimônio:', item.nome_equipamento || item.patrimonio || '');
    if (name == null) return;
    var marca = prompt('Marca:', item.empresa_nome || item.marca || '');
    if (marca == null) return;
    var code = prompt('Nº Patrimônio:', item.codigo_equipamento || item.nr_patrimonio || '');
    if (code == null) return;
    
    await api('/api/equipamentos-importados/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify({
        nr_contrato: nr_contrato,
        dt_emissao: dt_emissao,
        codigo_equipamento: code,
        nome_equipamento: name,
        empresa_nome: marca,
        patrimonio: name,
        marca: marca,
        nr_patrimonio: code
      })
    });
    await loadList();
  }
  async function remove(id){ if (!isAdmin() || !confirm('Excluir equipamento importado?')) return; await api('/api/equipamentos-importados/' + encodeURIComponent(id), { method:'DELETE' }); await loadList(); }
  async function lookupImported(code){ code = String(code || '').trim(); if (!code || !canUse()) return null; try { var data = await api('/api/equipamentos-importados/lookup/' + encodeURIComponent(code)); return data && data.found ? data.equipamento : null; } catch(_) { return null; } }
  function setModelValue(modelEl, name){ if (!modelEl) return; if (modelEl.tagName === 'SELECT') { var opt = Array.prototype.slice.call(modelEl.options).find(function(o){ return o.value === name || o.textContent === name; }); if (!opt) { opt = new Option(name, name); modelEl.appendChild(opt); } modelEl.value = name; } else { modelEl.value = name; modelEl.readOnly = true; modelEl.style.backgroundColor = 'rgba(255,255,255,0.03)'; } }
  function enableVoltage(voltageEl){ if (!voltageEl) return; voltageEl.removeAttribute('disabled'); voltageEl.style.backgroundColor = ''; if (['110','220'].indexOf(String(voltageEl.value || '')) < 0) voltageEl.value = ''; }
  function patchCheckPatrimonio(){ if (!window.App || App.__ccImportedPatrimonioPatched) return; App.__ccImportedPatrimonioPatched = true; var oldCheck = App.checkPatrimonio ? App.checkPatrimonio.bind(App) : null; App.checkPatrimonio = async function(inputEl, modelEl, voltagemEl, linkEl){ var code = (inputEl && inputEl.value || '').trim(); var imported = await lookupImported(code); if (imported) { setModelValue(modelEl, imported.nome_equipamento); enableVoltage(voltagemEl); if (linkEl) linkEl.style.display = 'none'; if (App.showToast) App.showToast('Equipamento importado localizado: ' + imported.nome_equipamento); return; } if (oldCheck) return oldCheck(inputEl, modelEl, voltagemEl, linkEl); }; }
  function ensureAdicaoCodeField(){ var model = document.getElementById('mov-modelo-adicao'); if (!model || document.getElementById('mov-patrimonio-adicao')) return; var group = document.createElement('div'); group.className = 'form-group'; group.innerHTML = '<label for="mov-patrimonio-adicao">Número do Patrimônio</label><input type="text" id="mov-patrimonio-adicao" placeholder="Digite o número do patrimônio..."><div id="hist-patrimonio-adicao-link" style="margin-top:4px;display:none;"></div>'; model.closest('.form-group')?.insertAdjacentElement('beforebegin', group); }
  function bindImportedLookup(){ patchCheckPatrimonio(); [['mov-patrimonio-antigo','mov-modelo-antigo','mov-voltagem-antiga','hist-patrimonio-antigo-link'],['mov-patrimonio-novo','mov-modelo-novo','mov-voltagem-nova','hist-patrimonio-novo-link'],['mov-patrimonio-recolha','mov-modelo-recolha','mov-voltagem-recolha','hist-patrimonio-recolha-link'],['mov-patrimonio-adesivar','mov-modelo-adesivar','mov-voltagem-adesivar','hist-patrimonio-adesivar-link'],['mov-patrimonio-adicao','mov-modelo-adicao','mov-voltagem-adicao','hist-patrimonio-adicao-link']].forEach(function(pair){ var el = document.getElementById(pair[0]); if (!el || el.dataset.importedEquipBound === '1') return; el.dataset.importedEquipBound = '1'; el.addEventListener('blur', function(){ App.checkPatrimonio(el, document.getElementById(pair[1]), document.getElementById(pair[2]), document.getElementById(pair[3])); }); }); }
  window.EquipamentosImportados = { edit: edit, remove: remove, loadList: loadList, showTab: showTab };
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(ensureUI, 300); });
  window.addEventListener('hashchange', function(){ setTimeout(ensureUI, 300); });
  setInterval(function(){ if (window.location.hash === '#movimentacao') ensureUI(); }, 1500);
})();


/* ===== paginacao-performance-listas.js ===== */

/* Otimização de listas pesadas: paginação local e despesas sem carregar miniaturas. */
(function(){
  'use strict';
  if (window.__ccPaginacaoPerformance0207) return;
  window.__ccPaginacaoPerformance0207 = true;

  const PAGE_SIZE = 5;
  const TARGETS = {
    despesas: { renderMethod: 'renderExpenses', tbodyId: 'expenses-table-body', storeMethod: 'getExpenses', label: 'despesas' },
    movimentacao: { renderMethod: 'renderMovements', tbodyId: 'movements-table-body', storeMethod: 'getMovements', label: 'movimentações' },
    chamados: { renderMethod: 'renderTickets', tbodyId: 'tickets-table-body', storeMethod: 'getTickets', label: 'chamados' },
    clientes: { renderMethod: 'renderClients', tbodyId: 'clients-table-body', storeMethod: 'getClients', label: 'clientes' }
  };
  const state = {
    despesas: { page: 1, signature: '', raw: [] },
    movimentacao: { page: 1, signature: '', raw: [] },
    chamados: { page: 1, signature: '', raw: [] },
    clientes: { page: 1, signature: '', raw: [] }
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
  function canCorrectExpense(exp, user){
    const profile = normalize(user && user.profile);
    const permissions = Array.isArray(user && user.permissions) ? user.permissions.map(normalize) : [];
    const admin = profile.includes('admin') || permissions.some(permission => permission.includes('admin'));
    return !!user && (admin || String(exp && exp.userId) === String(user.id));
  }
  function getActiveUnitId(){
    try { return window.Store && Store.getActiveUnitId ? Store.getActiveUnitId() : 'all'; } catch(_) { return 'all'; }
  }
  function isAdminOrAllUnits(user){
    const profile = normalize(user && user.profile);
    const perms = Array.isArray(user && user.permissions) ? user.permissions.map(normalize) : [];
    return String(user && user.unitId || '').toLowerCase() === 'all'
      || profile.includes('admin')
      || profile.includes('administrador')
      || perms.some(p => p.includes('admin') || p.includes('administrador'));
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
    if (typeof value === 'number') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    let raw = String(value).replace(/[^0-9,.-]/g, '').trim();
    if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
    const n = Number(raw);
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
    let edit = '';
    const user = getUser();
    const expenseStatus = normalize(exp && exp.status);
    if ((expenseStatus.includes('correc') || expenseStatus.includes('reprov')) && canCorrectExpense(exp, user)) {
      const correctionLabel = expenseStatus.includes('reprov') ? 'Refazer Despesa' : 'Corrigir';
      correction = `<button class="btn btn-warning btn-sm cc-btn-corrigir-despesa" onclick="event.stopPropagation(); App.correctExpenseAndResubmit && App.correctExpenseAndResubmit('${id}')">${correctionLabel}</button>`;
    }
    if (pending(exp && exp.status) && user && String(exp && exp.userId) === String(user.id)) {
      edit = `<button class="btn btn-warning btn-sm cc-btn-editar-despesa" onclick="event.stopPropagation(); App.editPendingExpense && App.editPendingExpense('${id}')">Editar</button>`;
    }
    return `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.__ccOpenExpenseDetails('${id}')">Ver Detalhes</button>
      <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.generateExpenseComprovantePdf && App.generateExpenseComprovantePdf('${id}')">PDF</button>
      ${edit}
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
    // A unidade global selecionada vale tambem para administradores e usuarios
    // com acesso a todas as unidades. "all" e a unica opcao que consolida tudo.
    if (activeUnitId && activeUnitId !== 'all') {
      out = out.filter(item => String(item.unitId || item.unit_id || '') === String(activeUnitId));
    }
    if ((moduleKey === 'despesas' || moduleKey === 'chamados') && user && user.profile === 'Vendedor' && !isAdminOrAllUnits(user)) {
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
      const finalidade = (exp.finalidade === 'Outro' || exp.finalidade === 'Outros') ? `Outro (${exp.descreva || ''})` : (exp.finalidade || '-');
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
      const colspan = moduleKey === 'chamados' ? 12 : (moduleKey === 'clientes' ? 10 : 11);
      const msg = moduleKey === 'chamados' ? 'Nenhum chamado mecânico encontrado.' : 
                  moduleKey === 'clientes' ? 'Nenhum cliente cadastrado.' : 'Nenhuma movimentação registrada.';
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
    if (!baseRender.clientes) baseRender.clientes = (UI._original_renderClients || UI.renderClients || function(){}).bind(UI);

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
    UI.renderClients = function(data){
      const raw = Array.isArray(data) ? data : listFromStore('clientes');
      state.clientes.raw = raw;
      return renderWithBase('clientes', raw);
    };

    // Atualiza a tela atual quando o patch entra, sem mexer no banco.
    setTimeout(function(){
      const hash = String(location.hash || '');
      if (hash.includes('despesas') && document.getElementById('expenses-table-body')) UI.renderExpenses(state.despesas.raw.length ? state.despesas.raw : listFromStore('despesas'));
      if (hash.includes('movimentacao') && document.getElementById('movements-table-body')) UI.renderMovements(state.movimentacao.raw.length ? state.movimentacao.raw : listFromStore('movimentacao'));
      if (hash.includes('chamados') && document.getElementById('tickets-table-body')) UI.renderTickets(state.chamados.raw.length ? state.chamados.raw : listFromStore('chamados'));
      if (hash.includes('clientes') && document.getElementById('clients-table-body')) UI.renderClients(state.clientes.raw.length ? state.clientes.raw : listFromStore('clientes'));
    }, 250);
    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 150); });
})();


/* ===== photo-capture-helper.js ===== */

(function() {
  'use strict';

  function createBottomSheet() {
    let container = document.getElementById('cc-photo-sheet-container');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'cc-photo-sheet-container';
    container.style.cssText = 'display:none;';
    container.innerHTML = `
      <style>
        .cc-photo-sheet-overlay {
          position: fixed;
          inset: 0;
          z-index: 999999;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .cc-photo-sheet-overlay.active {
          opacity: 1;
          pointer-events: auto;
        }
        .cc-photo-sheet {
          background: #1f2937;
          border-top-left-radius: 20px;
          border-top-right-radius: 20px;
          padding: 20px;
          width: 100%;
          max-width: 480px;
          box-sizing: border-box;
          transform: translateY(100%);
          transition: transform(100%);
          transition: transform 0.25s cubic-bezier(0.1, 0.76, 0.55, 0.94);
        }
        .cc-photo-sheet-overlay.active .cc-photo-sheet {
          transform: translateY(0);
        }
        .cc-photo-sheet-title {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          color: #f3f4f6;
          text-align: center;
          margin-top: 0;
          margin-bottom: 18px;
        }
        .cc-photo-sheet-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          height: 48px;
          border: 1px solid var(--border-color, #374151);
          background: rgba(255,255,255,0.03);
          color: #fff;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          margin-bottom: 10px;
          cursor: pointer;
          font-family: system-ui, -apple-system, sans-serif;
          transition: background 0.15s ease;
        }
        .cc-photo-sheet-btn:active, .cc-photo-sheet-btn:hover {
          background: rgba(255,255,255,0.08);
        }
        .cc-photo-sheet-btn.cc-cancel {
          background: #ef4444;
          border: 1px solid #dc2626;
          margin-bottom: 0;
          margin-top: 8px;
        }
        .cc-photo-sheet-btn.cc-cancel:active, .cc-photo-sheet-btn.cc-cancel:hover {
          background: #dc2626;
        }
      </style>
      <div class="cc-photo-sheet-overlay" id="cc-photo-overlay">
        <div class="cc-photo-sheet">
          <h3 class="cc-photo-sheet-title">Como deseja anexar a foto?</h3>
          <button type="button" class="cc-photo-sheet-btn" id="cc-btn-camera">
            📷 Tirar Foto (Câmera)
          </button>
          <button type="button" class="cc-photo-sheet-btn" id="cc-btn-gallery">
            🖼️ Escolher da Galeria
          </button>
          <button type="button" class="cc-photo-sheet-btn cc-cancel" id="cc-btn-cancel">
            Cancelar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    container.style.display = 'block';
    return container;
  }

  let activeInput = null;
  let activeStream = null;

  function closeSheet() {
    const overlay = document.getElementById('cc-photo-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  function handleCamera() {
    closeSheet();
    showInAppCamera();
  }

  function handleGallery() {
    if (!activeInput) return;
    const input = activeInput;
    closeSheet();

    input.removeAttribute('capture');
    input.dataset.ccIgnoreClick = 'true';
    input.click();

    setTimeout(() => {
      delete input.dataset.ccIgnoreClick;
    }, 800);
  }

  function showInAppCamera() {
    let cameraOverlay = document.getElementById('cc-inapp-camera-overlay');
    if (!cameraOverlay) {
      cameraOverlay = document.createElement('div');
      cameraOverlay.id = 'cc-inapp-camera-overlay';
      cameraOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999999;
        background: #000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        font-family: system-ui, -apple-system, sans-serif;
      `;
      cameraOverlay.innerHTML = `
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 15px; box-sizing: border-box; background: rgba(0,0,0,0.5); position: absolute; top:0; z-index: 10;">
          <span style="color:#fff; font-size:1.1rem; font-weight:600;">Câmera do Sistema</span>
          <button type="button" id="cc-camera-close-btn" style="background:none; border:none; color:#fff; font-size:1.8rem; cursor:pointer; padding:5px; line-height:1;">&times;</button>
        </div>
        <video id="cc-camera-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
        <div style="width:100%; display:flex; justify-content:center; align-items:center; padding:30px 20px; box-sizing:border-box; background:rgba(0,0,0,0.3); position:absolute; bottom:0; z-index:10;">
          <button type="button" id="cc-camera-capture-btn" style="width: 72px; height: 72px; border-radius: 50%; background: #fff; border: 5px solid rgba(255,255,255,0.3); box-shadow: 0 0 10px rgba(0,0,0,0.5); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; transition: transform 0.1s ease; outline: none;">
            <div style="width: 50px; height: 50px; border-radius: 50%; background: #fff; border: 2px solid #000;"></div>
          </button>
        </div>
      `;
      document.body.appendChild(cameraOverlay);
    }

    cameraOverlay.style.display = 'flex';

    const video = document.getElementById('cc-camera-video');
    const closeBtn = document.getElementById('cc-camera-close-btn');
    const captureBtn = document.getElementById('cc-camera-capture-btn');

    closeBtn.onclick = closeInAppCamera;

    captureBtn.onclick = function() {
      captureBtn.style.transform = 'scale(0.9)';
      setTimeout(() => { captureBtn.style.transform = 'scale(1)'; }, 100);
      takeSnapshot(video);
    };

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }).then(stream => {
      activeStream = stream;
      video.srcObject = stream;
    }).catch(err => {
      console.error('Erro ao acessar a câmera:', err);
      alert('Não foi possível acessar a câmera. Verifique se deu permissão de acesso à câmera no seu navegador.');
      closeInAppCamera();
    });
  }

  function closeInAppCamera() {
    const cameraOverlay = document.getElementById('cc-inapp-camera-overlay');
    if (cameraOverlay) {
      cameraOverlay.style.display = 'none';
    }
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }
    activeInput = null;
  }

  function takeSnapshot(video) {
    if (!activeInput) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) {
        alert('Erro ao capturar a imagem.');
        closeInAppCamera();
        return;
      }
      
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        activeInput.files = dataTransfer.files;
        activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.error('Erro ao injetar arquivo no input:', err);
      }
      
      closeInAppCamera();
    }, 'image/jpeg', 0.85);
  }

  document.addEventListener('click', function(e) {
    const target = e.target;
    if (target && target.tagName === 'INPUT' && target.type === 'file' && target.accept && target.accept.includes('image')) {
      if (target.dataset.ccIgnoreClick === 'true') {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();

      activeInput = target;
      createBottomSheet();

      setTimeout(() => {
        const overlay = document.getElementById('cc-photo-overlay');
        if (overlay) {
          overlay.classList.add('active');
          document.getElementById('cc-btn-camera').onclick = handleCamera;
          document.getElementById('cc-btn-gallery').onclick = handleGallery;
          document.getElementById('cc-btn-cancel').onclick = function() {
            closeSheet();
            activeInput = null;
          };
          overlay.onclick = function(evt) {
            if (evt.target === overlay) {
              closeSheet();
              activeInput = null;
            }
          };
        }
      }, 50);
    }
  }, true);

})();


/* ===== correcoes-09-07.js ===== */

/* Correcoes 09/07: chamados, tipos de equipamento, visibilidade e edicao admin */
(function(){
  if (window.__correcoes0907) return;
  window.__correcoes0907 = true;

  function norm(v){ return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function user(){ return window.Store && Store.getLoggedUser ? Store.getLoggedUser() : null; }
  function isAdmin(){
    var u = user();
    var p = norm(u && u.profile);
    var perms = Array.isArray(u && u.permissions) ? u.permissions.map(norm) : [];
    return p.indexOf('admin') >= 0 || p.indexOf('administrador') >= 0 || perms.some(function(x){ return x.indexOf('admin') >= 0 || x.indexOf('administrador') >= 0; });
  }
  function cleanConfigList(list){
    var seen = {};
    return (Array.isArray(list) ? list : []).map(function(item){
      if (item && typeof item === 'object') return item.name || item.nome || item.label || item.value || item.descricao || '';
      return item;
    }).map(function(v){ return String(v || '').trim(); })
      .filter(function(v){
        var k = norm(v);
        if (!v || k === 'undefined' || k === '[object object]' || seen[k]) return false;
        seen[k] = true;
        return true;
      });
  }
  function equipmentTypes(){ return cleanConfigList(Store && Store.getEquipmentTypes ? Store.getEquipmentTypes() : []); }
  function setValue(id, value){ var el = document.getElementById(id); if (el) el.value = value == null ? '' : value; }
  function show(el){ if (el) { el.classList.remove('hidden'); el.style.display = ''; } }
  function hide(el){ if (el) { el.classList.add('hidden'); el.style.display = 'none'; } }

  function normalizeTicketTypeSelect(){
    var select = document.getElementById('ticket-open-eq-type');
    if (!select) return;
    var current = select.value;
    var types = equipmentTypes();
    select.innerHTML = '<option value="" disabled selected>Selecione...</option>' + types.map(function(t){ return '<option value="'+esc(t)+'">'+esc(t)+'</option>'; }).join('');
    if (current && types.some(function(t){ return norm(t) === norm(current); })) select.value = types.find(function(t){ return norm(t) === norm(current); });
  }

  function unlockAllUnitsTicketSelect(){
    var u = user();
    var sel = document.getElementById('ticket-open-unit');
    if (!u || !sel) return;
    if (String(u.unitId || '').toLowerCase() === 'all') {
      sel.disabled = false;
      sel.removeAttribute('readonly');
      if (!sel.value || sel.value === 'all') {
        var firstReal = Array.from(sel.options).find(function(o){ return o.value && o.value !== 'all'; });
        if (firstReal) sel.value = firstReal.value;
      }
    }
  }

  function patchPopulateConfigDropdowns(){
    if (!window.UI || UI.__cc0907PopulatePatched) return;
    UI.__cc0907PopulatePatched = true;
    var old = UI.populateConfigDropdowns ? UI.populateConfigDropdowns.bind(UI) : function(){};
    UI.populateConfigDropdowns = function(){
      old();
      normalizeTicketTypeSelect();
      ['client-requested-eq-type','mov-modelo-adicao'].forEach(function(id){
        var el = document.getElementById(id);
        if (!el || el.tagName !== 'SELECT') return;
        var current = el.value;
        var types = equipmentTypes();
        el.innerHTML = '<option value="" disabled selected>Selecione...</option>' + types.map(function(t){ return '<option value="'+esc(t)+'">'+esc(t)+'</option>'; }).join('');
        if (current && types.some(function(t){ return norm(t) === norm(current); })) el.value = current;
      });
      unlockAllUnitsTicketSelect();
    };
  }

  function addAdminClientButtons(){
    if (!isAdmin()) return;
    document.querySelectorAll('#clients-table-body tr').forEach(function(tr){
      var btn = tr.querySelector('button[onclick*="showClientDetails"]');
      if (!btn || tr.querySelector('.cc-edit-client-btn')) return;
      var m = String(btn.getAttribute('onclick') || '').match(/showClientDetails\('([^']+)'\)/);
      if (!m) return;
      btn.insertAdjacentHTML('afterend', ' <button class="btn btn-secondary btn-sm cc-edit-client-btn" onclick="event.stopPropagation(); App.editClientAdmin(\''+esc(m[1])+'\')">Editar</button>');
    });
  }

  function addAdminTicketButtons(){
    if (!isAdmin()) return;
    document.querySelectorAll('#tickets-table-body tr').forEach(function(tr){
      if (tr.querySelector('.cc-edit-ticket-btn')) return;
      var idCell = tr.querySelector('td[data-label="Chamado"]');
      var action = tr.querySelector('td[data-label="AÃ§Ã£o"],td[data-label="Ação"]');
      var id = idCell ? idCell.textContent.trim() : '';
      if (id && action) action.insertAdjacentHTML('beforeend', ' <button class="btn btn-secondary btn-sm cc-edit-ticket-btn" onclick="event.stopPropagation(); App.editTicketAdmin(\''+esc(id)+'\')">Editar</button>');
    });
  }

  function addAdminMovementButtons(){
    if (!isAdmin()) return;
    document.querySelectorAll('#movements-table-body tr').forEach(function(tr){
      if (tr.querySelector('.cc-edit-movement-btn')) return;
      var btn = tr.querySelector('button[onclick*="showMovementDetails"]');
      if (!btn) return;
      var m = String(btn.getAttribute('onclick') || '').match(/showMovementDetails\('([^']+)'\)/);
      if (!m) return;
      btn.insertAdjacentHTML('afterend', ' <button class="btn btn-secondary btn-sm cc-edit-movement-btn" onclick="event.stopPropagation(); App.editMovementAdmin(\''+esc(m[1])+'\')">Editar</button>');
    });
  }

  function patchRenders(){
    if (!window.UI || UI.__cc0907RendersPatched) return;
    UI.__cc0907RendersPatched = true;
    var rc = UI.renderClients ? UI.renderClients.bind(UI) : null;
    if (rc) UI.renderClients = function(list){ rc(list); addAdminClientButtons(); };
    var rt = UI.renderTickets ? UI.renderTickets.bind(UI) : null;
    if (rt) UI.renderTickets = function(list){ rt(list); addAdminTicketButtons(); };
    var rm = UI.renderMovements ? UI.renderMovements.bind(UI) : null;
    if (rm) UI.renderMovements = function(list){ rm(list); addAdminMovementButtons(); };
  }

  function patchTicketDetails(){
    if (!window.App || App.__cc0907TicketDetailsPatched) return;
    App.__cc0907TicketDetailsPatched = true;
    var old = App.showTicketDetails ? App.showTicketDetails.bind(App) : null;
    if (!old) return;
    App.showTicketDetails = function(id){
      old(id);
      setTimeout(function(){
        var tickets = Store.getTickets ? Store.getTickets() : [];
        var t = tickets.find(function(x){ return String(x.id) === String(id); });
        var body = document.getElementById('modal-ticket-details-mobile-content');
        if (!t || !body || body.querySelector('[data-client-code-row]')) return;
        var code = t.clientCode || t.cliente_codigo || '-';
        var grupo = t.clientGroup || t.cliente_grupo || '-';
        var html = '<div data-client-code-row style="margin:8px 0;padding:8px;border:1px solid var(--border-color);border-radius:6px;"><span style="display:block;color:var(--text-muted);font-size:.7rem;font-weight:700;text-transform:uppercase;">Código do Cliente</span><strong>'+esc(code)+'</strong></div>' +
                   '<div data-client-group-row style="margin:8px 0;padding:8px;border:1px solid var(--border-color);border-radius:6px;"><span style="display:block;color:var(--text-muted);font-size:.7rem;font-weight:700;text-transform:uppercase;">Grupo de Cliente</span><strong>'+esc(grupo)+'</strong></div>';
        body.insertAdjacentHTML('afterbegin', html);
      }, 80);
    };
  }

  function patchOpenTicketSubmit(){
    document.addEventListener('submit', async function(ev){
      var form = ev.target;
      if (!form || form.id !== 'ticket-open-form' || !form.dataset.editingId) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!isAdmin()) return alert('Somente administrador pode editar chamados.');
      var id = form.dataset.editingId;
      var photoUrl = form.dataset.defectPhoto || '';
      var photo = document.getElementById('ticket-open-photo-defect');
      if (photo && photo.files && photo.files[0] && App.uploadFile) photoUrl = await App.uploadFile(photo.files[0]);
      var videoUrl = form.dataset.defectVideo || '';
      var video = document.getElementById('ticket-open-video-defect');
      if (video && video.files && video.files[0] && App.uploadFile) videoUrl = await App.uploadFile(video.files[0]);
      try {
        await App.fetchFromApi('/api/chamados/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify({
            unitId: document.getElementById('ticket-open-unit')?.value || '',
            userId: document.getElementById('ticket-open-seller')?.value || '',
            equipmentType: document.getElementById('ticket-open-eq-type')?.value || '',
            equipmentSerial: document.getElementById('ticket-open-serial')?.value.trim() || '',
            clientCode: document.getElementById('ticket-open-client-code')?.value.trim() || '',
            clientSeller: document.getElementById('ticket-open-client-seller-imported')?.value.trim() || '',
            clientGroup: document.getElementById('ticket-open-client-group-imported')?.value.trim() || '',
            client: document.getElementById('ticket-open-client')?.value.trim() || '',
            fantasyName: document.getElementById('ticket-open-fantasy')?.value.trim() || '',
            city: document.getElementById('ticket-open-city')?.value.trim() || '',
            address: document.getElementById('ticket-open-address')?.value.trim() || '',
            title: document.getElementById('ticket-open-title')?.value.trim() || '',
            priority: document.getElementById('ticket-open-priority')?.value || '',
            observations: document.getElementById('ticket-open-obs')?.value.trim() || '',
            defectPhoto: photoUrl,
            defectVideo: videoUrl
          })
        });
        delete form.dataset.editingId;
        form.reset();
        hide(document.getElementById('ticket-form-container'));
        await App.loadTickets();
        App.showToast('Chamado editado com sucesso.');
      } catch(err) {
        alert('Erro ao editar chamado: ' + (err.message || err));
      }
    }, true);
  }

  function patchMovementSubmit(){
    document.addEventListener('submit', async function(ev){
      var form = ev.target;
      if (!form || form.id !== 'movement-form' || !form.dataset.editingId) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!isAdmin()) return alert('Somente administrador pode editar movimentaÃ§Ãµes.');
      var id = form.dataset.editingId;
      var tipo = document.getElementById('mov-tipo-solicitacao')?.value || '';
      var payload = {
        empresa: document.getElementById('mov-empresa')?.selectedOptions?.[0]?.text || document.getElementById('mov-empresa')?.value || '',
        tipo_solicitacao: tipo,
        vendedor_solicitante: document.getElementById('mov-vendedor-solicitante')?.value || '',
        cliente_codigo: document.getElementById('mov-client-id')?.value || '',
        cliente_nome: document.getElementById('mov-client-name')?.value.trim() || '',
        cliente_cidade: document.getElementById('mov-client-city')?.value.trim() || '',
        cliente_endereco: document.getElementById('mov-client-address')?.value.trim() || '',
        cliente_vendedor: document.getElementById('mov-client-seller')?.value.trim() || ''
      };
      if (tipo === 'Troca') {
        Object.assign(payload, {
          patrimonio: document.getElementById('mov-patrimonio-antigo')?.value.trim().toUpperCase() || '',
          modelo: document.getElementById('mov-modelo-antigo')?.value.trim() || '',
          voltagem: document.getElementById('mov-voltagem-antiga')?.value || '',
          patrimonio_novo: document.getElementById('mov-patrimonio-novo')?.value.trim().toUpperCase() || '',
          modelo_novo: document.getElementById('mov-modelo-novo')?.value.trim() || '',
          voltagem_nova: document.getElementById('mov-voltagem-nova')?.value || '',
          detalhe_troca_adicao: document.getElementById('mov-detalhe-troca')?.value.trim() || ''
        });
      }
      try {
        await App.fetchFromApi('/api/equipamentos/movimentacoes/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(payload) });
        delete form.dataset.editingId;
        form.reset();
        hide(document.getElementById('movement-form-container'));
        await App.loadMovements();
        App.showToast('MovimentaÃ§Ã£o editada com sucesso.');
      } catch(err) {
        alert('Erro ao editar movimentaÃ§Ã£o: ' + (err.message || err));
      }
    }, true);
  }

  function patchClientSubmit(){
    document.addEventListener('submit', async function(ev){
      var form = ev.target;
      if (!form || form.id !== 'client-form' || !form.dataset.editingId) return;
      if (window.__ccFinalClientEditActive) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!isAdmin()) return alert('Somente administrador pode editar clientes.');
      var id = form.dataset.editingId;
      var clients = Store.getClients ? Store.getClients() : [];
      var idx = clients.findIndex(function(c){ return String(c.id) === String(id); });
      if (idx < 0) return alert('Cliente nÃ£o encontrado.');
      var c = Object.assign({}, clients[idx], {
        name: document.getElementById('client-name')?.value || clients[idx].name,
        cnpj: document.getElementById('client-cnpj')?.value || clients[idx].cnpj,
        phone: document.getElementById('client-phone')?.value || clients[idx].phone,
        email: document.getElementById('client-email')?.value || clients[idx].email,
        unitId: document.getElementById('client-unit')?.value || clients[idx].unitId,
        userId: document.getElementById('client-seller')?.value || clients[idx].userId,
        category: document.getElementById('client-category')?.value || clients[idx].category,
        companyName: document.getElementById('client-company-name')?.value || clients[idx].companyName,
        ie: document.getElementById('client-ie')?.value || clients[idx].ie,
        city: document.getElementById('client-city')?.value || clients[idx].city,
        state: document.getElementById('client-state')?.value || clients[idx].state,
        cep: document.getElementById('client-cep')?.value || clients[idx].cep,
        street: document.getElementById('client-street')?.value || clients[idx].street,
        number: document.getElementById('client-number')?.value || clients[idx].number,
        neighborhood: document.getElementById('client-neighborhood')?.value || clients[idx].neighborhood,
        addressFull: document.getElementById('client-address-full')?.value || clients[idx].addressFull,
        updatedAt: new Date().toISOString()
      });
      clients[idx] = c;
      Store.saveClients(clients);
      try { await App.fetchFromApi('/api/store/clients', { method: 'POST', body: JSON.stringify({ data: clients }) }); } catch(e) {}
      delete form.dataset.editingId;
      form.reset();
      hide(document.getElementById('client-form-container'));
      if (App.refreshAllLists) App.refreshAllLists();
      App.showToast('Cliente editado com sucesso.');
    }, true);
  }

  function installAppEditors(){
    if (!window.App || App.__cc0907EditorsInstalled) return;
    App.__cc0907EditorsInstalled = true;

    App.editTicketAdmin = function(id){
      if (!isAdmin()) return alert('Somente administrador pode editar chamados.');
      var t = (Store.getTickets ? Store.getTickets() : []).find(function(x){ return String(x.id) === String(id); });
      if (!t) return alert('Chamado nÃ£o encontrado.');
      normalizeTicketTypeSelect();
      show(document.getElementById('ticket-form-container'));
      var form = document.getElementById('ticket-open-form');
      if (form) { form.dataset.editingId = t.id; form.dataset.defectPhoto = t.defectPhoto || ''; form.dataset.defectVideo = t.defectVideo || ''; form.noValidate = true; }
      document.querySelectorAll('#ticket-open-form input[type="file"]').forEach(function(el){ el.required = false; });
      setValue('ticket-open-unit', t.unitId);
      setValue('ticket-open-seller', t.userId);
      setValue('ticket-open-eq-type', t.equipmentType);
      setValue('ticket-open-serial', t.equipmentSerial);
      setValue('ticket-open-client-code', t.clientCode || t.cliente_codigo || '');
      setValue('ticket-open-client', t.client);
      setValue('ticket-open-fantasy', t.fantasyName);
      setValue('ticket-open-city', t.city);
      setValue('ticket-open-address', t.address);
      setValue('ticket-open-title', t.title);
      setValue('ticket-open-priority', t.priority);
      setValue('ticket-open-obs', t.observations);
      document.getElementById('ticket-form-container')?.scrollIntoView({ behavior:'smooth', block:'start' });
    };

    App.editMovementAdmin = async function(id){
      if (!isAdmin()) return alert('Somente administrador pode editar movimentaÃ§Ãµes.');
      var mov = null;
      try { mov = await App.fetchFromApi('/api/equipamentos/movimentacoes/' + encodeURIComponent(id)); } catch(e) {}
      mov = mov || (Store.getMovements ? Store.getMovements() : []).find(function(x){ return String(x.id) === String(id); });
      if (!mov) return alert('MovimentaÃ§Ã£o nÃ£o encontrada.');
      show(document.getElementById('movement-form-container'));
      var form = document.getElementById('movement-form');
      if (form) { form.dataset.editingId = mov.id; form.noValidate = true; }
      setValue('mov-tipo-solicitacao', mov.tipo_solicitacao);
      document.getElementById('mov-tipo-solicitacao')?.dispatchEvent(new Event('change'));
      setValue('mov-client-id', mov.cliente_codigo);
      setValue('mov-client-name', mov.cliente_nome);
      setValue('mov-client-city', mov.cliente_cidade);
      setValue('mov-client-address', mov.cliente_endereco);
      setValue('mov-client-seller', mov.cliente_vendedor);
      setValue('mov-vendedor-solicitante', mov.vendedor_solicitante);
      if (mov.tipo_solicitacao === 'Troca') {
        setValue('mov-patrimonio-antigo', mov.patrimonio);
        setValue('mov-modelo-antigo', mov.modelo);
        setValue('mov-voltagem-antiga', mov.voltagem);
        setValue('mov-patrimonio-novo', mov.patrimonio_novo);
        setValue('mov-modelo-novo', mov.modelo_novo);
        setValue('mov-voltagem-nova', mov.voltagem_nova);
        setValue('mov-detalhe-troca', mov.detalhe_troca_adicao);
      }
      document.querySelectorAll('#movement-form input[type="file"]').forEach(function(el){ el.required = false; });
      document.getElementById('movement-form-container')?.scrollIntoView({ behavior:'smooth', block:'start' });
    };

    App.editClientAdmin = function(id){
      if (!isAdmin()) return alert('Somente administrador pode editar clientes.');
      var c = (Store.getClients ? Store.getClients() : []).find(function(x){ return String(x.id) === String(id); });
      if (!c) return alert('Cliente nÃ£o encontrado.');
      show(document.getElementById('client-form-container'));
      var form = document.getElementById('client-form');
      if (form) { form.dataset.editingId = c.id; form.noValidate = true; }
      setValue('client-name', c.name);
      setValue('client-cnpj', c.cnpj);
      setValue('client-phone', c.phone);
      setValue('client-email', c.email);
      setValue('client-unit', c.unitId);
      setValue('client-seller', c.userId);
      const clientSeller = document.getElementById('client-seller');
      if (clientSeller) clientSeller.disabled = false; // Permite Admin editar o proprietário
      setValue('client-category', c.category);
      setValue('client-company-name', c.companyName);
      setValue('client-ie', c.ie);
      setValue('client-city', c.city);
      setValue('client-state', c.state);
      setValue('client-cep', c.cep);
      setValue('client-street', c.street);
      setValue('client-number', c.number);
      setValue('client-neighborhood', c.neighborhood);
      setValue('client-address-full', c.addressFull);
      document.querySelectorAll('#client-form input[type="file"]').forEach(function(el){ el.required = false; });
      document.getElementById('client-form-container')?.scrollIntoView({ behavior:'smooth', block:'start' });
    };
  }

  function start(){
    patchPopulateConfigDropdowns();
    patchRenders();
    patchTicketDetails();
    installAppEditors();
    patchOpenTicketSubmit();
    patchMovementSubmit();
    patchClientSubmit();
    normalizeTicketTypeSelect();
    unlockAllUnitsTicketSelect();
    addAdminClientButtons();
    addAdminTicketButtons();
    addAdminMovementButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  setInterval(function(){
    normalizeTicketTypeSelect();
    unlockAllUnitsTicketSelect();
    addAdminClientButtons();
    addAdminTicketButtons();
    addAdminMovementButtons();
  }, 1500);
})();


/* ===== correcoes-09-07-parte2.js ===== */

/* Correcoes finais 09/07: clientes, datas, fotos, edicao preservada e chamados admin. */
(function(){
  'use strict';
  if (window.__correcoes0907Parte2) return;
  window.__correcoes0907Parte2 = true;

  function norm(v){ return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function user(){ try { return Store.getLoggedUser ? Store.getLoggedUser() : null; } catch(_) { return null; } }
  function isAdmin(u){
    u = u || user();
    var p = norm(u && u.profile);
    var perms = Array.isArray(u && u.permissions) ? u.permissions.map(norm) : [];
    return String(u && u.unitId || '').toLowerCase() === 'all' || p.includes('admin') || p.includes('administrador') || perms.some(function(x){ return x.includes('admin') || x.includes('administrador'); });
  }
  function isSupervisor(u){ return norm(u && u.profile).includes('supervisor'); }
  function isSeller(u){ return norm(u && u.profile).includes('vendedor'); }
  function val(id, fallback){
    var el = document.getElementById(id);
    return el ? el.value : (fallback == null ? '' : fallback);
  }
  function setVal(id, value){
    var el = document.getElementById(id);
    if (!el) return;
    el.value = value == null ? '' : value;
    try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_) {}
  }
  function unitName(id){ try { return UI.getUnitName ? UI.getUnitName(id) : id; } catch(_) { return id || '-'; } }
  function sellerName(c){
    var id = c && (c.userId || c.user_id || c.vendedor_id || c.seller_id);
    try { if (id && UI.getUserName) return UI.getUserName(id); } catch(_) {}
    return (c && (c.sellerName || c.vendedor_nome || c.vendedor || c.userName)) || '-';
  }
  function clientOwnerId(c){ return c && (c.userId || c.user_id || c.vendedor_id || c.seller_id); }
  function clientDate(c){
    if (!c) return 'Nao informado';
    var raw = c.data_cadastro || c.date || c.createdAt || c.created_at || c.created || c.created_date;
    if (!raw) return 'Nao informado';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(String(raw))) return String(raw);
    try {
      var d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString('pt-BR');
    } catch(_) {}
    return String(raw);
  }
  function scoreText(c){
    var n = c && c.score != null ? c.score : '-';
    var cls = c && c.classification ? c.classification : '';
    return String(n) + (cls ? ' ' + cls : '');
  }
  function statusClass(status){
    var s = norm(status);
    if (s.includes('aprov')) return 'badge-success';
    if (s.includes('reprov')) return 'badge-danger';
    if (s.includes('correc')) return 'badge-warning';
    return 'badge-warning';
  }
  function canSeeClient(c, u){
    u = u || user();
    if (!u) return true;
    if (isAdmin(u)) return true;
    if (isSupervisor(u)) {
      if (String(u.unitId || '') === 'all') return true;
      return !c.unitId || String(c.unitId) === String(u.unitId);
    }
    if (isSeller(u)) {
      var owner = clientOwnerId(c);
      return String(owner || '') === String(u.id || '') || norm(sellerName(c)) === norm(u.name);
    }
    return true;
  }
  function filterClients(list){
    var raw = Array.isArray(list) ? list.slice() : [];
    var u = user();
    raw = raw.filter(function(c){ return canSeeClient(c, u); });
    try {
      if (window.FiltersManager && FiltersManager.configs && FiltersManager.configs.clientes) {
        FiltersManager.caches.clientes = raw;
        FiltersManager.ensureFilterPanel('clientes');
        raw = FiltersManager.filterData(raw, FiltersManager.getFilterValues('clientes'), 'clientes');
      }
    } catch(e) { console.warn('Falha ao filtrar clientes', e); }
    return raw.sort(function(a,b){
      var da = new Date(a.createdAt || a.created_at || a.date || 0).getTime() || 0;
      var db = new Date(b.createdAt || b.created_at || b.date || 0).getTime() || 0;
      return db - da;
    });
  }

  function patchStoreDates(){
    if (!window.Store || Store.__ccDatesPatched) return;
    Store.__ccDatesPatched = true;
    var old = Store.saveClients ? Store.saveClients.bind(Store) : null;
    if (!old) return;
    Store.saveClients = function(list){
      var nowIso = new Date().toISOString();
      var nowPt = new Date().toLocaleDateString('pt-BR');
      var normalized = (Array.isArray(list) ? list : []).map(function(c){
        if (!c || typeof c !== 'object') return c;
        if (!c.createdAt && !c.created_at) c.createdAt = nowIso;
        if (!c.created_at && c.createdAt) c.created_at = c.createdAt;
        if (!c.date && !c.data_cadastro) c.date = nowPt;
        if (!c.data_cadastro && c.date) c.data_cadastro = c.date;
        if (!c.user_id && c.userId) c.user_id = c.userId;
        if (!c.vendedor_id && c.userId) c.vendedor_id = c.userId;
        return c;
      });
      return old(normalized);
    };
  }

  function renderClients(list){
    var body = document.getElementById('clients-table-body');
    if (!body) return;
    var data = filterClients(Array.isArray(list) ? list : (Store.getClients ? Store.getClients() : []));
    var pageSize = 5;
    var totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    window.__ccClientsPage = Math.min(Math.max(1, window.__ccClientsPage || 1), totalPages);
    var start = (window.__ccClientsPage - 1) * pageSize;
    var page = data.slice(start, start + pageSize);
    if (!page.length) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:18px;">Nenhum cliente cadastrado.</td></tr>';
      renderClientPager(data.length, 0, 0, totalPages);
      return;
    }
    body.innerHTML = page.map(function(c){
      var id = esc(c.id || '');
      var current = user();
      var approved = norm(c.status).includes('aprov');
      var canEdit = !approved && (isAdmin(current) || String(clientOwnerId(c) || '') === String(current && current.id || '') || norm(sellerName(c)) === norm(current && current.name));
      var editBtn = canEdit ? '<button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:.75rem;margin-top:4px;" onclick="event.stopPropagation(); App.editClientPending(\''+id+'\')">Editar</button>' : '';
      var deleteBtn = isAdmin(current) ? '<button class="btn btn-danger btn-sm" style="padding:2px 8px;font-size:.75rem;margin-top:4px;" onclick="event.stopPropagation(); App.deleteClient && App.deleteClient(\''+id+'\', event)">Apagar</button>' : '';
      var adminBtns = editBtn + deleteBtn;
      return '<tr class="mobile-summary-row" onclick="App.showClientDetails(\''+id+'\')">'
        + '<td data-label="Cliente"><strong>'+esc(c.name || c.nomeFantasia || c.companyName || '-')+'</strong><br><small style="color:var(--text-muted);">'+esc(clientDate(c))+'</small></td>'
        + '<td data-label="CNPJ">'+esc(c.cnpj || '-')+'</td>'
        + '<td data-label="Categoria">'+esc(c.category || '-')+'</td>'
        + '<td data-label="Telefone">'+esc(c.phone || '-')+'</td>'
        + '<td data-label="E-mail">'+esc(c.email || '-')+'</td>'
        + '<td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:.7rem;">'+esc(unitName(c.unitId))+'</span></td>'
        + '<td data-label="Vendedor">'+esc(sellerName(c))+'</td>'
        + '<td data-label="Score">'+esc(scoreText(c))+'</td>'
        + '<td data-label="Status"><span class="badge-status '+statusClass(c.status)+'">'+esc(c.status || 'Pendente')+'</span></td>'
        + '<td data-label="Acoes"><button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:.75rem;" onclick="event.stopPropagation(); App.showClientDetails(\''+id+'\')">Ver Ficha</button>'+adminBtns+'</td>'
        + '</tr>';
    }).join('');
    renderClientPager(data.length, start, Math.min(start + pageSize, data.length), totalPages);
  }

  function renderClientPager(total, start, end, totalPages){
    var body = document.getElementById('clients-table-body');
    if (!body) return;
    var box = body.closest('.table-responsive') || body.closest('table');
    if (!box) return;
    var pager = document.getElementById('cc-clientes-pager-final');
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'cc-clientes-pager-final';
      pager.className = 'cc-list-pager no-print';
      box.insertAdjacentElement('afterend', pager);
    }
    var page = window.__ccClientsPage || 1;
    pager.innerHTML = '<div class="cc-pager-info">'+(total ? 'Mostrando '+(start+1)+'-'+end+' de '+total+' clientes' : 'Nenhum registro para mostrar.')+'</div>'
      + '<div class="cc-pager-actions"><button type="button" class="btn btn-secondary btn-sm" '+(page <= 1 ? 'disabled' : '')+' onclick="window.__ccClientsGo('+(page-1)+')">Anterior</button>'
      + '<span class="cc-pager-page">Pagina '+page+' de '+totalPages+'</span>'
      + '<button type="button" class="btn btn-secondary btn-sm" '+(page >= totalPages ? 'disabled' : '')+' onclick="window.__ccClientsGo('+(page+1)+')">Proxima</button></div>';
  }
  window.__ccClientsGo = function(page){
    window.__ccClientsPage = Math.max(1, Number(page) || 1);
    renderClients(Store.getClients ? Store.getClients() : []);
  };

  function patchClientRender(){
    if (!window.UI || UI.__ccFinalClientRender) return;
    UI.__ccFinalClientRender = true;
    UI.renderClients = function(list){ return renderClients(list); };
  }

  function fillClientForm(c){
    setVal('client-name', c.name || c.nomeFantasia);
    setVal('client-cnpj', c.cnpj);
    setVal('client-phone', c.phone);
    setVal('client-email', c.email);
    setVal('client-unit', c.unitId);
    setVal('client-seller', clientOwnerId(c));
    setVal('client-category', c.category);
    setVal('client-company-name', c.companyName || c.razaoSocial);
    setVal('client-ie', c.ie);
    setVal('client-city', c.city);
    setVal('client-state', c.state || c.uf);
    setVal('client-cep', c.cep);
    setVal('client-street', c.street);
    setVal('client-number', c.number);
    setVal('client-neighborhood', c.neighborhood);
    setVal('client-address-full', c.addressFull);
    setVal('client-location-type', c.locationType);
    setVal('client-pavement-type', c.pavementType);
    setVal('client-delivery-schedule', c.deliverySchedule);
    setVal('client-nearby-amaretto', c.nearbyAmaretto);
    setVal('client-nearby-competitor', c.nearbyCompetitor);
    setVal('client-ice-cream-experience', c.iceCreamExperience);
    setVal('client-dual-brand-preference', c.dualBrandPreference);
    setVal('client-equipment-qty', c.equipmentQty);
    setVal('client-requested-eq-type', c.requestedEqType);
    setVal('client-sendable-eq-type', c.sendableEqType);
    setVal('client-predicted-average', c.predictedAverage);
    setVal('client-first-order-value', c.firstOrderValue);
    setVal('client-first-order-payment', c.firstOrderPayment);
    setVal('client-first-order-reason', c.firstOrderReason);
    setVal('client-repurchase-payment', c.repurchasePayment);
    setVal('client-has-bonus', c.hasBonus);
    setVal('client-bonus-value', c.bonusValue);
    setVal('client-seller-analysis', c.sellerAnalysis);
    setVal('client-route', c.route);
    document.querySelectorAll('input[name="client-products"]').forEach(function(el){
      el.checked = Array.isArray(c.products) && c.products.map(norm).includes(norm(el.value));
    });
  }

  function clientPayloadFromForm(old){
    var products = Array.from(document.querySelectorAll('input[name="client-products"]:checked')).map(function(el){ return el.value; });
    var owner = val('client-seller', clientOwnerId(old));
    var next = Object.assign({}, old, {
      name: val('client-name', old.name),
      cnpj: val('client-cnpj', old.cnpj),
      phone: val('client-phone', old.phone),
      email: val('client-email', old.email),
      unitId: val('client-unit', old.unitId),
      userId: owner,
      user_id: owner,
      vendedor_id: owner,
      seller_id: owner,
      category: val('client-category', old.category),
      companyName: val('client-company-name', old.companyName),
      ie: val('client-ie', old.ie),
      city: val('client-city', old.city),
      state: val('client-state', old.state),
      cep: val('client-cep', old.cep),
      street: val('client-street', old.street),
      number: val('client-number', old.number),
      neighborhood: val('client-neighborhood', old.neighborhood),
      addressFull: val('client-address-full', old.addressFull),
      locationType: val('client-location-type', old.locationType),
      pavementType: val('client-pavement-type', old.pavementType),
      deliverySchedule: val('client-delivery-schedule', old.deliverySchedule),
      nearbyAmaretto: val('client-nearby-amaretto', old.nearbyAmaretto),
      nearbyCompetitor: val('client-nearby-competitor', old.nearbyCompetitor),
      iceCreamExperience: val('client-ice-cream-experience', old.iceCreamExperience),
      dualBrandPreference: val('client-dual-brand-preference', old.dualBrandPreference),
      equipmentQty: val('client-equipment-qty', old.equipmentQty),
      requestedEqType: val('client-requested-eq-type', old.requestedEqType),
      sendableEqType: val('client-sendable-eq-type', old.sendableEqType),
      products: products,
      predictedAverage: window.ccParseBrazilianMoney ? window.ccParseBrazilianMoney(val('client-predicted-average', old.predictedAverage)) : Number(val('client-predicted-average', old.predictedAverage) || 0),
      firstOrderValue: window.ccParseBrazilianMoney ? window.ccParseBrazilianMoney(val('client-first-order-value', old.firstOrderValue)) : Number(val('client-first-order-value', old.firstOrderValue) || 0),
      firstOrderPayment: val('client-first-order-payment', old.firstOrderPayment),
      firstOrderReason: val('client-first-order-reason', old.firstOrderReason),
      repurchasePayment: val('client-repurchase-payment', old.repurchasePayment),
      hasBonus: val('client-has-bonus', old.hasBonus),
      bonusValue: window.ccParseBrazilianMoney ? window.ccParseBrazilianMoney(val('client-bonus-value', old.bonusValue)) : Number(val('client-bonus-value', old.bonusValue) || 0),
      sellerAnalysis: val('client-seller-analysis', old.sellerAnalysis),
      route: val('client-route', old.route),
      data_cadastro: old.data_cadastro || old.date || clientDate(old),
      date: old.date || old.data_cadastro || clientDate(old),
      createdAt: old.createdAt || old.created_at,
      created_at: old.created_at || old.createdAt,
      updatedAt: new Date().toISOString()
    });
    try {
      if (window.Scoring && Scoring.calculate) {
        var score = Scoring.calculate(next);
        next.score = score.score;
        next.classification = score.classification;
      }
    } catch(_) {}
    return next;
  }

  async function uploadChangedClientPhotos(next, old){
    var map = {
      fachada:'photoFachada', interna01:'photoInterna01', interna02:'photoInterna02', interna03:'photoInterna03',
      rua01:'photoRua01', rua02:'photoRua02', cnpj:'photoCnpj'
    };
    for (var suffix in map) {
      var input = document.getElementById('client-photo-' + suffix);
      if (!input || !input.files || !input.files[0]) {
        next[map[suffix]] = window.CCMediaPreserver
          ? CCMediaPreserver.clientValue(old, map[suffix], input)
          : (old[map[suffix]] || '');
        continue;
      }
      var file = input.files[0];
      var base64 = App.compressImageAndGetBase64 ? await App.compressImageAndGetBase64(file) : await Store.fileToBase64(file);
      var cnpj = String(next.cnpj || old.cnpj || '00000000000000').replace(/\D/g,'') || '00000000000000';
      next[map[suffix]] = await App.uploadBase64ToDatabase(base64, 'cliente-' + cnpj + '-' + suffix + '-' + (file.name || 'foto'), 'clientes');
      if (!next[map[suffix]]) throw new Error('Foto ' + suffix + ' nao foi salva.');
      input.dataset.removeExisting = '0';
    }
  }

  function patchClientEdit(){
    if (!window.App || App.__ccFinalClientEdit) return;
    App.__ccFinalClientEdit = true;
    window.__ccFinalClientEditActive = true;
    App.editClientPending = function(id){
      var c = (Store.getClients ? Store.getClients() : []).find(function(x){ return String(x.id) === String(id); });
      if (!c) return alert('Cliente nao encontrado.');
      var current = user();
      var owner = String(clientOwnerId(c) || '') === String(current && current.id || '') || norm(sellerName(c)) === norm(current && current.name);
      if (!isAdmin(current) && !owner) return alert('Somente o autor do cadastro ou o administrador pode editar este cliente.');
      if (norm(c.status).includes('aprov')) return alert('Cadastro aprovado nao pode mais ser editado.');
      var box = document.getElementById('client-form-container');
      if (box) { box.classList.remove('hidden'); box.style.display = ''; }
      var form = document.getElementById('client-form');
      if (form) {
        form.dataset.editingId = c.id;
        form.noValidate = true;
        form.querySelectorAll('input[type="file"]').forEach(function(el){ el.required = false; el.value = ''; });
      }
      fillClientForm(c);
      if (box) box.scrollIntoView({ behavior:'smooth', block:'start' });
    };
    App.editClientAdmin = App.editClientPending;
    document.addEventListener('submit', async function(ev){
      var form = ev.target;
      if (!form || form.id !== 'client-form' || !form.dataset.editingId) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      var id = form.dataset.editingId;
      var clients = Store.getClients ? Store.getClients() : [];
      var idx = clients.findIndex(function(c){ return String(c.id) === String(id); });
      if (idx < 0) return alert('Cliente nao encontrado.');
      var old = clients[idx];
      var current = user();
      var owner = String(clientOwnerId(old) || '') === String(current && current.id || '') || norm(sellerName(old)) === norm(current && current.name);
      if (!isAdmin(current) && !owner) return alert('Somente o autor do cadastro ou o administrador pode editar este cliente.');
      if (norm(old.status).includes('aprov')) return alert('Cadastro aprovado nao pode mais ser editado.');
      var next = clientPayloadFromForm(old);
      try {
        await uploadChangedClientPhotos(next, old);
        clients[idx] = next;
        Store.saveClients(clients);
        try { await App.fetchFromApi('/api/store/clients', { method:'POST', body: JSON.stringify({ data: clients }) }); } catch(_) {}
        delete form.dataset.editingId;
        form.reset();
        form.querySelectorAll('[data-cnpj-api-locked="1"]').forEach(function(el){ el.readOnly = false; el.removeAttribute('data-cnpj-api-locked'); el.style.backgroundColor=''; el.title=''; });
        var box = document.getElementById('client-form-container');
        if (box) box.classList.add('hidden');
        if (App.refreshAllLists) App.refreshAllLists();
        renderClients(Store.getClients ? Store.getClients() : []);
        if (App.showToast) App.showToast('Cliente editado com sucesso.');
      } catch(err) {
        alert('Erro ao editar cliente: ' + (err.message || err));
      }
    }, true);
  }

  function patchFichaAndPdf(){
    if (!window.UI || !window.App || App.__ccFinalFichaPdf) return;
    App.__ccFinalFichaPdf = true;
    var oldShow = UI.showClientDetails ? UI.showClientDetails.bind(UI) : null;
    if (oldShow) {
      UI.showClientDetails = function(client){
        App.currentClientFicha = client;
        oldShow(client);
        setTimeout(function(){
          var content = document.getElementById('client-details-content');
          if (!content || content.querySelector('[data-cadastro-final]')) return;
          var firstBox = content.firstElementChild;
          if (!firstBox) return;
          firstBox.insertAdjacentHTML('beforeend', '<div data-cadastro-final style="min-width:180px;"><span style="font-size:.72rem;text-transform:uppercase;color:var(--text-muted);font-weight:bold;display:block;">Data de Cadastro</span><strong>'+esc(clientDate(client))+'</strong></div>');
        }, 60);
      };
    }
    App.generateClientPdfFromCurrent = function(){
      var client = App.currentClientFicha;
      if (!client) return alert('Abra uma ficha antes de gerar o PDF.');
      var money = function(v){ return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(v || 0)); };
      var photo = function(url, label){
        var finalUrl = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
        if (!finalUrl) return '<div class="photo"><b>'+esc(label)+'</b><div class="empty">Imagem nao enviada</div></div>';
        return '<div class="photo"><b>'+esc(label)+'</b><img src="'+esc(finalUrl)+'"></div>';
      };
      var html = '<!doctype html><html><head><title>Ficha Comercial '+esc(client.id)+'</title><style>'
        + 'body{font-family:Arial,sans-serif;background:#fff;color:#111;margin:24px;font-size:12px}h1{color:#2563eb;font-size:20px;margin:0 0 8px}h3{color:#2563eb;font-size:14px;border-bottom:1px solid #bbb;padding-bottom:5px}.header{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border:1px solid #bbb;border-radius:8px;padding:10px;margin-bottom:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{border:1px solid #bbb;border-radius:8px;padding:10px;margin-bottom:12px}p{margin:5px 0}.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.photo{border:1px solid #bbb;border-radius:8px;padding:8px;text-align:center;break-inside:avoid}.photo img{max-width:100%;height:120px;object-fit:cover}.empty{height:80px;display:flex;align-items:center;justify-content:center;color:#777;border:1px dashed #bbb;margin-top:8px}.footer{margin-top:18px;font-size:10px;color:#555;border-top:1px solid #bbb;padding-top:8px}@media print{button{display:none}.grid{grid-template-columns:1fr 1fr}}'
        + '</style></head><body><h1>Ficha Comercial Completa do Cliente</h1><div class="header"><div><b>ID:</b> '+esc(client.id)+'</div><div><b>Status:</b> '+esc(client.status)+'</div><div><b>Data de Cadastro:</b> '+esc(clientDate(client))+'</div></div>'
        + '<div class="grid"><div class="box"><h3>1. Identificacao Comercial</h3><p><b>Nome Fantasia:</b> '+esc(client.name)+'</p><p><b>Razao Social:</b> '+esc(client.companyName)+'</p><p><b>CNPJ:</b> '+esc(client.cnpj)+'</p><p><b>Inscricao Estadual:</b> '+esc(client.ie)+'</p><p><b>Categoria:</b> '+esc(client.category)+'</p><p><b>Telefone:</b> '+esc(client.phone)+'</p><p><b>E-mail:</b> '+esc(client.email)+'</p><p><b>Vendedor:</b> '+esc(sellerName(client))+'</p><p><b>Unidade:</b> '+esc(unitName(client.unitId))+'</p><p><b>Score:</b> '+esc(scoreText(client))+'</p></div>'
        + '<div class="box"><h3>2. Logistica e Localizacao</h3><p><b>Cidade:</b> '+esc(client.city)+'</p><p><b>UF:</b> '+esc(client.state || client.uf)+'</p><p><b>CEP:</b> '+esc(client.cep)+'</p><p><b>Endereco:</b> '+esc(client.addressFull || [client.street, client.number, client.neighborhood].filter(Boolean).join(", "))+'</p><p><b>Localizacao:</b> '+esc(client.locationType)+'</p><p><b>Pavimentacao:</b> '+esc(client.pavementType)+'</p><p><b>Horario:</b> '+esc(client.deliverySchedule)+'</p><p><b>Primeiro Pedido:</b> '+esc(client.firstOrderPayment)+'</p><p><b>Motivo:</b> '+esc(client.firstOrderReason)+'</p><p><b>Forma de Recompra:</b> '+esc(client.repurchasePayment)+'</p></div>'
        + '<div class="box"><h3>3. Mapeamento de Mercado</h3><p><b>Amaretto Proximo:</b> '+esc(client.nearbyAmaretto)+'</p><p><b>Concorrencia Proxima:</b> '+esc(client.nearbyCompetitor)+'</p><p><b>Ja trabalha com sorvetes:</b> '+esc(client.iceCreamExperience)+'</p><p><b>Duas marcas:</b> '+esc(client.dualBrandPreference)+'</p></div>'
        + '<div class="box"><h3>4. Equipamentos & Financeiro</h3><p><b>Qtd Equipamentos:</b> '+esc(client.equipmentQty)+'</p><p><b>Equipamento Solicitado:</b> '+esc(client.requestedEqType)+'</p><p><b>Padrao envio:</b> '+esc(client.sendableEqType)+'</p><p><b>Produtos:</b> '+esc(Array.isArray(client.products) ? client.products.join(", ") : client.products)+'</p><p><b>Valor 1a Compra:</b> '+money(client.firstOrderValue)+'</p><p><b>Media Prevista:</b> '+money(client.predictedAverage)+'</p><p><b>Bonificacao:</b> '+esc(client.hasBonus)+' '+(client.bonusValue ? '('+money(client.bonusValue)+')' : '')+'</p></div></div>'
        + '<div class="box"><h3>5. Analise do Vendedor</h3><p>'+esc(client.sellerAnalysis)+'</p><p><b>Roteiro:</b> '+esc(client.route)+'</p></div>'
        + '<div class="box"><h3>6. Fotos do Cadastro</h3><div class="photos">'+photo(client.photoFachada,'Fachada')+photo(client.photoInterna01,'Interna 01')+photo(client.photoInterna02,'Interna 02')+photo(client.photoInterna03,'Interna 03')+photo(client.photoRua01,'Externa Rua 01')+photo(client.photoRua02,'Externa Rua 02')+photo(client.photoCnpj,'Foto CNPJ')+'</div></div>'
        + '<div class="footer">Gerado em '+new Date().toLocaleString('pt-BR')+' por '+esc((user()||{}).name || '-')+' - Controle de Campo</div></body></html>';
      App.showPdfPreviewModal(html, 'Ficha Comercial ' + esc(client.id));
    };
  }

  function patchLoadTickets(){
    if (!window.App || App.__ccFinalLoadTickets) return;
    App.__ccFinalLoadTickets = true;
    App.loadTickets = async function(){
      try {
        var u = user();
        // A unidade escolhida no topo deve ser respeitada por todos os perfis,
        // inclusive administrador, mecânico e responsável por equipamentos.
        var activeUnit = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
        var query = activeUnit && activeUnit !== 'all' ? '?unitId=' + encodeURIComponent(activeUnit) : '';
        var tickets = await App.fetchFromApi('/api/chamados' + query);
        Store.saveTickets(Array.isArray(tickets) ? tickets : []);
        UI.renderTickets(Array.isArray(tickets) ? tickets : []);
        return tickets;
      } catch(err) {
        console.error('Erro ao carregar chamados do backend:', err);
        UI.renderTickets(Store.getTickets ? Store.getTickets() : []);
        return Store.getTickets ? Store.getTickets() : [];
      }
    };
  }

  function start(){
    patchStoreDates();
    patchClientRender();
    patchClientEdit();
    patchFichaAndPdf();
    patchLoadTickets();
    setTimeout(function(){
      if (location.hash.includes('clientes') && Store.getClients) renderClients(Store.getClients());
      if (location.hash.includes('chamados') && App.loadTickets) App.loadTickets();
    }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  window.addEventListener('hashchange', function(){ setTimeout(start, 150); });
})();
