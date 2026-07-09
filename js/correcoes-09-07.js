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
        var html = '<div data-client-code-row style="margin:8px 0;padding:8px;border:1px solid var(--border-color);border-radius:6px;"><span style="display:block;color:var(--text-muted);font-size:.7rem;font-weight:700;text-transform:uppercase;">CÃ³digo do Cliente</span><strong>'+esc(code)+'</strong></div>';
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
