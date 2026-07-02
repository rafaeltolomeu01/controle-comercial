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

  function sellerName(id){
    try { return (window.UI && UI.getUserName) ? UI.getUserName(id) : (id || '-'); } catch (_) { return id || '-'; }
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
        <td data-label="CNPJ">${esc(c.cnpj || '-')}</td>
        <td data-label="Categoria">${esc(c.category || c.categoria || 'Não definida')}</td>
        <td data-label="Telefone">${esc(c.phone || c.telefone || '-')}</td>
        <td data-label="E-mail">${esc(c.email || '-')}</td>
        <td data-label="Unidade"><span class="badge-status badge-primary" style="font-size:.7rem;font-weight:500;">${esc(unitName(c.unitId))}</span></td>
        <td data-label="Vendedor"><span style="font-size:.75rem;color:var(--text-muted);">${esc(sellerName(ownerId(c)))}</span></td>
        <td data-label="Score">${esc(scoreText(c))}</td>
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
        <td data-label="Vendedor"><span style="font-size:.75rem;color:var(--text-muted);">${esc(sellerName(ownerId(c)))}</span></td>
        <td data-label="Score">${esc(scoreText(c))}</td>
        <td data-label="Status">${statusBadge(c)}</td>
        <td data-label="Ações">${actions}</td>
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
    const result = {
      fachada: existingClient.photoFachada || '',
      interna01: existingClient.photoInterna01 || '',
      interna02: existingClient.photoInterna02 || '',
      interna03: existingClient.photoInterna03 || '',
      rua01: existingClient.photoRua01 || '',
      rua02: existingClient.photoRua02 || '',
      cnpj: existingClient.photoCnpj || ''
    };
    if (!window.App || !App.compressImageAndGetBase64 || !App.uploadBase64ToDatabase) return result;
    const cnpjVal = digits(document.getElementById('client-cnpj')?.value) || digits(existingClient.cnpj) || '00000000000000';
    for (const suffix of suffixes) {
      const fileInput = document.getElementById(`client-photo-${suffix}`);
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) continue;
      try {
        const base64 = await App.compressImageAndGetBase64(file);
        const url = await App.uploadBase64ToDatabase(base64, `cliente-${cnpjVal}-${suffix}-${file.name || 'foto'}`, 'clientes');
        if (url) result[suffix] = url;
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
        predictedAverage: parseFloat(document.getElementById('client-predicted-average')?.value || '0') || 0,
        firstOrderValue: parseFloat(document.getElementById('client-first-order-value')?.value || '0') || 0,
        firstOrderPayment: document.getElementById('client-first-order-payment')?.value || '',
        firstOrderReason: document.getElementById('client-first-order-reason')?.value || '',
        repurchasePayment: document.getElementById('client-repurchase-payment')?.value || '',
        hasBonus: document.getElementById('client-has-bonus')?.value || '',
        bonusValue: parseFloat(document.getElementById('client-bonus-value')?.value || '0') || 0,
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
    const local = updateLocalClientStatus(id, status, reason, { correctionRequested: !!sendToCorrection });
    const payload = { status, reason: reason || '', sendToCorrection: !!sendToCorrection };
    if (window.Store && Store.backendRequest && Store.getToken && Store.getToken()) {
      try {
        const resp = await Store.backendRequest(`/api/clientes-aprovacao/${encodeURIComponent(id)}/status`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (resp && Array.isArray(resp.clients) && window.Store && Store.saveClients) {
          // Atualiza o cache local com o retorno autorizado do banco.
          Store.saveClients(resp.clients);
        }
        return resp;
      } catch (err) {
        // Compatibilidade com Render ainda não atualizado: usa a rota antiga /api/store/clients.
        if (local && local.clients) {
          await saveClientsRemote(local.clients);
          return { success: true, fallback: true, client: local.updated };
        }
        throw err;
      }
    }
    if (local && local.clients) await saveClientsRemote(local.clients);
    return { success: true, localOnly: true, client: local && local.updated };
  }

  function patchApp(){
    if (!window.App || App.__ccApprovalFlowPatched2) return;
    App.__ccApprovalFlowPatched2 = true;

    App.approveClient = async function(id, newStatus){
      const user = currentUser();
      if (!canApproveClients(user)) return alert('Somente administrador ou usuário autorizado para liberação/movimentação de equipamentos pode aprovar ou reprovar clientes.');
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
        await updateClientApprovalOnServer(id, 'Aprovado', '', false);
        if (window.App && App.refreshAllLists) App.refreshAllLists();
        showToast('Cadastro aprovado e salvo no banco!');
      } catch (err) {
        alert('Não foi possível salvar a aprovação no banco: ' + (err.message || err));
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
      const reason = document.getElementById('modal-rejection-select')?.value || 'Correção necessária';
      const notes = document.getElementById('modal-rejection-notes')?.value.trim() || '';
      const sendToCorrection = !!document.getElementById('modal-rejection-send-to-correction')?.checked;
      const finalStatus = sendToCorrection ? 'Aguardando Ajuste' : 'Reprovado';
      const fullReason = reason + (notes ? ' — ' + notes : '');
      try {
        await updateClientApprovalOnServer(id, finalStatus, fullReason, sendToCorrection);
        const modal = document.getElementById('modal-rejection-reason');
        if (modal) modal.style.display = 'none';
        form.reset();
        if (window.App && App.refreshAllLists) App.refreshAllLists();
        showToast(sendToCorrection ? 'Cadastro enviado para correção do vendedor e salvo no banco!' : 'Cadastro reprovado e salvo no banco!');
      } catch (err) {
        alert('Não foi possível salvar a reprovação/correção no banco: ' + (err.message || err));
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
  setInterval(start, 3000);
})();
