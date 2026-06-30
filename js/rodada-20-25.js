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
  function getExpenseValue(e){ return num(e.value ?? e.valor ?? e.total ?? e.totalGeral ?? e.total_geral); }

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
    const approvedExpense = expenses.filter(e => statusText(e.status) === 'aprovado').reduce((s,e)=>s+getExpenseValue(e),0);
    const remaining = approvedBalance - approvedExpense;
    const set = (id,val) => { const el=document.getElementById(id); if(el) el.textContent = val; };
    set('metric-balance-available', money(approvedBalance));
    set('metric-balance-used', money(approvedExpense));
    set('metric-balance-remaining', money(remaining));
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
    ctx.expenses.filter(e=>statusText(e.status)==='aprovado').forEach(e=>{ const id=e.unitId??e.empresa_id??'Sem unidade'; units[id].desp += getExpenseValue(e); });
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
      const imgs = [ ['Comprovante', exp.foto_comprovante], ['Odômetro/KM', exp.foto_odometro] ].filter(x=>x[1]).map(([l,src])=>`<div><strong>${l}</strong><br><img src="${escapeHtml(src)}" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid var(--border-color); margin-top:6px; cursor:pointer;" onclick="App.showFacadeImage && App.showFacadeImage('${String(src).replace(/'/g,"\\'")}')"></div>`).join('') || '<p style="color:var(--text-muted);">Sem fotos anexadas.</p>';
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
  App.onRouteChanged = function(hash){ if (hash !== '#despesas') sessionStorage.removeItem('cc_expense_approval_mode'); const r = oldRoute(hash); setTimeout(()=>{ ensureTabs(); UI.updateBalanceCards?.(); },120); return r; };

  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{ensureTabs(); UI.updateBalanceCards?.();},800));
  // MutationObserver de abas desativado para evitar pisca-pisca/duplicidade.
})();
