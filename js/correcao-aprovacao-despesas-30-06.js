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
