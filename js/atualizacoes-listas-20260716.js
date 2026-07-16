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

  function showExistingPreview(kind, source) {
    const preview = document.getElementById(kind === 'receipt' ? 'preview-comprovante' : 'preview-odometro');
    const image = document.getElementById(kind === 'receipt' ? 'img-preview-comprovante' : 'img-preview-odometro');
    const finalSource = (window.TempPhotosCache && window.TempPhotosCache[source]) || source;
    if (!preview || !image) return;
    preview.style.display = finalSource ? 'block' : 'none';
    image.src = finalSource || '';
    image.onclick = finalSource ? () => App.showFacadeImage(finalSource) : null;
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
    if (receipt) { receipt.value = ''; receipt.required = !record.foto_comprovante; }
    if (odometer) { odometer.value = ''; odometer.required = false; }
    updateExpenseConditionalFields();
    showExistingPreview('receipt', record.foto_comprovante);
    showExistingPreview('odometer', record.foto_odometro);
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
          foto_odometro: await uploadSelectedFile('exp-odometro-img', original.foto_odometro),
          foto_comprovante: await uploadSelectedFile('exp-comprovante-img', original.foto_comprovante)
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
    return profile === 'administrador' || profile === 'financeiro' || profile === 'responsavel financeiro'
      || permissions.some(permission => [
        'financeiro', 'aprovacao de saldo', 'aprovacao de despesas', 'administrador'
      ].includes(normalize(permission)));
  }

  function createDirectBalanceModal() {
    let modal = document.getElementById('cc-direct-balance-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'cc-direct-balance-modal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="login-card" style="max-width:620px;width:min(94vw,620px);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px;">
          <div><h2 style="margin:0;color:var(--primary-color);">Lançar saldo direto</h2><small style="color:var(--text-muted);">Sem solicitação prévia do vendedor</small></div>
          <button type="button" class="btn btn-secondary" data-direct-close>Fechar</button>
        </div>
        <form id="cc-direct-balance-form">
          <div class="form-group"><label for="cc-direct-vendor">Vendedor</label><select id="cc-direct-vendor" required><option value="">Carregando vendedores...</option></select></div>
          <div class="form-grid two-columns">
            <div class="form-group"><label for="cc-direct-start">Início do período</label><input id="cc-direct-start" type="date" required></div>
            <div class="form-group"><label for="cc-direct-end">Fim do período</label><input id="cc-direct-end" type="date" required></div>
          </div>
          <div class="form-group"><label for="cc-direct-amount">Valor do saldo</label><input id="cc-direct-amount" type="number" min="0.01" max="99999999.99" step="0.01" inputmode="decimal" placeholder="0,00" required></div>
          <div class="form-group"><label for="cc-direct-observation">Observação</label><textarea id="cc-direct-observation" maxlength="1000" rows="3" placeholder="Motivo ou referência do lançamento (opcional)"></textarea></div>
          <div style="padding:10px 12px;border-radius:8px;background:rgba(245,158,11,.12);color:var(--warning);font-size:.82rem;margin-bottom:16px;">O saldo será lançado como aprovado e ficará registrado na auditoria.</div>
          <button class="btn btn-primary" type="submit" style="width:100%;">Confirmar lançamento</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-direct-close]').addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', event => { if (event.target === modal) modal.style.display = 'none'; });
    modal.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const vendorSelect = document.getElementById('cc-direct-vendor');
      const amount = Number(document.getElementById('cc-direct-amount').value);
      const periodStart = document.getElementById('cc-direct-start').value;
      const periodEnd = document.getElementById('cc-direct-end').value;
      if (!vendorSelect.value || !periodStart || !periodEnd || !(amount > 0)) return;
      const vendorName = vendorSelect.options[vendorSelect.selectedIndex]?.textContent || 'o vendedor';
      if (!window.confirm(`Confirma o lançamento de ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para ${vendorName}?`)) return;
      button.disabled = true;
      button.textContent = 'Lançando...';
      try {
        await api('/api/despesas/direct-credit', {
          method: 'POST',
          body: JSON.stringify({
            vendor_id: vendorSelect.value,
            period_start: periodStart,
            period_end: periodEnd,
            amount,
            observation: document.getElementById('cc-direct-observation').value.trim()
          })
        });
        modal.style.display = 'none';
        form.reset();
        App.showToast?.('Saldo lançado diretamente com sucesso!');
        await App.loadDespesasDashboard?.();
        await App.loadBalances?.();
      } catch (error) {
        alert(`Não foi possível lançar o saldo: ${error.message}`);
      } finally {
        button.disabled = false;
        button.textContent = 'Confirmar lançamento';
      }
    });
    return modal;
  }

  async function openDirectBalanceModal() {
    const modal = createDirectBalanceModal();
    const select = modal.querySelector('#cc-direct-vendor');
    select.innerHTML = '<option value="">Carregando vendedores...</option>';
    modal.style.display = 'flex';
    const today = new Date();
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    modal.querySelector('#cc-direct-start').value = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
    modal.querySelector('#cc-direct-end').value = localDate(today);
    try {
      const vendors = await api('/api/usuarios/vendedores');
      select.innerHTML = `<option value="">Selecione o vendedor</option>${(vendors || []).map(vendor => `<option value="${escapeHtml(vendor.id)}">${escapeHtml(vendor.name)}${vendor.unitId ? ` — ${escapeHtml(vendor.unitId)}` : ''}</option>`).join('')}`;
    } catch (error) {
      select.innerHTML = '<option value="">Erro ao carregar vendedores</option>';
      App.showToast?.('Erro ao carregar vendedores.');
    }
  }

  function installDirectBalanceCredit() {
    if (!canLaunchDirectBalance()) return;
    const ensureButton = () => {
      if (window.location.hash !== '#despesas-dashboard' || document.getElementById('cc-btn-direct-balance')) return;
      const tabs = document.querySelector('#tab-balance-approvals-dashboard')?.closest('.view-tabs');
      if (!tabs) return;
      const button = document.createElement('button');
      button.id = 'cc-btn-direct-balance';
      button.type = 'button';
      button.className = 'btn btn-primary';
      button.style.marginLeft = 'auto';
      button.textContent = '+ Lançar saldo direto';
      button.addEventListener('click', openDirectBalanceModal);
      tabs.appendChild(button);
    };
    ensureButton();
    window.addEventListener('hashchange', () => setTimeout(ensureButton, 80));
    new MutationObserver(ensureButton).observe(document.body, { childList: true, subtree: true });
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

  function rebuildCascadingFilters(moduleKey, preserveField) {
    const manager = window.FiltersManager;
    const config = manager?.configs?.[moduleKey];
    const panel = filterPanel(moduleKey);
    if (!config || !panel || !baseFilterData) return;
    const data = Array.isArray(manager.caches[moduleKey]) ? manager.caches[moduleKey] : [];
    const selects = [...panel.querySelectorAll('select.select-ctrl[data-field]')];
    const readFilters = () => manager.getFilterValues(moduleKey);
    const valuesFor = (field, filters) => {
      const withoutSelf = { ...filters, [field]: '' };
      return [...new Set(baseFilterData(data, withoutSelf, moduleKey)
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
        sortState[moduleKey] = { key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc' };
        updateSortHeaders(moduleKey);
        FiltersManager.triggerFiltering(moduleKey);
      };
      header.addEventListener('click', activate);
      header.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      });
    });
  }

  function installFiltersAndSorting() {
    if (!window.FiltersManager || FiltersManager.__ccDynamicSort20260716) return false;
    FiltersManager.__ccDynamicSort20260716 = true;
    baseFilterData = FiltersManager.filterData.bind(FiltersManager);
    const originalEnsure = FiltersManager.ensureFilterPanel.bind(FiltersManager);
    const originalTrigger = FiltersManager.triggerFiltering.bind(FiltersManager);

    FiltersManager.filterData = function (data, filters, moduleKey) {
      return applySort(baseFilterData(data, filters, moduleKey), moduleKey);
    };
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
        Object.keys(FiltersManager.configs).forEach(moduleKey => updateSortHeaders(moduleKey));
      });
    };
    new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
    Object.keys(FiltersManager.configs).forEach(moduleKey => {
      try { FiltersManager.ensureFilterPanel(moduleKey); } catch (_) {}
      updateSortHeaders(moduleKey);
    });
    return true;
  }

  function installAll() {
    installExpenseEditing();
    installImageViewer();
    installDirectBalanceCredit();
    if (!installFiltersAndSorting()) setTimeout(installFiltersAndSorting, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAll);
  else installAll();
})();
