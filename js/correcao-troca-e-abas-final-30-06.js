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
