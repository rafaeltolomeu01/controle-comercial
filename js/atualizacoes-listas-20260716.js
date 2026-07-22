/* Atualizacoes 16/07/2026
 * - Edicao segura de despesas pendentes
 * - Visualizador de imagens em tela cheia com zoom
 * - Filtros encadeados e ordenacao nas colunas
 */
(function () {
  'use strict';
  if (window.__ccAtualizacoesListas20260716) return;
  window.__ccAtualizacoesListas20260716 = true;

  const normalize = value => String(value == null ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const api = (path, options = {}) => {
    if (window.App && typeof App.fetchFromApi === 'function') return App.fetchFromApi(path, options);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem('authToken');
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(path, { ...options, headers }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || 'Erro na requisicao.');
      return data;
    });
  };

  function currentUser() {
    try { return window.Store && Store.getLoggedUser ? Store.getLoggedUser() : {}; }
    catch (_) { return {}; }
  }

  function canReviewClientApprovals(user = currentUser()) {
    try {
      if (window.Store && typeof Store.canApproveClients === 'function') return !!Store.canApproveClients(user);
    } catch (_) {}
    const profile = normalize(user?.profile || user?.role || user?.perfil);
    let permissions = [];
    if (Array.isArray(user?.permissions)) permissions = user.permissions.map(normalize);
    else {
      try { permissions = JSON.parse(user?.permissions || '[]').map(normalize); } catch (_) { permissions = []; }
    }
    const joined = [profile, ...permissions].join(' | ');
    if (profile.includes('admin') || profile.includes('administrador')) return true;
    if (profile.includes('responsavel') && profile.includes('equip')) return true;
    return [
      'aprovacao de clientes', 'aprovar clientes', 'liberacao de cadastro de clientes',
      'liberacao cadastro clientes', 'liberacao de clientes', 'movimentacao de equipamentos',
      'movimentacao equipamento', 'liberacao de equipamento', 'liberacao de equipamentos',
      'confirmacao de movimentacao', 'avaliacao de movimentacao'
    ].some(permission => joined.includes(permission));
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.value = value == null ? '' : value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function numericValue(value) {
    if (typeof value === 'number') return value;
    const raw = String(value == null ? '' : value).replace(/[^0-9,.-]/g, '');
    if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number(raw);
  }

  const UNIT_SCOPED_MODULES = new Set([
    'clientes', 'aprovacao', 'prospeccao', 'equipamentos', 'movimentacao',
    'chamados', 'despesas', 'solicitacao-despesas', 'usuarios',
    'simulador-troca', 'exportar-arquivos'
  ]);

  function activeGlobalUnitId() {
    try { return String(Store.getActiveUnitId?.() || 'all'); }
    catch (_) { return 'all'; }
  }

  function activeGlobalUnitName(unitId) {
    const unit = (Store.getUnits?.() || []).find(item => String(item.id) === String(unitId));
    return normalize(unit?.name || '');
  }

  function recordMatchesGlobalUnit(record, moduleKey, unitId) {
    if (!record || !unitId || unitId === 'all' || !UNIT_SCOPED_MODULES.has(moduleKey)) return true;
    const selectedName = activeGlobalUnitName(unitId);
    const directIds = ['unitId', 'unit_id', 'unidadeId', 'unidade_id']
      .map(key => record[key]).filter(value => value !== undefined && value !== null && String(value).trim() !== '');
    if (directIds.length) {
      return directIds.some(value => String(value) === String(unitId)
        || (selectedName && normalize(value) === selectedName)
        || (moduleKey === 'usuarios' && String(value).toLowerCase() === 'all'));
    }
    const recordNames = ['unitName', 'unit_name', 'unidade_nome', 'unidade', 'empresa_nome', 'empresa']
      .map(key => normalize(record[key])).filter(Boolean);
    return Boolean(selectedName && recordNames.includes(selectedName));
  }

  function scopeByGlobalUnit(data, moduleKey) {
    const list = Array.isArray(data) ? data : [];
    const unitId = activeGlobalUnitId();
    if (unitId === 'all' || !UNIT_SCOPED_MODULES.has(moduleKey)) return list.slice();
    return list.filter(record => recordMatchesGlobalUnit(record, moduleKey, unitId));
  }

  function showExistingPreview(kind, source) {
    const preview = document.getElementById(kind === 'receipt' ? 'preview-comprovante' : 'preview-odometro');
    const image = document.getElementById(kind === 'receipt' ? 'img-preview-comprovante' : 'img-preview-odometro');
    const finalSource = (window.TempPhotosCache && window.TempPhotosCache[source]) || source;
    if (!preview || !image) return;
    preview.style.display = finalSource ? 'block' : 'none';
    image.src = finalSource || '';
    image.onclick = finalSource ? () => App.showFacadeImage(finalSource) : null;
  }

  function expenseMedia(record, field, inputId) {
    const input = document.getElementById(inputId);
    if (window.CCMediaPreserver) return CCMediaPreserver.expenseValue(record || {}, field, input);
    return record && record[field] || '';
  }

  async function uploadSelectedFile(inputId, fallback) {
    const input = document.getElementById(inputId);
    const file = input && input.files && input.files[0];
    if (file && window.App && typeof App.uploadFile === 'function') return App.uploadFile(file);
    return fallback || '';
  }

  function updateExpenseConditionalFields() {
    const purpose = document.getElementById('exp-finalidade')?.value || '';
    const otherGroup = document.getElementById('group-exp-descreva');
    const fuelGroup = document.getElementById('group-exp-abastecimento');
    if (otherGroup) otherGroup.style.display = ['Outro', 'Outros'].includes(purpose) ? 'block' : 'none';
    if (fuelGroup) fuelGroup.style.display = purpose === 'Abastecimento' ? 'block' : 'none';
    const description = document.getElementById('exp-descreva');
    const vehicle = document.getElementById('exp-veiculo');
    const km = document.getElementById('exp-km');
    if (description) description.required = ['Outro', 'Outros'].includes(purpose);
    if (vehicle) vehicle.required = purpose === 'Abastecimento';
    if (km) km.required = purpose === 'Abastecimento';
  }

  function finishPendingEdit() {
    const form = document.getElementById('expense-form');
    if (!form) return;
    delete form.dataset.pendingEditId;
    window.__ccPendingExpenseOriginal = null;
    form.reset();
    const receipt = document.getElementById('exp-comprovante-img');
    if (receipt) receipt.required = true;
    ['exp-comprovante-img', 'exp-odometro-img'].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      delete input.dataset.existingSource;
      delete input.dataset.removeExisting;
      input.parentElement?.querySelector(`.cc-existing-media[data-for="${id}"]`)?.remove();
    });
    document.getElementById('preview-comprovante')?.style.setProperty('display', 'none');
    document.getElementById('preview-odometro')?.style.setProperty('display', 'none');
    document.getElementById('expense-form-container')?.classList.add('hidden');
    const title = document.querySelector('#expense-form-card .card-title');
    if (title) title.textContent = 'Registrar Despesas de Viagem';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Registrar Despesa';
  }

  function populatePendingExpenseForm(record) {
    const form = document.getElementById('expense-form');
    const container = document.getElementById('expense-form-container');
    if (!form || !container) {
      alert('O formulario de despesas nao carregou. Tente novamente.');
      return;
    }
    window.__ccPendingExpenseOriginal = record;
    form.dataset.pendingEditId = record.id;
    delete form.dataset.correctionId;
    container.classList.remove('hidden');
    const title = document.querySelector('#expense-form-card .card-title');
    if (title) title.textContent = 'Editar Despesa Pendente';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = 'Salvar Alteracoes';
    try { if (window.UI && typeof UI.populateUnitDropdowns === 'function') UI.populateUnitDropdowns(); } catch (_) {}
    setValue('exp-unit', record.unitId);
    setValue('exp-finalidade', record.finalidade);
    setValue('exp-operacao', record.operacao);
    setValue('exp-descreva', record.descreva);
    setValue('exp-veiculo', record.veiculo);
    setValue('exp-km', record.km);
    setValue('exp-val', Number(record.value || 0).toFixed(2));
    setValue('exp-date', record.date);
    setValue('exp-obs', record.observation || '');
    const receipt = document.getElementById('exp-comprovante-img');
    const odometer = document.getElementById('exp-odometro-img');
    const existingReceipt = expenseMedia(record, 'foto_comprovante', 'exp-comprovante-img');
    const existingOdometer = expenseMedia(record, 'foto_odometro', 'exp-odometro-img');
    record.foto_comprovante = existingReceipt;
    record.foto_odometro = existingOdometer;
    if (receipt) { receipt.value = ''; receipt.required = !existingReceipt; receipt.dataset.removeExisting = '0'; }
    if (odometer) { odometer.value = ''; odometer.required = false; }
    updateExpenseConditionalFields();
    showExistingPreview('receipt', existingReceipt);
    showExistingPreview('odometer', existingOdometer);
    if (window.CCMediaPreserver) CCMediaPreserver.renderExpensePhotos(record);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function installExpenseEditing() {
    if (!window.App) return;
    App.editPendingExpense = async function (id) {
      if (!id) return alert('Nao foi possivel identificar a despesa.');
      try {
        const record = await api(`/api/despesas-reembolsos/${encodeURIComponent(id)}`);
        if (normalize(record.status) !== 'pendente') return alert('Esta despesa nao esta mais pendente e nao pode ser editada.');
        if (String(record.userId) !== String(currentUser().id)) return alert('Voce so pode editar despesas lancadas por voce.');
        if (location.hash !== '#despesas') location.hash = '#despesas';
        setTimeout(() => populatePendingExpenseForm(record), 250);
      } catch (error) {
        alert(`Erro ao abrir a despesa: ${error.message || error.error || error}`);
      }
    };

    document.addEventListener('submit', async event => {
      const form = event.target;
      if (!form || form.id !== 'expense-form' || !form.dataset.pendingEditId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (form.dataset.savingPendingEdit === '1') return;
      form.dataset.savingPendingEdit = '1';
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      const original = window.__ccPendingExpenseOriginal || {};
      try {
        const amount = numericValue(document.getElementById('exp-val')?.value);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.');
        const payload = {
          unitId: document.getElementById('exp-unit')?.value || original.unitId || '',
          finalidade: document.getElementById('exp-finalidade')?.value || '',
          operacao: document.getElementById('exp-operacao')?.value || '',
          descreva: document.getElementById('exp-descreva')?.value || '',
          veiculo: document.getElementById('exp-veiculo')?.value || '',
          km: document.getElementById('exp-km')?.value || null,
          value: amount,
          date: document.getElementById('exp-date')?.value || original.date || '',
          time: original.time || '',
          observation: document.getElementById('exp-obs')?.value || '',
          foto_odometro: await uploadSelectedFile('exp-odometro-img', expenseMedia(original, 'foto_odometro', 'exp-odometro-img')),
          foto_comprovante: await uploadSelectedFile('exp-comprovante-img', expenseMedia(original, 'foto_comprovante', 'exp-comprovante-img'))
        };
        await api(`/api/despesas-reembolsos/${encodeURIComponent(form.dataset.pendingEditId)}`, {
          method: 'PUT', body: JSON.stringify(payload)
        });
        finishPendingEdit();
        if (window.App && typeof App.showToast === 'function') App.showToast('Despesa pendente atualizada.');
        if (window.App && typeof App.loadExpenses === 'function') await App.loadExpenses();
      } catch (error) {
        alert(`Erro ao editar despesa: ${error.message || error.error || error}`);
      } finally {
        form.dataset.savingPendingEdit = '0';
        if (submit) submit.disabled = false;
      }
    }, true);

    document.addEventListener('click', event => {
      if (event.target && event.target.id === 'btn-cancel-expense-form') finishPendingEdit();
    }, true);
  }

  function createImageViewer() {
    let viewer = document.getElementById('cc-image-viewer');
    if (viewer) return viewer;
    viewer = document.createElement('div');
    viewer.id = 'cc-image-viewer';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Visualizador de imagem');
    viewer.innerHTML = `
      <div class="cc-image-stage">
        <img class="cc-image-original" alt="Imagem ampliada" draggable="false">
        <div class="cc-image-drag-hint">Arraste a foto para ver todas as partes</div>
      </div>
      <div class="cc-image-toolbar" aria-label="Controles da imagem">
        <button type="button" data-action="minus" aria-label="Reduzir zoom">−</button>
        <span class="cc-image-zoom">100%</span>
        <button type="button" data-action="plus" aria-label="Aumentar zoom">+</button>
        <button type="button" data-action="reset">Ajustar</button>
        <button type="button" data-action="fullscreen">Tela cheia</button>
        <button type="button" data-action="close">Fechar</button>
      </div>`;
    document.body.appendChild(viewer);

    const style = document.createElement('style');
    style.id = 'cc-image-viewer-style';
    style.textContent = `
      #cc-image-viewer{display:none;position:fixed;inset:0;z-index:1000000;background:rgba(3,7,18,.97);overflow:hidden;touch-action:none;user-select:none;}
      #cc-image-viewer.is-open{display:block;}
      .cc-image-stage{position:absolute;inset:0 0 72px;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:grab;touch-action:none;}
      .cc-image-stage.is-dragging{cursor:grabbing;}
      .cc-image-original{display:block;max-width:calc(100vw - 24px);max-height:calc(100vh - 96px);width:auto;height:auto;object-fit:contain;transform-origin:center center;will-change:transform;box-shadow:0 12px 40px rgba(0,0,0,.55);pointer-events:none;-webkit-user-drag:none;user-select:none;}
      .cc-image-drag-hint{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:2;padding:7px 12px;border-radius:999px;background:rgba(15,23,42,.86);color:#fff;font-size:.78rem;font-weight:700;pointer-events:none;opacity:0;transition:opacity .18s ease;white-space:nowrap;}
      #cc-image-viewer.is-zoomed .cc-image-drag-hint{opacity:1;}
      .cc-image-toolbar{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px;background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.18);border-radius:12px;max-width:calc(100vw - 16px);}
      .cc-image-toolbar button{min-width:42px;height:42px;padding:0 12px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:#1e293b;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;}
      .cc-image-toolbar button:hover{background:#334155;}
      .cc-image-zoom{min-width:54px;text-align:center;color:#fff;font-size:.82rem;font-weight:700;}
      @media(max-width:600px){.cc-image-stage{bottom:66px}.cc-image-toolbar{width:calc(100vw - 12px);justify-content:center;gap:5px;padding:6px}.cc-image-toolbar button{height:40px;min-width:38px;padding:0 8px;font-size:.75rem}.cc-image-toolbar button[data-action="fullscreen"]{display:none}.cc-image-zoom{min-width:46px;font-size:.75rem}}
    `;
    document.head.appendChild(style);
    return viewer;
  }

  function installImageViewer() {
    if (!window.App) return;
    const viewer = createImageViewer();
    const stage = viewer.querySelector('.cc-image-stage');
    const image = viewer.querySelector('.cc-image-original');
    const zoomLabel = viewer.querySelector('.cc-image-zoom');
    const pointers = new Map();
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragStart = null;
    let pinchStart = null;

    const render = () => {
      image.style.transform = `translate3d(${offsetX}px,${offsetY}px,0) scale(${scale})`;
      viewer.classList.toggle('is-zoomed', scale > 1);
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    };
    const reset = () => { scale = 1; offsetX = 0; offsetY = 0; render(); };
    const setScale = next => { scale = Math.max(0.5, Math.min(8, next)); if (scale <= 1) { offsetX = 0; offsetY = 0; } render(); };
    const close = () => {
      if (document.fullscreenElement === viewer) document.exitFullscreen?.();
      viewer.classList.remove('is-open');
      image.removeAttribute('src');
      document.body.style.overflow = viewer.dataset.previousOverflow || '';
      pointers.clear();
      reset();
    };

    App.showFacadeImage = function (source) {
      if (!source) return;
      viewer.dataset.previousOverflow = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
      reset();
      image.src = (window.TempPhotosCache && window.TempPhotosCache[source]) || source;
      viewer.classList.add('is-open');
      viewer.querySelector('[data-action="close"]')?.focus();
    };

    viewer.addEventListener('click', event => {
      const action = event.target.closest('button')?.dataset.action;
      if (action === 'plus') setScale(scale * 1.25);
      if (action === 'minus') setScale(scale / 1.25);
      if (action === 'reset') reset();
      if (action === 'close') close();
      if (action === 'fullscreen') {
        if (!document.fullscreenElement) viewer.requestFullscreen?.();
        else document.exitFullscreen?.();
      }
    });
    viewer.addEventListener('wheel', event => {
      event.preventDefault();
      setScale(scale * (event.deltaY < 0 ? 1.15 : 0.87));
    }, { passive: false });
    image.addEventListener('dblclick', event => { event.preventDefault(); setScale(scale > 1 ? 1 : 2); });
    image.addEventListener('dragstart', event => event.preventDefault());

    stage.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      stage.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        dragStart = { x: event.clientX, y: event.clientY, offsetX, offsetY };
        stage.classList.add('is-dragging');
      } else if (pointers.size === 2) {
        const points = [...pointers.values()];
        pinchStart = { distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y), scale };
      }
    });
    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinchStart) {
        const points = [...pointers.values()];
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        setScale(pinchStart.scale * (distance / Math.max(1, pinchStart.distance)));
      } else if (pointers.size === 1 && dragStart && scale > 1) {
        offsetX = dragStart.offsetX + event.clientX - dragStart.x;
        offsetY = dragStart.offsetY + event.clientY - dragStart.y;
        render();
      }
    });
    const releasePointer = event => {
      pointers.delete(event.pointerId);
      if (!pointers.size) { dragStart = null; pinchStart = null; stage.classList.remove('is-dragging'); }
      if (pointers.size === 1) {
        const point = [...pointers.values()][0];
        dragStart = { x: point.x, y: point.y, offsetX, offsetY };
        pinchStart = null;
      }
    };
    stage.addEventListener('pointerup', releasePointer);
    stage.addEventListener('pointercancel', releasePointer);
    document.addEventListener('keydown', event => {
      if (!viewer.classList.contains('is-open')) return;
      if (event.key === 'Escape') close();
      if (event.key === '+') setScale(scale * 1.25);
      if (event.key === '-') setScale(scale / 1.25);
      if (scale > 1 && event.key === 'ArrowUp') { event.preventDefault(); offsetY += 80; render(); }
      if (scale > 1 && event.key === 'ArrowDown') { event.preventDefault(); offsetY -= 80; render(); }
      if (scale > 1 && event.key === 'ArrowLeft') { event.preventDefault(); offsetX += 80; render(); }
      if (scale > 1 && event.key === 'ArrowRight') { event.preventDefault(); offsetX -= 80; render(); }
    });
  }

  function canLaunchDirectBalance() {
    const user = currentUser();
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    const profile = normalize(user.profile);
    const normalizedPermissions = permissions.map(normalize);
    return profile.includes('admin')
      || profile === 'financeiro'
      || profile === 'responsavel financeiro'
      || normalizedPermissions.some(permission => permission.includes('admin'))
      || normalizedPermissions.some(permission => [
        'financeiro', 'aprovacao de saldo', 'aprovacao de despesas'
      ].includes(permission));
  }

  let directBalanceRecipients = [];
  let directSummaryRequest = 0;

  const formatMoney = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

  function resetDirectBalanceSummary(modal, message = 'Selecione o usuario e o periodo para calcular.') {
    const panel = modal?.querySelector('#cc-direct-summary');
    if (!panel) return;
    panel.querySelector('[data-direct-summary-status]').textContent = message;
    panel.querySelectorAll('[data-direct-summary-value]').forEach(element => { element.textContent = '\u2014'; });
    const useButton = panel.querySelector('[data-use-direct-suggestion]');
    useButton.dataset.value = '0';
    useButton.disabled = true;
  }

  async function loadDirectBalanceSummary(modal) {
    const recipientId = modal.querySelector('#cc-direct-recipient')?.value;
    const unitId = modal.querySelector('#cc-direct-unit')?.value;
    const periodStart = modal.querySelector('#cc-direct-start')?.value;
    const periodEnd = modal.querySelector('#cc-direct-end')?.value;
    const balanceType = modal.querySelector('#cc-direct-balance-type')?.value || 'corporativo';
    if (!recipientId || !unitId || !periodStart || !periodEnd) return resetDirectBalanceSummary(modal);
    const panel = modal.querySelector('#cc-direct-summary');
    const requestNumber = ++directSummaryRequest;
    panel.querySelector('[data-direct-summary-status]').textContent = 'Calculando valores...';
    try {
      const params = new URLSearchParams({ recipient_id: recipientId, unit_id: unitId, period_start: periodStart, period_end: periodEnd, balance_type: balanceType });
      const summary = await api(`/api/despesas/direct-credit/summary?${params.toString()}`);
      if (requestNumber !== directSummaryRequest) return;
      panel.querySelector('[data-direct-summary-status]').textContent = `${Number(summary.notes_count) || 0} nota(s) no periodo`;
      panel.querySelector('[data-summary="notes"]').textContent = formatMoney(summary.notes_total);
      panel.querySelector('[data-summary="expenses"]').textContent = formatMoney(summary.expenses_considered);
      panel.querySelector('[data-summary="approved"]').textContent = formatMoney(summary.approved_balance);
      panel.querySelector('[data-summary="pending"]').textContent = formatMoney(summary.pending_balance);
      panel.querySelector('[data-summary="available"]').textContent = formatMoney(Math.max(0, Number(summary.current_difference) || 0));
      panel.querySelector('[data-summary="suggestion"]').textContent = formatMoney(summary.suggested_credit);
      const useButton = panel.querySelector('[data-use-direct-suggestion]');
      useButton.dataset.value = String(Number(summary.suggested_credit) || 0);
      useButton.disabled = modal.querySelector('#cc-direct-operation')?.value === 'remove' || !(Number(summary.suggested_credit) > 0);
    } catch (error) {
      if (requestNumber !== directSummaryRequest) return;
      resetDirectBalanceSummary(modal, `Nao foi possivel calcular: ${error.message}`);
    }
  }

  function updateDirectOperationUi(modal) {
    const removing = modal.querySelector('#cc-direct-operation')?.value === 'remove';
    const title = modal.querySelector('[data-direct-title]');
    const amountLabel = modal.querySelector('label[for="cc-direct-amount"]');
    const warning = modal.querySelector('[data-direct-warning]');
    const submit = modal.querySelector('button[type="submit"]');
    const observation = modal.querySelector('#cc-direct-observation');
    if (title) title.textContent = removing ? 'Remover saldo disponível' : 'Lançar saldo direto';
    if (amountLabel) amountLabel.textContent = removing ? 'Valor a remover' : 'Valor do saldo';
    if (warning) {
      warning.textContent = removing
        ? 'A remoção será registrada como lançamento negativo, exige motivo e não poderá ultrapassar o saldo disponível.'
        : 'O saldo será lançado como aprovado e ficará registrado na auditoria.';
      warning.style.background = removing ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)';
      warning.style.color = removing ? 'var(--danger)' : 'var(--warning)';
    }
    if (submit) submit.textContent = removing ? 'Confirmar remoção' : 'Confirmar lançamento';
    if (observation) {
      observation.required = removing;
      observation.placeholder = removing ? 'Informe obrigatoriamente o motivo da remoção' : 'Motivo ou referência do lançamento (opcional)';
    }
    loadDirectBalanceSummary(modal);
  }

  function renderDirectBalanceRecipients(modal) {
    const profileSelect = modal.querySelector('#cc-direct-profile');
    const recipientSelect = modal.querySelector('#cc-direct-recipient');
    if (!profileSelect || !recipientSelect) return;
    const selectedProfile = profileSelect.value;
    const filtered = directBalanceRecipients.filter(person => !selectedProfile || String(person.profile || '') === selectedProfile);
    recipientSelect.innerHTML = `<option value="">Selecione o usuário</option>${filtered.map(person => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)} — ${escapeHtml(person.profile || 'Sem perfil')}${person.unitId ? ` — ${escapeHtml(person.unitId)}` : ''}</option>`).join('')}`;
  }

  function createDirectBalanceModal() {
    let modal = document.getElementById('cc-direct-balance-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'cc-direct-balance-modal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.style.overflowY = 'auto';
    modal.style.alignItems = 'flex-start';
    modal.style.padding = '12px';
    modal.style.overscrollBehavior = 'contain';
    modal.innerHTML = `
      <div class="login-card" style="max-width:620px;width:min(94vw,620px);max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;margin:auto;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px;">
          <div><h2 data-direct-title style="margin:0;color:var(--primary-color);">Lançar saldo direto</h2><small style="color:var(--text-muted);">Sem solicitação prévia do usuário</small></div>
          <button type="button" class="btn btn-secondary" data-direct-close>Fechar</button>
        </div>
        <form id="cc-direct-balance-form">
          <div class="form-group"><label for="cc-direct-operation">Operação</label><select id="cc-direct-operation" required><option value="add">Adicionar saldo</option><option value="remove">Remover saldo disponível</option></select></div>
          <div class="form-group"><label for="cc-direct-balance-type">Finalidade do saldo</label><select id="cc-direct-balance-type" required><option value="corporativo">Corporativo (abastecimento)</option><option value="beneficio">Benefício (hotel e alimentação)</option></select></div>
          <div class="form-grid two-columns">
            <div class="form-group"><label for="cc-direct-profile">Categoria / Perfil</label><select id="cc-direct-profile"><option value="">Todos os perfis</option></select></div>
            <div class="form-group"><label for="cc-direct-recipient">Usuário</label><select id="cc-direct-recipient" required><option value="">Carregando usuários...</option></select></div>
          </div>
          <div class="form-group"><label for="cc-direct-unit">Unidade que receberá o saldo</label><select id="cc-direct-unit" required><option value="">Selecione a unidade</option></select></div>
          <div class="form-grid two-columns">
            <div class="form-group"><label for="cc-direct-start">Início do período</label><input id="cc-direct-start" type="date" required></div>
            <div class="form-group"><label for="cc-direct-end">Fim do período</label><input id="cc-direct-end" type="date" required></div>
          </div>
          <div id="cc-direct-summary" style="border:1px solid var(--border-color);border-radius:10px;padding:14px;margin-bottom:16px;background:rgba(37,99,235,.06);">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px;"><strong>Resumo do periodo</strong><small data-direct-summary-status style="color:var(--text-muted);">Selecione o usuario e o periodo para calcular.</small></div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;font-size:.84rem;">
              <span>Valor das notas</span><strong data-direct-summary-value data-summary="notes">\u2014</strong>
              <span>Despesas consideradas</span><strong data-direct-summary-value data-summary="expenses">\u2014</strong>
              <span>Saldo aprovado</span><strong data-direct-summary-value data-summary="approved">\u2014</strong>
              <span>Saldo pendente de aprovacao</span><strong data-direct-summary-value data-summary="pending">\u2014</strong>
              <span>Saldo disponível agora</span><strong data-direct-summary-value data-summary="available">\u2014</strong>
              <span>Sugestao para quitar despesas</span><strong data-direct-summary-value data-summary="suggestion" style="color:var(--success);">\u2014</strong>
            </div>
            <button type="button" class="btn btn-secondary" data-use-direct-suggestion disabled style="width:100%;margin-top:12px;">Usar valor sugerido</button>
          </div>
          <div class="form-group"><label for="cc-direct-amount">Valor do saldo</label><input id="cc-direct-amount" type="number" min="0.01" max="99999999.99" step="0.01" inputmode="decimal" placeholder="0,00" required></div>
          <div class="form-group"><label for="cc-direct-observation">Observação</label><textarea id="cc-direct-observation" maxlength="1000" rows="3" placeholder="Motivo ou referência do lançamento (opcional)"></textarea></div>
          <div data-direct-warning style="padding:10px 12px;border-radius:8px;background:rgba(245,158,11,.12);color:var(--warning);font-size:.82rem;margin-bottom:16px;">O saldo será lançado como aprovado e ficará registrado na auditoria.</div>
          <button class="btn btn-primary" type="submit" style="width:100%;">Confirmar lançamento</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-direct-close]').addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.style.display = 'none'; });
    modal.querySelector('#cc-direct-profile').addEventListener('change', () => {
      renderDirectBalanceRecipients(modal);
      resetDirectBalanceSummary(modal);
    });
    modal.querySelector('#cc-direct-operation').addEventListener('change', () => updateDirectOperationUi(modal));
    modal.querySelector('#cc-direct-balance-type').addEventListener('change', () => loadDirectBalanceSummary(modal));
    modal.querySelector('#cc-direct-recipient').addEventListener('change', () => {
      const person = directBalanceRecipients.find(item => String(item.id) === modal.querySelector('#cc-direct-recipient').value);
      const unitSelect = modal.querySelector('#cc-direct-unit');
      if (person?.unitId && person.unitId !== 'all' && [...unitSelect.options].some(option => option.value === String(person.unitId))) unitSelect.value = String(person.unitId);
      loadDirectBalanceSummary(modal);
    });
    modal.querySelector('#cc-direct-unit').addEventListener('change', () => loadDirectBalanceSummary(modal));
    modal.querySelector('#cc-direct-start').addEventListener('change', () => loadDirectBalanceSummary(modal));
    modal.querySelector('#cc-direct-end').addEventListener('change', () => loadDirectBalanceSummary(modal));
    modal.querySelector('[data-use-direct-suggestion]').addEventListener('click', event => {
      const value = Number(event.currentTarget.dataset.value) || 0;
      if (value > 0) modal.querySelector('#cc-direct-amount').value = value.toFixed(2);
    });
    modal.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const recipientSelect = document.getElementById('cc-direct-recipient');
      const unitSelect = document.getElementById('cc-direct-unit');
      const operation = document.getElementById('cc-direct-operation').value;
      const balanceType = document.getElementById('cc-direct-balance-type').value;
      const amount = Number(document.getElementById('cc-direct-amount').value);
      const periodStart = document.getElementById('cc-direct-start').value;
      const periodEnd = document.getElementById('cc-direct-end').value;
      if (!recipientSelect.value || !unitSelect.value || !periodStart || !periodEnd || !(amount > 0)) return;
      const recipientName = recipientSelect.options[recipientSelect.selectedIndex]?.textContent || 'o usuário';
      const operationText = operation === 'remove' ? 'remoção' : 'lançamento';
      if (!window.confirm(`Confirma a ${operationText} de ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para ${recipientName}?`)) return;
      button.disabled = true;
      button.textContent = 'Lançando...';
      try {
        await api('/api/despesas/direct-credit', {
          method: 'POST',
          body: JSON.stringify({
            recipient_id: recipientSelect.value,
            unit_id: unitSelect.value,
            operation,
            balance_type: balanceType,
            period_start: periodStart,
            period_end: periodEnd,
            amount,
            observation: document.getElementById('cc-direct-observation').value.trim()
          })
        });
        modal.style.display = 'none';
        form.reset();
        App.showToast?.(operation === 'remove' ? 'Saldo removido com sucesso!' : 'Saldo lançado diretamente com sucesso!');
        await App.loadDespesasDashboard?.();
        await App.loadBalances?.();
      } catch (error) {
        alert(`Não foi possível lançar o saldo: ${error.message}`);
      } finally {
        button.disabled = false;
        updateDirectOperationUi(modal);
      }
    });
    return modal;
  }

  async function openDirectBalanceModal() {
    const modal = createDirectBalanceModal();
    modal.querySelector('form')?.reset();
    const profileSelect = modal.querySelector('#cc-direct-profile');
    const recipientSelect = modal.querySelector('#cc-direct-recipient');
    const unitSelect = modal.querySelector('#cc-direct-unit');
    profileSelect.innerHTML = '<option value="">Carregando perfis...</option>';
    recipientSelect.innerHTML = '<option value="">Carregando usuários...</option>';
    const units = (Store.getUnits?.() || []).filter(unit => String(unit.id) !== 'all');
    unitSelect.innerHTML = `<option value="">Selecione a unidade</option>${units.map(unit => `<option value="${escapeHtml(unit.id)}">${escapeHtml(unit.name)}</option>`).join('')}`;
    modal.style.display = 'flex';
    const today = new Date();
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    modal.querySelector('#cc-direct-start').value = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
    modal.querySelector('#cc-direct-end').value = localDate(today);
    resetDirectBalanceSummary(modal);
    updateDirectOperationUi(modal);
    try {
      directBalanceRecipients = await api('/api/despesas/direct-credit/recipients');
      const profiles = [...new Set((directBalanceRecipients || []).map(person => String(person.profile || 'Sem perfil')))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      profileSelect.innerHTML = `<option value="">Todos os perfis</option>${profiles.map(profile => `<option value="${escapeHtml(profile)}">${escapeHtml(profile)}</option>`).join('')}`;
      renderDirectBalanceRecipients(modal);
    } catch (error) {
      profileSelect.innerHTML = '<option value="">Erro ao carregar perfis</option>';
      recipientSelect.innerHTML = '<option value="">Erro ao carregar usuários</option>';
      App.showToast?.('Erro ao carregar usuários.');
    }
  }

  function installDirectBalanceCredit() {
    const ensureButton = () => {
      let existingButton = document.getElementById('cc-btn-direct-balance');
      if (!canLaunchDirectBalance()) {
        existingButton?.remove();
        return;
      }
      if (window.location.hash !== '#despesas-dashboard') return;
      const tabs = document.querySelector('#tab-balance-approvals-dashboard')?.closest('.view-tabs');
      if (!tabs) return;
      if (!existingButton) {
        existingButton = document.createElement('button');
        existingButton.id = 'cc-btn-direct-balance';
        existingButton.type = 'button';
        existingButton.className = 'btn btn-primary';
        existingButton.textContent = '+ Adicionar / remover saldo';
      }
      existingButton.style.display = 'inline-flex';
      existingButton.style.marginLeft = 'auto';
      existingButton.style.flex = '0 0 auto';
      if (existingButton.dataset.directBalanceBound !== '1') {
        existingButton.dataset.directBalanceBound = '1';
        existingButton.addEventListener('click', openDirectBalanceModal);
      }
      // Se as guias foram reconstruídas, move o botão antigo para a guia atualmente visível.
      if (existingButton.parentElement !== tabs) tabs.appendChild(existingButton);
    };
    ensureButton();
    const syncDirectBalanceRoute = () => {
      const modal = document.getElementById('cc-direct-balance-modal');
      if (window.location.hash !== '#despesas-dashboard') {
        if (modal) {
          modal.style.display = 'none';
          modal.querySelector('form')?.reset();
          resetDirectBalanceSummary(modal);
        }
        return;
      }
      setTimeout(ensureButton, 80);
    };
    window.addEventListener('hashchange', syncDirectBalanceRoute);
    window.addEventListener('popstate', syncDirectBalanceRoute);
    window.addEventListener('storage', ensureButton);
    document.addEventListener('click', () => setTimeout(ensureButton, 0), true);
    new MutationObserver(ensureButton).observe(document.body, { childList: true, subtree: true });
    setTimeout(ensureButton, 250);
    setTimeout(ensureButton, 1000);
  }

  const sortState = {};
  const lastChangedField = {};
  let baseFilterData = null;

  function parseDateValue(value, item) {
    const raw = String(value || item?.date || item?.data || item?.created_at || item?.createdAt || '').trim();
    const time = String(item?.time || item?.hora || '00:00');
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T${time.slice(0, 5) || '00:00'}:00`).getTime();
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T${time.slice(0, 5) || '00:00'}:00`).getTime();
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function pick(item, keys) {
    for (const key of keys) if (item && item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
    return '';
  }

  function sortValue(item, key) {
    if (key === 'date') return parseDateValue('', item);
    if (key === 'value') return numericValue(pick(item, ['value', 'valor', 'amount', 'total', 'saldo']));
    const map = {
      name: ['name', 'nome', 'nomeFantasia', 'companyName', 'cliente_nome'],
      client: ['client', 'cliente', 'clientName', 'cliente_nome', 'nomeFantasia', 'name'],
      company: ['empresa_nome', 'company_name', 'empresa', 'companyName', 'empresa_id', 'company_id'],
      unitId: ['unitName', 'unidade_nome', 'unidade', 'unitId', 'unit_id'],
      vendedor: ['vendedor_nome', 'seller_name', 'vendedor', 'userName', 'userId', 'user_id'],
      supervisor: ['supervisor_nome', 'supervisor'],
      status: ['status', 'situacao', 'situation'],
      category: ['finalidade', 'category', 'categoria'],
      operation: ['operacao', 'operation', 'tipo_operacao'],
      type: ['type', 'tipo', 'equipmentType', 'tipo_solicitacao'],
      model: ['model', 'modelo', 'modelo_novo'],
      serial: ['equipmentSerial', 'patrimonio', 'patrimonio_novo', 'serial'],
      responsible: ['responsible', 'responsavel', 'mechanic', 'mecanico'],
      priority: ['priority', 'prioridade'],
      profile: ['profile', 'perfil'],
      city: ['city', 'cidade']
    };
    return normalize(pick(item, map[key] || [key]));
  }

  function inferSortKey(label) {
    const text = normalize(label).replace(/[▲▼↕]/g, '').trim();
    if (!text || /^(acoes|acao|pdf|info|selecionar)$/.test(text)) return '';
    if (text.includes('data') || text.includes('emissao') || text.includes('criado') || text.includes('atualizado')) return 'date';
    if (text.includes('valor') || text.includes('saldo') || text.includes('total')) return 'value';
    if (text.includes('finalidade') || text.includes('categoria')) return 'category';
    if (text.includes('operacao')) return 'operation';
    if (text.includes('empresa')) return 'company';
    if (text.includes('unidade')) return 'unitId';
    if (text.includes('vendedor')) return 'vendedor';
    if (text.includes('supervisor')) return 'supervisor';
    if (text.includes('cliente')) return 'client';
    if (text.includes('status') || text.includes('situacao')) return 'status';
    if (text.includes('prioridade')) return 'priority';
    if (text.includes('responsavel') || text.includes('mecanico')) return 'responsible';
    if (text.includes('patrimonio') || text.includes('serial')) return 'serial';
    if (text.includes('modelo')) return 'model';
    if (text.includes('tipo')) return 'type';
    if (text.includes('perfil')) return 'profile';
    if (text.includes('cidade')) return 'city';
    if (text.includes('nome') || text.includes('usuario')) return 'name';
    return text.replace(/\s+/g, '_');
  }

  function applySort(list, moduleKey) {
    const state = sortState[moduleKey];
    if (!state || !state.key || !Array.isArray(list)) return list;
    const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    return list.map((item, index) => ({ item, index })).sort((left, right) => {
      const a = sortValue(left.item, state.key);
      const b = sortValue(right.item, state.key);
      let result;
      if (typeof a === 'number' && typeof b === 'number') result = a - b;
      else result = collator.compare(String(a), String(b));
      if (!result) result = left.index - right.index;
      return state.direction === 'desc' ? -result : result;
    }).map(entry => entry.item);
  }

  function filterPanel(moduleKey) {
    const manager = window.FiltersManager;
    const config = manager && manager.configs && manager.configs[moduleKey];
    const body = config && document.getElementById(config.tbodyId);
    return body?.closest('.card')?.querySelector('.general-filter-bar') || null;
  }

  function filterUsers() {
    try { return Array.isArray(Store.getUsers?.()) ? Store.getUsers() : []; }
    catch (_) { return []; }
  }

  function filterUserName(user) {
    return String(pick(user, ['name', 'nome', 'username', 'email']) || '').trim();
  }

  function filterUserId(user) {
    return String(pick(user, ['id', 'userId', 'user_id']) || '').trim();
  }

  function recordSellerId(record) {
    return String(pick(record, [
      'userId', 'user_id', 'usuario_id', 'usuarioId', 'vendedor_id', 'vendedorId',
      'seller_id', 'sellerId', 'createdBy', 'created_by', 'created_by_id', 'ownerId'
    ]) || '').trim();
  }

  function linkedUserIds(user) {
    const raw = user?.linked_users ?? user?.linkedUsers ?? [];
    if (Array.isArray(raw)) return raw.map(value => String(value));
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(value => String(value));
    } catch (_) {}
    return raw.split(',').map(value => value.trim()).filter(Boolean);
  }

  function approvalSupervisorName(record) {
    const direct = String(pick(record, ['supervisor_nome', 'supervisor_name', 'supervisor']) || '').trim();
    if (direct) return direct;

    const users = filterUsers();
    let sellerId = recordSellerId(record);
    const sellerName = normalize(pick(record, [
      'vendedor_nome', 'vendedor_solicitante', 'seller_name', 'vendedor', 'seller', 'cliente_vendedor'
    ]));
    let seller = sellerId ? users.find(user => filterUserId(user) === sellerId) : null;
    if (!seller && sellerName) seller = users.find(user => normalize(filterUserName(user)) === sellerName);
    if (!sellerId && seller) sellerId = filterUserId(seller);
    if (!sellerId) return '';
    const supervisorId = String(pick(seller, ['supervisor_id', 'supervisorId']) || '').trim();
    let supervisor = supervisorId ? users.find(user => filterUserId(user) === supervisorId) : null;
    if (!supervisor) {
      supervisor = users.find(user => {
        const profile = normalize(pick(user, ['profile', 'perfil']));
        return (profile.includes('supervisor') || profile.includes('gerente'))
          && linkedUserIds(user).includes(sellerId);
      });
    }
    return filterUserName(supervisor);
  }

  function dynamicUnitName(record) {
    const raw = String(pick(record, ['unitId', 'unit_id', 'unidadeId', 'unidade_id', 'unidade']) || '').trim();
    if (!raw) return '';
    const units = Store.getUnits?.() || [];
    const byId = units.find(unit => String(unit.id) === raw);
    if (byId) return String(byId.name || byId.nome || raw).trim();
    const byName = units.find(unit => normalize(unit.name || unit.nome) === normalize(raw));
    return String(byName?.name || byName?.nome || raw).trim();
  }

  function dynamicCompanyName(record) {
    const direct = String(pick(record, [
      'empresa_nome', 'company_name', 'companyName', 'empresa', 'base', 'empresaBase'
    ]) || '').trim();
    if (direct) return direct;
    const rawUnit = String(pick(record, ['unitId', 'unit_id', 'unidadeId', 'unidade_id', 'unidade']) || '').trim();
    if (!rawUnit) return '';
    const units = Store.getUnits?.() || [];
    const unit = units.find(item => String(item.id) === rawUnit)
      || units.find(item => normalize(item.name || item.nome) === normalize(rawUnit));
    return String(pick(unit, ['empresa_nome', 'company_name', 'empresa', 'company', 'name', 'nome']) || '').trim();
  }

  function approvalAllRecords() {
    let records = [];
    try { records = Store.getClients?.() || []; } catch (_) {}
    return (Array.isArray(records) ? records : []).filter(record => record && !record.deleted && !record.excluido && record.active !== false);
  }

  function approvalFilterSource(cached) {
    const merged = [];
    const seen = new Set();
    [...(Array.isArray(cached) ? cached : []), ...approvalAllRecords()].forEach((record, index) => {
      if (!record) return;
      const key = String(record.id ?? record.clientId ?? record.cliente_id ?? `approval-${index}`);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(record);
    });
    return merged;
  }

  function approvalDate(record) {
    const raw = pick(record, ['created_at', 'createdAt', 'date', 'data', 'data_cadastro', 'updated_at']);
    if (!raw) return '-';
    const value = String(raw).trim();
    let match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[1]}/${match[2]}/${match[3]}`;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
  }

  function approvalStatusBadge(record) {
    const status = String(record?.status || 'Pendente');
    const normalized = normalize(status);
    let badgeClass = 'badge-warning';
    if (normalized.includes('aprov')) badgeClass = 'badge-success';
    else if (normalized.includes('reprov')) badgeClass = 'badge-danger';
    else if (normalized.includes('correc') || normalized.includes('ajuste')) badgeClass = 'badge-primary';
    return `<span class="badge-status ${badgeClass}" style="font-size:.72rem;">${escapeHtml(status)}</span>`;
  }

  function approvalIsAwaitingDecision(record) {
    const status = normalize(record?.status);
    return !status || status.includes('pendente') || status.includes('analise');
  }

  function ensureApprovalDateHeader() {
    const body = document.getElementById('approvals-table-body');
    const row = body?.closest('table')?.querySelector('thead tr');
    if (!row) return;
    const headers = [...row.querySelectorAll('th')];
    if (headers.some(header => normalize(header.dataset.ccSortLabel || header.textContent) === 'data')) return;
    const sellerIndex = headers.findIndex(header => normalize(header.dataset.ccSortLabel || header.textContent).includes('vendedor'));
    const dateHeader = document.createElement('th');
    dateHeader.textContent = 'Data';
    if (sellerIndex >= 0 && headers[sellerIndex].nextSibling) row.insertBefore(dateHeader, headers[sellerIndex].nextSibling);
    else row.appendChild(dateHeader);
  }

  function renderApprovalHistory(records) {
    const body = document.getElementById('approvals-table-body');
    if (!body) return;
    ensureApprovalDateHeader();
    const list = scopeByGlobalUnit(Array.isArray(records) ? records : [], 'aprovacao');
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:14px;">Nenhum cadastro encontrado para os filtros selecionados.</td></tr>';
      return;
    }
    body.innerHTML = list.map(record => {
      const id = escapeHtml(record.id || record.clientId || record.cliente_id || '');
      const sellerId = recordSellerId(record);
      const sellerName = (() => {
        try { return UI.getUserName?.(sellerId) || pick(record, ['vendedor_nome', 'seller_name', 'vendedor']) || sellerId || '-'; }
        catch (_) { return pick(record, ['vendedor_nome', 'seller_name', 'vendedor']) || sellerId || '-'; }
      })();
      const score = (() => {
        try { return UI.formatClientScore?.(record) || record.score || '-'; }
        catch (_) { return record.score || '-'; }
      })();
      const viewButton = `<button class="btn btn-primary btn-sm" style="padding:2px 8px;font-size:.75rem;margin-right:4px;" onclick="event.stopPropagation(); App.showClientDetails('${id}')">Ver Ficha</button>`;
      const decisionButtons = canReviewClientApprovals() && approvalIsAwaitingDecision(record)
        ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.approveClient('${id}','Aprovado')">Aprovar</button><button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.approveClient('${id}','Reprovado')">Reprovar</button>`
        : '';
      return `<tr class="mobile-summary-row" onclick="App.showClientDetails('${id}')">
        <td data-label="Cliente" style="font-weight:600;">${escapeHtml(record.name || record.nomeFantasia || record.companyName || '-')}</td>
        <td data-label="CNPJ">${escapeHtml(record.cnpj || '-')}</td>
        <td data-label="Telefone">${escapeHtml(record.phone || record.telefone || '-')}</td>
        <td data-label="E-mail">${escapeHtml(record.email || '-')}</td>
        <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:.7rem;font-weight:500;">${escapeHtml(dynamicUnitName(record) || record.unitId || '-')}</span></td>
        <td data-label="Vendedor"><span style="font-size:.75rem;color:var(--text-muted);">${escapeHtml(sellerName)}</span></td>
        <td data-label="Data">${escapeHtml(approvalDate(record))}</td>
        <td data-label="Score">${escapeHtml(score)}</td>
        <td data-label="Status">${approvalStatusBadge(record)}</td>
        <td data-label="A&ccedil;&otilde;es"><div class="client-approval-actions">${viewButton}${decisionButtons}</div></td>
      </tr>`;
    }).join('');
  }

  function installApprovalHistoryView() {
    if (!window.UI || !window.FiltersManager || UI.__ccApprovalHistory20260719) return false;
    UI.__ccApprovalHistory20260719 = true;
    UI._original_renderApprovals = renderApprovalHistory;
    UI.renderApprovals = function (records) {
      const source = approvalFilterSource(Array.isArray(records) ? records : []);
      FiltersManager.caches.aprovacao = source;
      FiltersManager.ensureFilterPanel('aprovacao');
      const filtered = FiltersManager.filterData(source, FiltersManager.getFilterValues('aprovacao'), 'aprovacao');
      return renderApprovalHistory(filtered);
    };
    return true;
  }

  function rebuildCascadingFilters(moduleKey, preserveField) {
    const manager = window.FiltersManager;
    const config = manager?.configs?.[moduleKey];
    const panel = filterPanel(moduleKey);
    if (!config || !panel || !baseFilterData) return;
    let data = Array.isArray(manager.caches[moduleKey]) ? manager.caches[moduleKey] : [];
    // A fila pode ser desenhada antes do interceptador geral guardar o cache.
    // Nesse caso a tabela tem linhas, mas os selects recebem uma lista vazia.
    if (moduleKey === 'aprovacao') {
      data = approvalFilterSource(data);
      manager.caches[moduleKey] = data;
    }
    const selects = [...panel.querySelectorAll('select.select-ctrl[data-field]')];
    const readFilters = () => manager.getFilterValues(moduleKey);
    const valuesFor = (field, filters) => {
      const withoutSelf = { ...filters, [field]: '' };
      const unitScopedData = scopeByGlobalUnit(data, moduleKey);
      return [...new Set(baseFilterData(unitScopedData, withoutSelf, moduleKey)
        .map(item => String(manager.getFilterValue(item, field) || '').trim())
        .filter(value => value && !['null', 'undefined', '-', '—'].includes(value.toLowerCase())))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    };

    let filters = readFilters();
    selects.forEach(select => {
      const field = select.dataset.field;
      const current = select.value;
      if (!current || field === preserveField) return;
      if (!valuesFor(field, filters).includes(current)) {
        select.value = '';
        filters[field] = '';
      }
    });

    filters = readFilters();
    selects.forEach(select => {
      const field = select.dataset.field;
      const current = select.value;
      let values = valuesFor(field, filters);
      if (current && !values.includes(current) && field === preserveField) values = [...values, current].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      select.innerHTML = '<option value="">Todos</option>' + values.map(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        return option.outerHTML;
      }).join('');
      if (current && values.includes(current)) select.value = current;
    });
  }

  function updateSortHeaders(moduleKey) {
    const config = FiltersManager.configs[moduleKey];
    const body = document.getElementById(config.tbodyId);
    const headers = body?.closest('table')?.querySelectorAll('thead th');
    if (!headers) return;
    headers.forEach(header => {
      if (!header.dataset.ccSortLabel) header.dataset.ccSortLabel = header.textContent.trim();
      const key = header.dataset.ccSortKey || inferSortKey(header.dataset.ccSortLabel);
      header.dataset.ccSortKey = key;
      if (!key) return;
      header.classList.add('cc-sortable-header');
      header.tabIndex = 0;
      header.setAttribute('role', 'button');
      const state = sortState[moduleKey];
      const active = state && state.key === key;
      header.setAttribute('aria-sort', active ? (state.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      const nextLabel = `${header.dataset.ccSortLabel} ${active ? (state.direction === 'asc' ? '▲' : '▼') : '↕'}`;
      if (header.textContent !== nextLabel) header.textContent = nextLabel;
      if (header.dataset.ccSortInstalled === '1') return;
      header.dataset.ccSortInstalled = '1';
      const activate = () => {
        const previous = sortState[moduleKey];
        const direction = previous?.key === key
          ? (previous.direction === 'asc' ? 'desc' : 'asc')
          : (key === 'date' ? 'desc' : 'asc');
        sortState[moduleKey] = { key, direction };
        updateSortHeaders(moduleKey);
        FiltersManager.triggerFiltering(moduleKey);
      };
      header.addEventListener('click', activate);
      header.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      });
    });
  }

  function refreshSortHeadersEverywhere() {
    if (!window.FiltersManager?.configs) return;
    Object.keys(FiltersManager.configs).forEach(moduleKey => {
      try {
        FiltersManager.ensureFilterPanel(moduleKey);
        updateSortHeaders(moduleKey);
      } catch (_) {}
    });
  }

  function installFiltersAndSorting() {
    if (!window.FiltersManager) return false;
    if (FiltersManager.__ccDynamicSort20260716) {
      refreshSortHeadersEverywhere();
      return true;
    }
    FiltersManager.__ccDynamicSort20260716 = true;
    baseFilterData = FiltersManager.filterData.bind(FiltersManager);
    const originalGetFilterValue = FiltersManager.getFilterValue.bind(FiltersManager);
    const originalEnsure = FiltersManager.ensureFilterPanel.bind(FiltersManager);
    const originalTrigger = FiltersManager.triggerFiltering.bind(FiltersManager);

    FiltersManager.getFilterValue = function (item, field) {
      if (field === 'empresa') {
        const company = dynamicCompanyName(item);
        if (company) return company;
      }
      if (field === 'supervisor') {
        const supervisor = approvalSupervisorName(item);
        if (supervisor) return supervisor;
      }
      if (field === 'unitId') {
        const unit = dynamicUnitName(item);
        if (unit) return unit;
      }
      return originalGetFilterValue(item, field);
    };

    FiltersManager.filterData = function (data, filters, moduleKey) {
      const unitScopedData = scopeByGlobalUnit(data, moduleKey);
      return applySort(baseFilterData(unitScopedData, filters, moduleKey), moduleKey);
    };

    if (!FiltersManager.__ccGlobalUnitExport20260716 && typeof FiltersManager.exportExcel === 'function') {
      FiltersManager.__ccGlobalUnitExport20260716 = true;
      const originalExportExcel = FiltersManager.exportExcel.bind(FiltersManager);
      FiltersManager.exportExcel = function (moduleKey, useFiltered) {
        return originalExportExcel(moduleKey, activeGlobalUnitId() !== 'all' ? true : useFiltered);
      };
    }

    if (!FiltersManager.__ccGlobalUnitFiles20260716 && typeof FiltersManager.getCollectedFiles === 'function') {
      FiltersManager.__ccGlobalUnitFiles20260716 = true;
      const originalCollectedFiles = FiltersManager.getCollectedFiles.bind(FiltersManager);
      FiltersManager.getCollectedFiles = function () {
        return scopeByGlobalUnit(originalCollectedFiles(), 'exportar-arquivos');
      };
    }
    FiltersManager.ensureFilterPanel = function (moduleKey) {
      const result = originalEnsure(moduleKey);
      rebuildCascadingFilters(moduleKey, lastChangedField[moduleKey]);
      updateSortHeaders(moduleKey);
      return result;
    };
    FiltersManager.triggerFiltering = function (moduleKey) {
      rebuildCascadingFilters(moduleKey, lastChangedField[moduleKey]);
      lastChangedField[moduleKey] = '';
      const result = originalTrigger(moduleKey);
      setTimeout(() => {
        rebuildCascadingFilters(moduleKey, '');
        updateSortHeaders(moduleKey);
        if (moduleKey === 'despesas') updateExpenseCardsForLocalFilters();
      }, 0);
      return result;
    };

    document.addEventListener('change', event => {
      const control = event.target.closest?.('.general-filter-bar .filter-ctrl[data-field]');
      if (!control) return;
      for (const [moduleKey, config] of Object.entries(FiltersManager.configs)) {
        const body = document.getElementById(config.tbodyId);
        if (body?.closest('.card')?.contains(control)) {
          lastChangedField[moduleKey] = control.dataset.field || '';
          break;
        }
      }
    }, true);

    const style = document.createElement('style');
    style.id = 'cc-dynamic-sort-style';
    style.textContent = `
      th.cc-sortable-header{cursor:pointer;user-select:none;white-space:nowrap;transition:color .15s ease,background .15s ease;}
      th.cc-sortable-header:hover,th.cc-sortable-header:focus{color:var(--primary-color);background:rgba(37,99,235,.08);outline:none;}
      th.cc-sortable-header[aria-sort="ascending"],th.cc-sortable-header[aria-sort="descending"]{color:var(--primary-color);}
    `;
    document.head.appendChild(style);

    let scheduled = false;
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        refreshSortHeadersEverywhere();
      });
    };
    new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => setTimeout(refreshSortHeadersEverywhere, 180));
    window.addEventListener('pageshow', () => setTimeout(refreshSortHeadersEverywhere, 180));
    document.addEventListener('click', event => {
      if (event.target.closest?.('button, a, .view-tab, .nav-item')) {
        setTimeout(refreshSortHeadersEverywhere, 100);
        setTimeout(refreshSortHeadersEverywhere, 400);
      }
    }, true);
    refreshSortHeadersEverywhere();
    setTimeout(refreshSortHeadersEverywhere, 300);
    setTimeout(refreshSortHeadersEverywhere, 1000);
    return true;
  }

  function recordOwnerId(record) {
    return String(pick(record, ['userId', 'user_id', 'usuario_id', 'usuarioId', 'vendedor_id', 'vendedorId', 'seller_id', 'sellerId', 'createdBy', 'created_by', 'created_by_id', 'ownerId', 'responsavel_id', 'solicitante_id']) || '');
  }

  function recordOwnerName(record) {
    return normalize(pick(record, ['vendedor', 'vendedor_nome', 'vendedor_solicitante', 'seller_name', 'userName', 'usuario_nome', 'name', 'nome', 'responsavel', 'solicitante_nome', 'solicitante']));
  }

  function belongsToUser(record, user) {
    const ownerId = recordOwnerId(record);
    if (ownerId) return ownerId === String(user?.id || '');
    const ownerName = recordOwnerName(record);
    return Boolean(ownerName && ownerName === normalize(user?.name || user?.nome || ''));
  }

  function approvedBalanceValue(balance) {
    const items = Array.isArray(balance?.itens) ? balance.itens : (Array.isArray(balance?.items) ? balance.items : []);
    if (items.length) {
      return items.reduce((sum, item) => {
        const status = normalize(item?.status);
        if (status.includes('reprov') || status.includes('correc')) return sum;
        return sum + numericValue(item?.valor_aprovado ?? item?.valorAprovado ?? 0);
      }, 0);
    }
    return numericValue(pick(balance, ['totalAprovado', 'total_aprovado', 'total_liberado', 'approved_total', 'valor_aprovado', 'totalGeral', 'total_geral', 'value', 'valor']));
  }

  function expenseValue(expense) {
    if (isApproved(expense)) {
      const approved = pick(expense, ['total_liberado', 'totalAprovado', 'total_aprovado', 'approved_total', 'valor_aprovado']);
      if (approved !== undefined && approved !== null && approved !== '') return numericValue(approved);
    }
    return numericValue(pick(expense, ['value', 'valor', 'amount', 'total', 'totalGeral', 'total_geral']));
  }

  function isRequisitionExpense(expense) {
    return normalize(pick(expense, ['operacao', 'operation', 'tipo_operacao', 'tipoOperacao'])).includes('requis');
  }

  function financialBucket(value) {
    const text = normalize(value);
    if (text.includes('requis')) return 'requisicao';
    if (/benef|hosped|hotel|alimenta|refei/.test(text)) return 'beneficio';
    return 'corporativo';
  }

  function approvedBalanceByBucket(balance, bucket) {
    const items = balance.itens || balance.items || balance.solicitacao_itens || [];
    if (Array.isArray(items) && items.length) {
      return items.reduce((sum, item) => {
        const status = normalize(item.status || '');
        if (status.includes('reprov') || status.includes('correc') || financialBucket(item.categoria) !== bucket) return sum;
        return sum + numericValue(item.valor_aprovado ?? item.valor_solicitado);
      }, 0);
    }
    return bucket === 'beneficio'
      ? numericValue(balance.valor_hotel_alim_aprovado ?? balance.valor_hotel_alim)
      : numericValue(balance.valor_abastecimento_aprovado ?? balance.valor_abastecimento);
  }

  function isApproved(record) {
    return normalize(record?.status).includes('aprov');
  }

  function isExpenseConsidered(record) {
    const status = normalize(record?.status);
    return status === 'pendente' || status.includes('aprov');
  }

  function updateExpenseCardsForLocalFilters() {
    if (!window.FiltersManager?.configs?.despesas) return;
    const rawExpenses = FiltersManager.caches.despesas || window.AppExpensesCache || Store.getExpenses?.() || [];
    const filters = FiltersManager.getFilterValues('despesas');
    const expenses = FiltersManager.filterData(rawExpenses, filters, 'despesas');
    const rawBalances = window.AppBalancesCache || Store.getBalanceRequests?.() || [];
    const balanceFilters = {
      empresa: filters.empresa || '', unitId: filters.unitId || '', vendedor: '',
      supervisor: '', period: filters.period || '', search: '', status: ''
    };
    let balances = FiltersManager.filterData(rawBalances, balanceFilters, 'solicitacao-despesas');

    // Despesas usam "Vendedor", enquanto solicitacoes de saldo usam "Solicitante".
    // A correspondencia abaixo aceita tanto o ID quanto o nome sem perder o saldo aprovado.
    const users = Store.getUsers?.() || [];
    if (filters.vendedor) {
      const sellerName = normalize(filters.vendedor);
      const sellerIds = new Set(users.filter(user => normalize(user.name || user.nome) === sellerName).map(user => String(user.id)));
      balances = balances.filter(item => sellerIds.has(recordOwnerId(item)) || recordOwnerName(item) === sellerName);
    }
    if (filters.supervisor) {
      const supervisorName = normalize(filters.supervisor);
      const supervisorIds = new Set(users.filter(user => normalize(user.name || user.nome) === supervisorName).map(user => String(user.id)));
      const supervisedIds = new Set(users.filter(user => supervisorIds.has(String(user.supervisor_id || user.supervisorId || ''))).map(user => String(user.id)));
      expenses.map(recordOwnerId).filter(Boolean).forEach(id => supervisedIds.add(id));
      balances = balances.filter(item => supervisedIds.has(recordOwnerId(item)));
    }

    const totalApproved = balances.filter(isApproved).reduce((sum, item) => sum + approvedBalanceValue(item), 0);
    // "Utilizado" representa somente despesas efetivamente aprovadas.
    const approvedExpenses = expenses.filter(isApproved);
    const requisitionSpent = approvedExpenses.filter(isRequisitionExpense).reduce((sum, item) => sum + expenseValue(item), 0);
    const totalSpent = approvedExpenses.filter(item => !isRequisitionExpense(item)).reduce((sum, item) => sum + expenseValue(item), 0);
    const corporateBalance = balances.filter(isApproved).reduce((sum, item) => sum + approvedBalanceByBucket(item, 'corporativo'), 0);
    const benefitBalance = balances.filter(isApproved).reduce((sum, item) => sum + approvedBalanceByBucket(item, 'beneficio'), 0);
    const corporateSpent = approvedExpenses.filter(item => financialBucket(pick(item, ['operacao','operation','finalidade'])) === 'corporativo').reduce((sum, item) => sum + expenseValue(item), 0);
    const benefitSpent = approvedExpenses.filter(item => financialBucket(pick(item, ['operacao','operation','finalidade'])) === 'beneficio').reduce((sum, item) => sum + expenseValue(item), 0);
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = formatMoney(value); };
    set('metric-balance-available', totalApproved);
    set('metric-balance-used', totalSpent);
    set('metric-balance-remaining', totalApproved - totalSpent);
    set('metric-expense-requisition', requisitionSpent);
    set('metric-balance-corporate', corporateBalance);
    set('metric-expense-corporate', corporateSpent);
    set('metric-remaining-corporate', corporateBalance - corporateSpent);
    set('metric-balance-benefit', benefitBalance);
    set('metric-expense-benefit', benefitSpent);
    set('metric-remaining-benefit', benefitBalance - benefitSpent);
  }

  function renderDashboardBars(elementId, rows, formatter) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const max = Math.max(...rows.map(row => Number(row.value) || 0), 1);
    element.innerHTML = rows.map(row => {
      const width = Math.max(4, Math.round(((Number(row.value) || 0) / max) * 100));
      return `<div class="mini-chart-row"><span>${escapeHtml(row.label)}</span><div class="mini-chart-track"><div class="mini-chart-fill" style="width:${width}%"></div></div><span class="mini-chart-value">${escapeHtml(formatter(row.value))}</span></div>`;
    }).join('');
  }

  function approvalRequestTotal(record) {
    return numericValue(pick(record, ['totalGeral', 'total_geral', 'valor_solicitado', 'value', 'valor']));
  }

  function approvalRecordDate(record) {
    const raw = String(pick(record, ['created_at', 'createdAt', 'data_solicitacao', 'date', 'data']) || '').trim();
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  function approvalStatusKind(record) {
    const status = normalize(record?.status);
    if (status.includes('aprov')) return 'approved';
    if (status.includes('rejeit') || status.includes('reprov')) return 'rejected';
    if (status.includes('correc') || status.includes('ajuste')) return 'correction';
    return 'pending';
  }

  function filterApprovalRecords(records, filters, ignoreStatus = false) {
    const search = normalize(filters.solicitante);
    const selectedStatus = normalize(filters.status);
    return scopeByGlobalUnit(records, 'solicitacao-despesas').filter(record => {
      if (search && !recordOwnerName(record).includes(search)) return false;
      if (!ignoreStatus && selectedStatus && normalize(record.status) !== selectedStatus) return false;
      const date = approvalRecordDate(record);
      if (filters.inicio && (!date || date < filters.inicio)) return false;
      if (filters.fim && (!date || date > filters.fim)) return false;
      return true;
    });
  }

  function renderApprovalFinanceCharts(balances, expenses) {
    const body = document.getElementById('finance-charts-body');
    if (!body) return;
    const values = { approved: 0, pending: 0, rejected: 0, correction: 0 };
    balances.forEach(record => {
      const kind = approvalStatusKind(record);
      values[kind] += kind === 'approved' ? approvedBalanceValue(record) : approvalRequestTotal(record);
    });
    const approvedExpenseRows = expenses.filter(isApproved);
    const requisitionExpenses = approvedExpenseRows.filter(isRequisitionExpense).reduce((sum, record) => sum + expenseValue(record), 0);
    const approvedExpenses = approvedExpenseRows.filter(record => !isRequisitionExpense(record)).reduce((sum, record) => sum + expenseValue(record), 0);
    const remaining = values.approved - approvedExpenses;
    const maximum = Math.max(values.approved, approvedExpenses, Math.abs(remaining), values.pending, values.rejected, values.correction, 1);
    const bar = (label, value) => {
      const width = Math.max(value ? 3 : 0, Math.round((Math.abs(Number(value) || 0) / maximum) * 100));
      return `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:.78rem"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatMoney(value))}</strong></div><div style="height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden"><div style="width:${width}%;height:100%;background:var(--primary-color);border-radius:999px"></div></div></div>`;
    };
    const situationTotal = values.approved + values.pending + values.rejected + values.correction || 1;
    const approvedDeg = Math.round((values.approved / situationTotal) * 360);
    const pendingDeg = approvedDeg + Math.round((values.pending / situationTotal) * 360);
    const correctionDeg = pendingDeg + Math.round((values.correction / situationTotal) * 360);
    const unitRows = {};
    balances.forEach(record => {
      const unitId = String(pick(record, ['unitId', 'unit_id', 'unidadeId', 'unidade_id']) || 'Sem unidade');
      unitRows[unitId] = unitRows[unitId] || { balance: 0, expense: 0 };
      if (approvalStatusKind(record) === 'approved') unitRows[unitId].balance += approvedBalanceValue(record);
    });
    expenses.filter(record => isApproved(record) && !isRequisitionExpense(record)).forEach(record => {
      const unitId = String(pick(record, ['unitId', 'unit_id', 'unidadeId', 'unidade_id']) || 'Sem unidade');
      unitRows[unitId] = unitRows[unitId] || { balance: 0, expense: 0 };
      unitRows[unitId].expense += expenseValue(record);
    });
    const ranking = Object.entries(unitRows).map(([unitId, value]) => `<li style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-color)"><span>${escapeHtml(UI.getUnitName?.(unitId) || unitId)}</span><strong>${escapeHtml(formatMoney(value.balance - value.expense))}</strong></li>`).join('') || '<li style="color:var(--text-muted)">Sem dados para os filtros selecionados.</li>';
    body.innerHTML = `<div><h4>Resumo por Status</h4>${bar('Saldo aprovado', values.approved)}${bar('Despesas aprovadas que consomem saldo', approvedExpenses)}${bar('Gasto por requisição', requisitionExpenses)}${bar('Saldo restante', remaining)}${bar('Saldos pendentes', values.pending)}${bar('Correção', values.correction)}${bar('Reprovados', values.rejected)}</div><div><h4>Pizza por situação</h4><div style="min-height:160px;border-radius:12px;background:conic-gradient(var(--success) 0 ${approvedDeg}deg,var(--warning) ${approvedDeg}deg ${pendingDeg}deg,#3b82f6 ${pendingDeg}deg ${correctionDeg}deg,var(--danger) ${correctionDeg}deg 360deg);display:flex;align-items:center;justify-content:center"><span style="background:var(--bg-card);padding:14px;border-radius:999px;font-weight:700">${escapeHtml(formatMoney(remaining))}</span></div></div><div><h4>Ranking / Unidade</h4><ol style="padding-left:18px;margin:0">${ranking}</ol></div>`;
  }

  async function refreshApprovalDashboardFromFilters() {
    if (window.location.hash !== '#despesas-dashboard') return;
    const filters = {
      solicitante: document.getElementById('filter-despesa-solicitante')?.value?.trim() || '',
      status: document.getElementById('filter-despesa-status')?.value || '',
      inicio: document.getElementById('filter-despesa-inicio')?.value || '',
      fim: document.getElementById('filter-despesa-fim')?.value || ''
    };
    const unitId = activeGlobalUnitId();
    const query = unitId !== 'all' ? `?unitId=${encodeURIComponent(unitId)}` : '';
    const allBalances = await api(`/api/despesas${query}`);
    const scopedBalances = scopeByGlobalUnit(allBalances, 'solicitacao-despesas');
    const filteredBalances = filterApprovalRecords(scopedBalances, filters);
    const statusCandidates = filterApprovalRecords(scopedBalances, filters, true);
    const statusSelect = document.getElementById('filter-despesa-status');
    if (statusSelect) {
      const current = statusSelect.value;
      const statuses = [...new Set(statusCandidates.map(record => String(record.status || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      if (current && !statuses.includes(current)) statuses.push(current);
      statusSelect.innerHTML = '<option value="">Todos</option>' + statuses.map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
      statusSelect.value = current;
    }
    const availableDates = statusCandidates.map(approvalRecordDate).filter(Boolean).sort();
    const startInput = document.getElementById('filter-despesa-inicio');
    const endInput = document.getElementById('filter-despesa-fim');
    if (availableDates.length) {
      if (startInput) { startInput.min = availableDates[0]; startInput.max = availableDates[availableDates.length - 1]; }
      if (endInput) { endInput.min = availableDates[0]; endInput.max = availableDates[availableDates.length - 1]; }
    }
    App.renderDespesasTable?.(filteredBalances);
    window.AppBalancesCache = filteredBalances;
    const sums = filteredBalances.reduce((total, record) => {
      const kind = approvalStatusKind(record);
      total.requested += approvalRequestTotal(record);
      if (kind === 'approved') total.approved += approvedBalanceValue(record);
      if (kind === 'rejected') total.rejected += approvalRequestTotal(record);
      if (kind === 'pending') total.pending += 1;
      return total;
    }, { requested: 0, approved: 0, rejected: 0, pending: 0 });
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    set('metric-despesas-solicitado', formatMoney(sums.requested));
    set('metric-despesas-aprovado', formatMoney(sums.approved));
    set('metric-despesas-rejeitado', formatMoney(sums.rejected));
    set('metric-despesas-pendentes', String(sums.pending));
    const matchingNames = new Set(filteredBalances.map(recordOwnerName).filter(Boolean));
    let expenses = [];
    // Sem saldo correspondente ao filtro, o grafico tambem deve zerar. Isso evita
    // misturar despesas de outros usuarios/unidades quando a pesquisa nao encontra nada.
    if (filteredBalances.length && matchingNames.size) {
      expenses = scopeByGlobalUnit(window.AppExpensesCache || Store.getExpenses?.() || [], 'despesas')
        .filter(record => {
          const date = approvalRecordDate(record);
          if (filters.inicio && (!date || date < filters.inicio)) return false;
          if (filters.fim && (!date || date > filters.fim)) return false;
          if (filters.solicitante && !recordOwnerName(record).includes(normalize(filters.solicitante))) return false;
          return matchingNames.has(recordOwnerName(record));
        });
    }
    if (filters.status && !normalize(filters.status).includes('aprov')) expenses = [];
    renderApprovalFinanceCharts(filteredBalances, expenses);
  }

  function installApprovalDashboardFilters() {
    if (!window.App || App.__ccApprovalDashboardFilters20260716) return;
    App.__ccApprovalDashboardFilters20260716 = true;
    const originalLoad = App.loadDespesasDashboard?.bind(App);
    App.loadDespesasDashboard = async function () {
      const result = await originalLoad?.();
      try { await refreshApprovalDashboardFromFilters(); }
      catch (error) { console.warn('Falha ao aplicar filtros completos da aprovação de saldo.', error); }
      return result;
    };
  }

  function updatePersonalDashboard() {
    const user = currentUser();
    if (!user) return;
    const own = list => (Array.isArray(list) ? list : []).filter(item => belongsToUser(item, user));
    const clients = own(scopeByGlobalUnit(Store.getClients?.() || [], 'clientes'));
    const tickets = own(scopeByGlobalUnit(Store.getTickets?.() || [], 'chamados'));
    const expenses = own(scopeByGlobalUnit(window.AppExpensesCache || Store.getExpenses?.() || [], 'despesas'));
    const balances = own(scopeByGlobalUnit(window.AppBalancesCache || Store.getBalanceRequests?.() || [], 'solicitacao-despesas'));
    const approved = balances.filter(isApproved).reduce((sum, item) => sum + approvedBalanceValue(item), 0);
    // Valores pessoais permanecem separados por usuario. O supervisor e os
    // demais vendedores nunca entram nos cartoes do usuario logado.
    const approvedExpenseRows = expenses.filter(isApproved);
    const approvedExpensesAll = approvedExpenseRows.reduce((sum, item) => sum + expenseValue(item), 0);
    const requisitionExpenses = approvedExpenseRows.filter(isRequisitionExpense).reduce((sum, item) => sum + expenseValue(item), 0);
    const approvedExpenses = approvedExpenseRows.filter(item => !isRequisitionExpense(item)).reduce((sum, item) => sum + expenseValue(item), 0);
    // Saldo disponivel considera somente despesas ja aprovadas. Pendentes ficam
    // destacadas separadamente e nao reduzem o saldo antes da aprovacao.
    const spent = approvedExpenses;
    const pendingExpenses = expenses.filter(item => normalize(item.status) === 'pendente').reduce((sum, item) => sum + expenseValue(item), 0);
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    set('dash-pending-approvals', String(clients.filter(item => normalize(item.status) === 'pendente').length));
    set('dash-open-tickets', String(tickets.filter(item => ['aberto', 'em atendimento'].includes(normalize(item.status))).length));
    set('dash-pending-expenses', formatMoney(approvedExpensesAll));
    set('dash-pending-balances', formatMoney(approved - spent));
    const correctionExpenses = expenses.filter(item => normalize(item.status).includes('correc')).length;
    const correctionClients = clients.filter(item => {
      const status = normalize(item.status);
      return status.includes('correc') || status.includes('ajuste');
    }).length;
    const correctionAlert = document.getElementById('dash-corrections-alert');
    const expenseCorrectionButton = document.getElementById('dash-correction-expenses');
    const clientCorrectionButton = document.getElementById('dash-correction-clients');
    if (correctionAlert) correctionAlert.style.display = correctionExpenses || correctionClients ? 'block' : 'none';
    if (expenseCorrectionButton) {
      expenseCorrectionButton.style.display = correctionExpenses ? 'inline-flex' : 'none';
      const count = expenseCorrectionButton.querySelector('[data-count]');
      if (count) count.textContent = String(correctionExpenses);
    }
    if (clientCorrectionButton) {
      clientCorrectionButton.style.display = correctionClients ? 'inline-flex' : 'none';
      const count = clientCorrectionButton.querySelector('[data-count]');
      if (count) count.textContent = String(correctionClients);
    }
    renderDashboardBars('dash-expense-bars', [
      { label: 'Pendentes', value: pendingExpenses },
      { label: 'Aprovadas', value: approvedExpenses },
      { label: 'Requisições', value: requisitionExpenses },
      { label: 'Reprovadas', value: expenses.filter(item => normalize(item.status).includes('reprov')).reduce((sum, item) => sum + expenseValue(item), 0) }
    ], formatMoney);
    renderDashboardBars('dash-balance-bars', [
      { label: 'Pendentes', value: balances.filter(item => normalize(item.status) === 'pendente').length },
      { label: 'Aprovadas', value: balances.filter(isApproved).length },
      { label: 'Reprovadas', value: balances.filter(item => normalize(item.status).includes('reprov')).length }
    ], value => String(value || 0));
  }

  function installDashboardAndExpenseScopes() {
    if (!window.UI || UI.__ccPersonalDashboard20260716) return false;
    UI.__ccPersonalDashboard20260716 = true;
    const originalDashboard = UI.renderDashboard;
    UI.renderDashboard = function () {
      const result = originalDashboard?.apply(this, arguments);
      setTimeout(updatePersonalDashboard, 0);
      return result;
    };
    const originalExpenses = UI.renderExpenses;
    UI.renderExpenses = function () {
      const result = originalExpenses?.apply(this, arguments);
      setTimeout(updateExpenseCardsForLocalFilters, 0);
      return result;
    };
    setTimeout(() => {
      updatePersonalDashboard();
      updateExpenseCardsForLocalFilters();
    }, 50);
    return true;
  }

  function installAll() {
    installExpenseEditing();
    installImageViewer();
    installDirectBalanceCredit();
    if (!installFiltersAndSorting()) setTimeout(installFiltersAndSorting, 250);
    if (!installApprovalHistoryView()) setTimeout(installApprovalHistoryView, 250);
    if (!installDashboardAndExpenseScopes()) setTimeout(installDashboardAndExpenseScopes, 250);
    installApprovalDashboardFilters();

    if (!window.__ccGlobalUnitRefresh20260716) {
      window.__ccGlobalUnitRefresh20260716 = true;
      document.addEventListener('change', event => {
        if (event.target?.id !== 'global-unit-selector') return;
        setTimeout(() => {
          const importedUnit = document.getElementById('imported-equipment-unit');
          const activeUnit = activeGlobalUnitId();
          if (importedUnit && [...importedUnit.options].some(option => option.value === activeUnit)) {
            importedUnit.value = activeUnit;
            window.EquipamentosImportados?.loadList?.();
          }
          if (window.FiltersManager?.configs) {
            Object.keys(FiltersManager.configs).forEach(moduleKey => {
              try {
                rebuildCascadingFilters(moduleKey, '');
                FiltersManager.triggerFiltering(moduleKey);
              } catch (_) {}
            });
          }
          updatePersonalDashboard();
          updateExpenseCardsForLocalFilters();
          UI.updateBalanceCards?.();
          refreshApprovalDashboardFromFilters().catch(error => console.warn('Falha ao atualizar painel financeiro por unidade.', error));
        }, 120);
      }, true);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAll);
  else installAll();
})();
