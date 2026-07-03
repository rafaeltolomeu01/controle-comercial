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
    return num(cfg['daily_'+key] ?? cfg[key] ?? unit['daily_'+key] ?? (key==='gerente' ? 180 : key==='supervisor' ? 150 : 120));
  }
  function maxNights(unit){
    const cfg = (unit||{}).travelConfig || (unit||{}).financeConfig || {};
    const v = parseInt(cfg.maxNights ?? (unit||{}).maxNights ?? 4, 10);
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

  // 09/10 - Configuração de hospedagem por unidade e perfil.
  function ensureUnitFinanceFields(){
    const form = document.getElementById('unit-form');
    if (!form || document.getElementById('unit-daily-vendedor')) return;
    const block = document.createElement('div');
    block.id = 'unit-travel-config-block';
    block.className = 'card';
    block.style.cssText = 'margin-top:16px; padding:16px; background:rgba(255,255,255,0.02);';
    block.innerHTML = `
      <h4 style="margin:0 0 12px;color:var(--primary-color);">Configurações Financeiras - Hospedagem</h4>
      <div class="form-row">
        <div class="form-group"><label>Diária Vendedor (R$)</label><input type="number" id="unit-daily-vendedor" step="0.01" min="0" value="120"></div>
        <div class="form-group"><label>Diária Supervisor (R$)</label><input type="number" id="unit-daily-supervisor" step="0.01" min="0" value="150"></div>
        <div class="form-group"><label>Diária Gerente (R$)</label><input type="number" id="unit-daily-gerente" step="0.01" min="0" value="180"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Máximo de Diárias</label><input type="number" id="unit-max-nights" min="1" step="1" value="4"></div>
        <div class="form-group"><label>Permitir Sem Hospedagem</label><select id="unit-allow-no-hotel"><option value="true">Sim</option><option value="false">Não</option></select></div>
      </div>`;
    form.appendChild(block);
  }
  window.CC_ensureUnitFinanceFields = ensureUnitFinanceFields;

  // Override renderUnits para garantir bloco financeiro e botão editar.
  if (window.UI && UI.renderUnits) {
    const originalRenderUnits = UI.renderUnits.bind(UI);
    UI.renderUnits = function(){
      originalRenderUnits();
      ensureUnitFinanceFields();
    };
  }

  // Enriquecer salvamento/edição de unidade sem mexer no restante.
  setTimeout(() => {
    ensureUnitFinanceFields();
    const unitForm = document.getElementById('unit-form');
    if (unitForm && !unitForm.dataset.ccFinanceBound) {
      unitForm.dataset.ccFinanceBound = '1';
      unitForm.addEventListener('submit', () => {
        const editingId0 = unitForm.dataset.editingId || '';
        const name0 = document.getElementById('unit-name')?.value || '';
        const cfg0 = {
          daily_vendedor: num(document.getElementById('unit-daily-vendedor')?.value || 120),
          daily_supervisor: num(document.getElementById('unit-daily-supervisor')?.value || 150),
          daily_gerente: num(document.getElementById('unit-daily-gerente')?.value || 180),
          maxNights: parseInt(document.getElementById('unit-max-nights')?.value || 4,10),
          allowNoHotel: String(document.getElementById('unit-allow-no-hotel')?.value || 'true') === 'true'
        };
        setTimeout(() => {
          const units = Store.getUnits ? Store.getUnits() : [];
          const unit = units.find(u => String(u.id) === String(editingId0)) || [...units].reverse().find(u => u.name === name0) || units[units.length-1];
          if (unit) { unit.travelConfig = cfg0; Store.saveUnits(units); }
        }, 80);
      }, true);
    }
  }, 800);

  if (window.App) {
    const oldEditUnit = App.editUnit ? App.editUnit.bind(App) : null;
    if (oldEditUnit) App.editUnit = function(unitId){
      oldEditUnit(unitId);
      ensureUnitFinanceFields();
      const unit = (Store.getUnits() || []).find(u => String(u.id) === String(unitId));
      const cfg = (unit && (unit.travelConfig || unit.financeConfig)) || {};
      const set = (id,val) => { const el=document.getElementById(id); if(el) el.value = val; };
      set('unit-daily-vendedor', cfg.daily_vendedor ?? cfg.vendedor ?? unit?.daily_vendedor ?? 120);
      set('unit-daily-supervisor', cfg.daily_supervisor ?? cfg.supervisor ?? unit?.daily_supervisor ?? 150);
      set('unit-daily-gerente', cfg.daily_gerente ?? cfg.gerente ?? unit?.daily_gerente ?? 180);
      set('unit-max-nights', cfg.maxNights ?? unit?.maxNights ?? 4);
      set('unit-allow-no-hotel', String(cfg.allowNoHotel ?? unit?.allowNoHotel ?? true));
    };

    // 08/09/10 - Solicitação de saldo usa empresa oficial e diária por unidade/perfil.
    App.buildHotelOptions = function(){
      const unit = getCurrentUnit();
      const user = Store.getLoggedUser ? Store.getLoggedUser() : {};
      const rate = getDailyRate(unit, user.profile);
      const max = maxNights(unit);
      const container = document.querySelector('input[name="sol-noites"]')?.closest('div[style*="grid-template-columns"]');
      if (!container) return;
      const allowNo = ((unit.travelConfig||{}).allowNoHotel ?? true) !== false;
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
      App.buildHotelOptions();
      const user = Store.getLoggedUser() || {};
      const sol = document.getElementById('sol-solicitante'); if (sol) sol.value = user.name || '';
      App.updateSolicitacaoTotal();
    };
    App.updateSolicitacaoTotal = function(){
      let noites = 0;
      document.getElementsByName('sol-noites').forEach(r => { if (r.checked) noites = parseInt(r.value)||0; });
      const hotel = getDailyRate(getCurrentUnit(), (Store.getLoggedUser()||{}).profile) * noites;
      const disp = document.getElementById('sol-hotel-alim-display'); if (disp) disp.textContent = money(hotel);
      let extras = 0; document.querySelectorAll('.extra-val').forEach(i => extras += num(i.value));
      const total = hotel + num(document.getElementById('sol-abastecimento')?.value) + extras;
      const totalEl = document.getElementById('sol-total-geral'); if (totalEl) totalEl.textContent = money(total);
    };
    const oldSubmitSol = App.submitSolicitacaoDespesas ? App.submitSolicitacaoDespesas.bind(App) : null;
    if (oldSubmitSol) App.submitSolicitacaoDespesas = async function(){
      // substitui radios fixos antes da função original calcular
      const unit = getCurrentUnit();
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
    const tbody = document.getElementById(tbodyId); if (!tbody || tbody.dataset.bulkReady) return;
    const table = tbody.closest('table'); if (!table) return;
    tbody.dataset.bulkReady = '1';
    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('.cc-bulk-all')) headRow.insertAdjacentHTML('afterbegin','<th style="width:34px;"><input type="checkbox" class="cc-bulk-all"></th>');
    [...tbody.querySelectorAll('tr')].forEach(tr => {
      if (tr.querySelector('.cc-bulk-row')) return;
      const onclick = tr.getAttribute('onclick') || '';
      const m = onclick.match(/['"]([^'"]+)['"]\)/);
      const id = tr.dataset.id || (m && m[1]) || (tr.children[0] && tr.children[0].textContent.replace('#','').trim());
      tr.insertAdjacentHTML('afterbegin', `<td onclick="event.stopPropagation()"><input type="checkbox" class="cc-bulk-row" value="${id||''}"></td>`);
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
    table.querySelector('.cc-bulk-all')?.addEventListener('change', e => { tbody.querySelectorAll('.cc-bulk-row').forEach(c => c.checked = e.target.checked); update(); });
    tbody.addEventListener('change', update);
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
