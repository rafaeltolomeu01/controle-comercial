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
    if (profile === 'administrador' || hasPerm('Administrador') || hasPerm('Administrador (Acesso Total)')) return true;
    if (profile.includes('responsavel equipamentos') || profile.includes('patrimonio')) return true;
    return hasPerm('Confirmação de Movimentação') || hasPerm('Confirmação de Troca') || hasPerm('Avaliação de Movimentação') || hasPerm('Equipamentos');
  }

  function setVal(id, val){ const el = document.getElementById(id); if (el) el.value = val ?? ''; }
  function showPreview(kind, url){
    if (!url) return;
    const p = document.getElementById(kind === 'odo' ? 'preview-odometro' : 'preview-comprovante');
    const img = document.getElementById(kind === 'odo' ? 'img-preview-odometro' : 'img-preview-comprovante');
    if (p) p.style.display = 'block';
    if (img) img.src = (window.TempPhotosCache && window.TempPhotosCache[url]) || url;
  }
  function updateExpenseConditionalFields(){
    const finalidade = document.getElementById('exp-finalidade')?.value || '';
    const groupOutro = document.getElementById('group-exp-descreva');
    const groupAbast = document.getElementById('group-exp-abastecimento');
    if (groupOutro) groupOutro.style.display = finalidade === 'Outro' ? 'block' : 'none';
    if (groupAbast) groupAbast.style.display = finalidade === 'Abastecimento' ? 'block' : 'none';
    const desc = document.getElementById('exp-descreva');
    if (desc) desc.required = finalidade === 'Outro';
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
        if (String(current.status || '') !== 'Correção Solicitada') return alert('Esta despesa não está aguardando correção.');
        if (String(current.userId) !== String(currentUser().id) && !hasPerm('Administrador')) return alert('Você só pode corrigir despesas lançadas por você.');
        window.location.hash = '#despesas';
        setTimeout(() => {
          const form = document.getElementById('expense-form');
          const container = document.getElementById('expense-form-container');
          if (!form || !container) return alert('Formulário de despesa não carregou. Tente novamente.');
          window.__expenseCorrectionOriginal = current;
          form.dataset.correctionId = current.id;
          container.classList.remove('hidden');
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
        if (panel && !canConfirmMovement()) {
          panel.style.display = 'none';
          panel.dataset.targetId = '';
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
        if (String(exp.status || '') === 'Correção Solicitada' && String(exp.userId) === String(user.id)) {
          if (!cell.querySelector('.cc-btn-corrigir-despesa')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-warning btn-sm cc-btn-corrigir-despesa';
            btn.textContent = 'Corrigir Despesa';
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
