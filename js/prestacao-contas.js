(function () {
  'use strict';

  const state = { preview: null, recipients: [], sellerLocked: false, canClose: false, openExpenseId: null, receiptObjectUrl: null };
  const byId = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
  const brl = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dateBr = value => {
    const raw = String(value || '').slice(0, 10);
    const parts = raw.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw || '-';
  };
  const moneyInput = value => Number(value || 0).toFixed(2).replace('.', ',');
  const parseMoney = value => Number(String(value || '').replace(/\./g, '').replace(',', '.')) || 0;

  function message(text, error) {
    const el = byId('accountability-message');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!error);
  }

  function closeExpenseDetail() {
    const detail = byId('accountability-expense-detail');
    if (state.receiptObjectUrl) {
      URL.revokeObjectURL(state.receiptObjectUrl);
      state.receiptObjectUrl = null;
    }
    state.openExpenseId = null;
    if (!detail) return;
    detail.hidden = true;
    detail.innerHTML = '';
  }

  function resetPreviewForFilterChange() {
    closeExpenseDetail();
    state.preview = null;
    const result = byId('accountability-result');
    if (result) result.hidden = true;
    const pdf = byId('accountability-pdf');
    if (pdf) pdf.disabled = true;
    const closePanel = byId('accountability-close-panel');
    if (closePanel) closePanel.hidden = true;
  }

  function populateUnits() {
    const select = byId('accountability-unit');
    if (!select) return;
    const globalValue = byId('global-unit-selector')?.value || '';
    const current = Store.getLoggedUser ? (Store.getLoggedUser() || {}) : {};
    const linkedIds = [...new Set([...(Array.isArray(current.unitIds) ? current.unitIds : []), current.unitId].filter(Boolean).map(String))];
    const role = String(current.profile || '').toLowerCase();
    const allowAll = current.allowAllUnits === true || role.includes('admin') || role.includes('financeiro') || linkedIds.includes('all');
    const units = (Store.getUnits ? Store.getUnits() : []).filter(unit => unit && unit.id && unit.id !== 'all' && (allowAll || linkedIds.includes(String(unit.id))));
    select.innerHTML = '<option value="">Selecione a unidade</option>' + units.map(unit => `<option value="${esc(unit.id)}">${esc(unit.name || unit.nome || unit.id)}</option>`).join('');
    if (globalValue && globalValue !== 'all' && units.some(unit => String(unit.id) === String(globalValue))) select.value = globalValue;
  }

  async function loadRecipients() {
    const unit = byId('accountability-unit')?.value || '';
    const data = await Store.backendRequest(`/api/prestacoes-contas/recipients?unit_id=${encodeURIComponent(unit)}`);
    state.recipients = data.recipients || [];
    state.sellerLocked = !!data.seller_locked;
    state.canClose = !!data.can_close;
    const select = byId('accountability-user');
    const previous = select.value;
    select.innerHTML = '<option value="">Selecione o usuário</option>' + state.recipients.map(user => `<option value="${esc(user.id)}">${esc(user.name)} — ${esc(user.profile || 'Usuário')}</option>`).join('');
    const fixedId = state.sellerLocked ? String(data.current_user_id || '') : '';
    const target = fixedId || (state.recipients.some(user => String(user.id) === String(previous)) ? previous : '');
    if (target) select.value = target;
    select.disabled = state.sellerLocked;
    byId('accountability-user-hint').textContent = state.sellerLocked ? 'Seu relatório é fixo e não permite consultar outros usuários.' : '';
  }

  function renderPreview(preview) {
    closeExpenseDetail();
    state.preview = preview;
    byId('accountability-result').hidden = false;
    byId('accountability-pdf').disabled = false;
    byId('accountability-balance').textContent = brl(preview.calculated_balance);
    byId('accountability-approved').textContent = brl(preview.approved_expenses_total);
    byId('accountability-requisition').textContent = brl(preview.requisition_expenses_total);
    const diff = Number(preview.considered_balance ?? preview.calculated_balance) - Number(preview.approved_expenses_total || 0);
    byId('accountability-difference').textContent = brl(diff);
    byId('accountability-pending').textContent = String(preview.unapproved_expenses_count || 0);

    const warning = byId('accountability-warning');
    warning.hidden = !(preview.unapproved_expenses_count > 0);
    warning.textContent = preview.unapproved_expenses_count > 0
      ? `Atenção: existem ${preview.unapproved_expenses_count} despesa(s) não aprovada(s), no total de ${brl(preview.unapproved_expenses_total)}. Elas aparecem no dossiê, mas não entram na soma apurada.`
      : '';

    const events = preview.balance_events || [];
    byId('accountability-balance-events').innerHTML = events.length ? events.map(event => {
      const labels = { solicitacao_saldo: 'Solicitação de saldo', saldo_adicionado: 'Saldo adicionado diretamente', saldo_retirado: 'Saldo retirado diretamente' };
      return `<article class="accountability-event">
        <div><b>${esc(labels[event.type] || 'Movimentação de saldo')}</b><br><small>${dateBr(event.date)} ${esc(event.time || '')} · ${esc(event.status || '')}<br>${esc(event.description || '')}</small></div>
        <strong>${brl(event.approved)}</strong>
      </article>`;
    }).join('') : '<div class="accountability-empty">Nenhuma movimentação de saldo no período.</div>';

    const expenses = preview.approved_expenses || [];
    byId('accountability-expenses').innerHTML = expenses.length ? expenses.map(expense => `<article class="accountability-expense" data-expense-id="${esc(expense.id)}" tabindex="0" role="button">
      <div><b>${esc(expense.code || `DP-${expense.id}`)}</b> <span class="accountability-status">${expense.is_requisition ? 'Requisição — não desconta saldo' : 'Aprovada'}</span><br><small>${dateBr(expense.date)} ${esc(expense.time || '')} · ${esc(expense.purpose || expense.description || 'Despesa')}</small></div>
      <strong>${brl(expense.value)}</strong>
    </article>`).join('') : '<div class="accountability-empty">Nenhuma despesa aprovada no período.</div>';

    byId('accountability-expenses').querySelectorAll('[data-expense-id]').forEach(el => {
      const open = () => showExpense(el.dataset.expenseId);
      el.addEventListener('click', open);
      el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(); });
    });

    const closePanel = byId('accountability-close-panel');
    closePanel.hidden = !(preview.permissions?.can_close || state.canClose);
    byId('accountability-considered').value = moneyInput(preview.considered_balance ?? preview.calculated_balance);
  }

  async function showExpense(id) {
    const preview = state.preview || {};
    const expense = [...(preview.approved_expenses || []), ...(preview.unapproved_expenses || [])].find(item => String(item.id) === String(id));
    if (!expense) return;
    const detail = byId('accountability-expense-detail');
    closeExpenseDetail();
    state.openExpenseId = String(id);
    detail.hidden = false;
    const receipt = expense.receipt ? `<img id="accountability-receipt-preview" alt="Comprovante da despesa ${esc(expense.code)}"><p id="accountability-receipt-status" class="accountability-empty">Carregando comprovante...</p>` : '<p class="accountability-empty">Sem comprovante disponível.</p>';
    detail.innerHTML = `<div class="accountability-history-heading"><h3>Detalhes da despesa ${esc(expense.code)}</h3><button id="accountability-close-expense" class="btn btn-secondary" type="button">Fechar detalhes</button></div>
      <div class="accountability-detail-grid">
        <div><small>Data</small><br><b>${dateBr(expense.date)} ${esc(expense.time || '')}</b></div>
        <div><small>Valor</small><br><b>${brl(expense.value)}</b></div>
        <div><small>Status</small><br><b>${esc(expense.status)}</b></div>
        <div><small>Finalidade</small><br><b>${esc(expense.purpose || '-')}</b></div>
        <div><small>Operação</small><br><b>${esc(expense.operation || '-')}</b></div>
        <div><small>Descrição</small><br><b>${esc(expense.description || '-')}</b></div>
      </div>${expense.is_requisition ? '<p class="accountability-warning">Esta despesa foi paga por requisição e não reduz o saldo aprovado.</p>' : ''}${receipt}`;
    byId('accountability-close-expense')?.addEventListener('click', closeExpenseDetail);
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (expense.receipt) {
      const image = byId('accountability-receipt-preview');
      const status = byId('accountability-receipt-status');
      try {
        const raw = String(expense.receipt);
        if (/^https?:\/\//i.test(raw) && !raw.includes(window.location.host)) {
          image.src = raw;
        } else {
          const base = window.App && App.getApiBaseUrl ? App.getApiBaseUrl() : '';
          const url = /^https?:\/\//i.test(raw) ? raw : `${base}${raw.startsWith('/') ? raw : '/' + raw}`;
          const token = Store.getToken ? Store.getToken() : '';
          const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!response.ok) throw new Error('Comprovante não localizado');
          state.receiptObjectUrl = URL.createObjectURL(await response.blob());
          image.src = state.receiptObjectUrl;
        }
        status.hidden = true;
      } catch (error) {
        image.style.display = 'none';
        status.textContent = 'Comprovante antigo indisponível no armazenamento atual.';
      }
    }
  }

  async function calculate() {
    closeExpenseDetail();
    const query = new URLSearchParams({
      usuario_id: byId('accountability-user').value,
      unit_id: byId('accountability-unit').value,
      periodo_inicio: byId('accountability-start').value,
      periodo_fim: byId('accountability-end').value
    });
    message('Calculando o período...');
    try {
      const preview = await Store.backendRequest(`/api/prestacoes-contas/preview?${query}`);
      renderPreview(preview);
      message('Período calculado. Somente despesas aprovadas entram no resultado.');
    } catch (error) {
      message(error.message, true);
    }
  }

  async function save() {
    if (!state.preview) return;
    const payload = {
      usuario_id: state.preview.recipient.id,
      unit_id: state.preview.unit.id,
      periodo_inicio: state.preview.period_start,
      periodo_fim: state.preview.period_end,
      saldo_considerado: parseMoney(byId('accountability-considered').value),
      motivo_ajuste_saldo: byId('accountability-adjustment-reason').value.trim(),
      observacao: byId('accountability-note').value.trim()
    };
    message('Salvando a apuração com conferência no servidor...');
    try {
      const result = await Store.backendRequest('/api/prestacoes-contas', { method: 'POST', body: JSON.stringify(payload) });
      message(`Apuração #${result.id} salva com sucesso. Os lançamentos originais não foram alterados.`);
      await loadHistory();
    } catch (error) {
      message(error.message, true);
    }
  }

  async function loadHistory() {
    const list = byId('accountability-history-list');
    if (!list) return;
    try {
      const unit = byId('accountability-unit')?.value || '';
      const rows = await Store.backendRequest(`/api/prestacoes-contas?unit_id=${encodeURIComponent(unit)}`);
      list.innerHTML = rows.length ? rows.map(row => `<article class="accountability-history-item" data-accountability-id="${esc(row.id)}" tabindex="0" role="button">
        <div><b>Apuração #${esc(row.id)} · versão ${esc(row.versao || 1)} · ${esc(row.usuario_nome || row.usuario_id)}</b><br><small>${esc(row.unidade_nome || row.unit_id)} · ${dateBr(row.periodo_inicio)} a ${dateBr(row.periodo_fim)} · ${esc(row.status)}</small></div>
        <div><b>${brl(row.diferenca)}</b><br><small>saldo final</small></div>
      </article>`).join('') : '<div class="accountability-empty">Nenhum período apurado para este acesso.</div>';
      list.querySelectorAll('[data-accountability-id]').forEach(item => {
        const open = async () => {
          try {
            const saved = await Store.backendRequest(`/api/prestacoes-contas/${encodeURIComponent(item.dataset.accountabilityId)}`);
            renderPreview(saved.snapshot);
            message(`Apuração #${saved.id} carregada do histórico.`);
            byId('accountability-close-panel').hidden = true;
            byId('accountability-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (error) { message(error.message, true); }
        };
        item.addEventListener('click', open);
        item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(); });
      });
    } catch (error) {
      list.innerHTML = `<div class="accountability-empty">${esc(error.message)}</div>`;
    }
  }

  function generatePdf() {
    const p = state.preview;
    if (!p || !window.jspdf) return message('Não foi possível iniciar o gerador de PDF.', true);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 16;
    const add = (text, options = {}) => {
      const size = options.size || 9;
      doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(String(text), 180);
      if (y + lines.length * (size * .42) > 282) { doc.addPage(); y = 16; }
      doc.text(lines, 15, y);
      y += lines.length * (size * .42) + (options.gap ?? 2);
    };
    add('PRESTAÇÃO DE CONTAS', { size: 16, bold: true, gap: 4 });
    add(`Usuário: ${p.recipient.name} (${p.recipient.profile || 'Usuário'})`, { bold: true });
    add(`Unidade: ${p.unit.name}`);
    add(`Período: ${dateBr(p.period_start)} a ${dateBr(p.period_end)}`);
    add(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { gap: 5 });
    add('RESUMO FINANCEIRO', { size: 12, bold: true });
    const consideredForPdf = !byId('accountability-close-panel')?.hidden && byId('accountability-considered')?.value
      ? parseMoney(byId('accountability-considered').value)
      : Number(p.considered_balance ?? p.calculated_balance);
    add(`Saldo aprovado/considerado: ${brl(consideredForPdf)}`);
    add(`Despesas aprovadas que consomem saldo: ${brl(p.approved_expenses_total)}`);
    add(`Despesas aprovadas por requisição (não descontam saldo): ${brl(p.requisition_expenses_total)}`);
    add(`Total geral de despesas aprovadas: ${brl(p.approved_expenses_all_total ?? (Number(p.approved_expenses_total || 0) + Number(p.requisition_expenses_total || 0)))}`);
    add(`Saldo para o próximo período: ${brl(consideredForPdf - Number(p.approved_expenses_total || 0))}`);
    add(`Despesas não aprovadas (fora da soma): ${p.unapproved_expenses_count || 0} — ${brl(p.unapproved_expenses_total)}`, { gap: 5 });
    add('MOVIMENTAÇÕES DE SALDO', { size: 12, bold: true });
    (p.balance_events || []).forEach(event => add(`${dateBr(event.date)} ${event.time || ''} | ${event.type.replaceAll('_',' ')} | solicitado ${brl(event.requested)} | aprovado ${brl(event.approved)} | ${event.status}. ${event.description || ''}`));
    if (!(p.balance_events || []).length) add('Nenhuma movimentação de saldo no período.');
    y += 3;
    add('DESPESAS APROVADAS CONSIDERADAS', { size: 12, bold: true });
    (p.approved_expenses || []).forEach(expense => add(`${expense.code} | ${dateBr(expense.date)} ${expense.time || ''} | ${expense.purpose || expense.description || 'Despesa'} | ${brl(expense.value)} | ${expense.is_requisition ? 'Requisição (não desconta saldo)' : 'Aprovada'}`));
    if (!(p.approved_expenses || []).length) add('Nenhuma despesa aprovada no período.');
    if ((p.unapproved_expenses || []).length) {
      y += 3; add('PENDÊNCIAS / DESPESAS NÃO CONSIDERADAS', { size: 12, bold: true });
      p.unapproved_expenses.forEach(expense => add(`${expense.code} | ${dateBr(expense.date)} | ${brl(expense.value)} | ${expense.status} — não incluída no resultado.`));
    }
    y += 4; add('Este relatório é textual. As fotos e comprovantes permanecem disponíveis no dossiê eletrônico do sistema.', { size: 8 });
    doc.save(`prestacao-contas-${p.recipient.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${p.period_start}-${p.period_end}.pdf`);
  }

  async function init() {
    const page = byId('accountability-page');
    if (!page || page.dataset.initialized === '1') return;
    page.dataset.initialized = '1';
    populateUnits();
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    byId('accountability-start').value = first.toISOString().slice(0, 10);
    byId('accountability-end').value = today.toISOString().slice(0, 10);
    try { await loadRecipients(); } catch (error) { message(error.message, true); }
    byId('accountability-unit').addEventListener('change', async () => { resetPreviewForFilterChange(); await loadRecipients(); await loadHistory(); });
    byId('accountability-user').addEventListener('change', resetPreviewForFilterChange);
    byId('accountability-start').addEventListener('change', resetPreviewForFilterChange);
    byId('accountability-end').addEventListener('change', resetPreviewForFilterChange);
    byId('accountability-calculate').addEventListener('click', calculate);
    byId('accountability-save').addEventListener('click', save);
    byId('accountability-pdf').addEventListener('click', generatePdf);
    byId('accountability-refresh-history').addEventListener('click', loadHistory);
    await loadHistory();
  }

  window.addEventListener('hashchange', () => {
    if (window.location.hash !== '#prestacao-contas') resetPreviewForFilterChange();
  });

  window.AccountabilityModule = { init, generatePdf, closeExpenseDetail };
})();
