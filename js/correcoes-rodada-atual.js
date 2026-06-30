/* Correções rodada atual 30/06 - abas, exclusões, aprovação de despesas e PDF em lote */
(function(){
  'use strict';
  if (window.__ccRodadaAtual3006) return; window.__ccRodadaAtual3006 = true;

  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm = (v)=>String(v ?? '').trim().toLowerCase();
  const isPending = (s)=>/pendente|aguardando/i.test(String(s||''));
  const isApproved = (s)=>/aprovad/i.test(String(s||''));
  const num = window.CC_num || ((v)=>{ if(typeof v==='number') return Number.isFinite(v)?v:0; if(!v) return 0; let raw=String(v).replace(/[^0-9,.-]/g,''); if(raw.includes(',')) raw=raw.replace(/\./g,'').replace(',','.'); const n=parseFloat(raw); return Number.isFinite(n)?n:0; });
  const money = window.CC_money || ((v)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v)));
  const dateBR = window.CC_safeDateBR || ((v)=>{ if(!v) return '-'; const iso=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if(iso) return `${iso[3]}/${iso[2]}/${iso[1]}`; return String(v); });
  const user = ()=>Store.getLoggedUser?.() || {};
  const perms = (u=user())=>Array.isArray(u.permissions)?u.permissions:[];
  const isAdmin = (u=user())=>u.profile==='Administrador' || perms(u).includes('Administrador') || perms(u).includes('Administrador (Acesso Total)');
  const canApproveExpense = (u=user())=>isAdmin(u) || u.profile==='Financeiro' || perms(u).includes('Financeiro') || perms(u).includes('Aprovação de Despesas');

  function apiDelete(url){
    if (!window.App?.fetchFromApi) return Promise.resolve();
    return App.fetchFromApi(url,{method:'DELETE'}).catch(e=>{ console.warn('Falha no DELETE API, removendo local se possível:', url, e); });
  }

  function cleanTabs(){
    return; // abas controladas por js/correcao-abas-navegacao-30-06.js
    document.querySelectorAll('.view-tabs').forEach(host=>{
      const original = [...host.querySelectorAll('a,button')];
      const byText = new Map();
      original.forEach(el=>{
        const key=(el.textContent||'').trim();
        if(!key) return;
        if(byText.has(key)) el.remove(); else byText.set(key,el);
      });
      const despesas = byText.get('Despesas de Campo');
      const sol = byText.get('Solicitação de Saldo');
      const aprSaldo = byText.get('Aprovação de Saldo');
      const aprDesp = byText.get('Aprovação de Despesas');
      [despesas,sol,aprSaldo,aprDesp].filter(Boolean).forEach(el=>host.appendChild(el));
      if (despesas) {
        despesas.href = '#despesas';
        despesas.onclick = function(){ sessionStorage.removeItem('cc_expense_approval_mode'); setTimeout(()=>App.loadExpenses?.(),60); };
      }
      if (aprDesp) {
        aprDesp.href = '#despesas';
        aprDesp.style.display = canApproveExpense() ? 'flex' : 'none';
        aprDesp.onclick = function(){ sessionStorage.setItem('cc_expense_approval_mode','1'); setTimeout(()=>App.loadExpenses?.(),60); };
      }
      const approvalMode = sessionStorage.getItem('cc_expense_approval_mode')==='1' && location.hash==='#despesas';
      [despesas,sol,aprSaldo,aprDesp].filter(Boolean).forEach(el=>el.classList.remove('active'));
      if (approvalMode && aprDesp) aprDesp.classList.add('active');
      else if (location.hash==='#despesas' && despesas) despesas.classList.add('active');
      else [sol,aprSaldo].filter(Boolean).forEach(el=>{ if(el.getAttribute('href')===location.hash) el.classList.add('active'); });
    });
  }

  // Aprovação de despesas deve mostrar só pendentes e sem formulário de registro.
  if (window.App?.loadExpenses && !App.__ccLoadExpensesAtual) {
    const oldLoadExpenses = App.loadExpenses.bind(App); App.__ccLoadExpensesAtual = true;
    App.loadExpenses = async function(){
      const ret = await oldLoadExpenses();
      setTimeout(()=>{
        const mode = sessionStorage.getItem('cc_expense_approval_mode')==='1' && location.hash==='#despesas';
        const all = window.AppExpensesCache || Store.getExpenses?.() || [];
        if (mode) {
          UI.renderExpenses((all||[]).filter(e=>isPending(e.status)));
          const title = document.querySelector('#view-despesas h1, #view-despesas .page-title'); if (title) title.textContent='Aprovação de Despesas';
          const regCard = [...document.querySelectorAll('#view-despesas .card, #view-despesas .panel, #view-despesas section')].find(el=>/Registrar Despesas de Viagem/i.test(el.textContent||''));
          if (regCard) regCard.style.display='none';
        }
        cleanTabs(); enhanceBulkActions();
      },120);
      return ret;
    };
  }

  function listApiInfo(tbodyId){
    return {
      'expenses-table-body': { get:'getExpenses', save:'saveExpenses', endpoint:'/api/despesas-reembolsos', reload:()=>App.loadExpenses?.(), selector:(x)=>x.id },
      'clients-table-body': { get:'getClients', save:'saveClients', endpoint:'/api/clientes', reload:()=>App.refreshAllLists?.(), selector:(x)=>x.id },
      'tickets-table-body': { get:'getTickets', save:'saveTickets', endpoint:'/api/chamados', reload:()=>App.loadTickets?.(), selector:(x)=>x.id },
      'prospects-table-body': { get:'getProspects', save:'saveProspects', endpoint:'/api/prospeccoes', reload:()=>App.loadProspects?.(), selector:(x)=>x.id },
      'balances-table-body': { get:'getBalanceRequests', save:'saveBalances', endpoint:'/api/despesas', reload:()=>App.refreshAllLists?.(), selector:(x)=>x.id }
    }[tbodyId];
  }
  function extractRowId(tr){
    if (tr.dataset.id) return tr.dataset.id;
    const oc = tr.getAttribute('onclick') || '';
    let m = oc.match(/['"]([^'"]+)['"]/); if (m) return m[1];
    const btn = tr.querySelector('button[onclick],a[onclick],select[onchange]');
    m = (btn?.getAttribute('onclick') || btn?.getAttribute('onchange') || '').match(/['"]([^'"]+)['"]/); if (m) return m[1];
    const first = tr.children[0]?.textContent?.replace('#','').trim(); return first || '';
  }
  function enhanceTableBulk(tbodyId){
    const tbody = document.getElementById(tbodyId); if(!tbody) return;
    const info = listApiInfo(tbodyId); if(!info) return;
    const table = tbody.closest('table'); if(!table) return;
    const headRow = table.querySelector('thead tr'); if(!headRow) return;
    if (!headRow.querySelector('.cc-bulk-all')) headRow.insertAdjacentHTML('afterbegin','<th style="width:34px;"><input type="checkbox" class="cc-bulk-all" title="Selecionar todos"></th>');
    [...tbody.querySelectorAll('tr')].forEach(tr=>{
      if(tr.querySelector('.cc-bulk-row')) return;
      const id = extractRowId(tr);
      tr.dataset.id = id;
      tr.insertAdjacentHTML('afterbegin',`<td onclick="event.stopPropagation()" style="width:34px;"><input type="checkbox" class="cc-bulk-row" value="${esc(id)}"></td>`);
    });
    let btn = table.parentElement.querySelector('.cc-bulk-delete-btn');
    if(!btn){
      btn=document.createElement('button'); btn.className='btn btn-danger btn-sm cc-bulk-delete-btn'; btn.textContent='Excluir Selecionados'; btn.style.cssText='display:none;margin:8px 0;float:right;'; table.parentElement.insertBefore(btn,table);
    }
    const update=()=>{ const n=tbody.querySelectorAll('.cc-bulk-row:checked').length; btn.style.display=n?'inline-block':'none'; };
    if(!table.dataset.ccBulkBound){
      table.dataset.ccBulkBound='1';
      table.addEventListener('change',e=>{
        if(e.target.classList.contains('cc-bulk-all')) tbody.querySelectorAll('.cc-bulk-row').forEach(c=>c.checked=e.target.checked);
        update();
      });
    }
    btn.onclick = async ()=>{
      if(!isAdmin()) return alert('Somente administrador pode excluir registros.');
      const ids=[...tbody.querySelectorAll('.cc-bulk-row:checked')].map(c=>String(c.value)).filter(Boolean);
      if(!ids.length) return;
      if(!confirm(`Excluir ${ids.length} registro(s) selecionado(s)?`)) return;
      for(const id of ids) await apiDelete(`${info.endpoint}/${encodeURIComponent(id)}`);
      if(Store[info.get] && Store[info.save]){
        const list=(Store[info.get]()||[]).filter(x=>!ids.includes(String(info.selector(x)))); Store[info.save](list);
      }
      info.reload?.(); App.refreshAllLists?.(); setTimeout(()=>{enhanceBulkActions(); UI.updateBalanceCards?.();},250);
    };
    update();
  }
  function enhanceProspectsId(){
    const cont=document.getElementById('prospect-list-container'); const tbody=cont?.querySelector('tbody'); if(tbody && !tbody.id) tbody.id='prospects-table-body';
    if(tbody){
      [...tbody.querySelectorAll('tr')].forEach(tr=>{ if(!tr.dataset.id) tr.dataset.id=extractRowId(tr); });
    }
  }
  function enhanceBulkActions(){
    enhanceProspectsId();
    ['expenses-table-body','clients-table-body','tickets-table-body','prospects-table-body'].forEach(enhanceTableBulk);
  }

  // Exclusão individual real de leads com API + local.
  if (window.App && !App.__ccDeleteProspectAtual) {
    App.__ccDeleteProspectAtual = true;
    App.deleteProspectReal = async function(id){
      if(!isAdmin()) return alert('Somente administrador pode excluir registros.');
      if(!confirm('Deseja excluir permanentemente este lead de prospecção?')) return;
      await apiDelete(`/api/prospeccoes/${encodeURIComponent(id)}`);
      Store.saveProspects((Store.getProspects?.()||[]).filter(p=>String(p.id)!==String(id)));
      await App.loadProspects?.(); App.refreshAllLists?.(); App.showToast?.('Lead removido permanentemente!');
    };
  }

  // PDF individual: tabela com largura fixa e assinatura sem sobreposição.
  if (window.App && !App.__ccPdfSaldoAtual) {
    App.__ccPdfSaldoAtual = true;
    App.generateBalanceRequestPdf = async function(id){
      try{
        const data = await this.fetchFromApi(`/api/despesas/${encodeURIComponent(id)}`);
        const itens = Array.isArray(data.itens)?data.itens:[];
        const rows = itens.map(item=>`<tr><td class="desc">${esc(item.categoria||item.descricao||'-')}</td><td class="qtd">${esc(item.quantidade_solicitada??'-')}</td><td class="qtd">${esc(item.quantidade_aprovada??'-')}</td><td class="valor">${money(item.valor_solicitado)}</td><td class="valor">${item.valor_aprovado==null?'-':money(item.valor_aprovado)}</td><td class="status">${esc(item.status||'-')}</td><td class="just">${esc(item.justificativa||'-')}</td></tr>`).join('');
        const totalSol = itens.reduce((s,i)=>s+num(i.valor_solicitado),0) || num(data.totalGeral);
        const totalApr = itens.reduce((s,i)=>s+num(i.valor_aprovado),0);
        const html = buildSaldoPdfHtml([data], rows, totalSol, totalApr, `SOLICITAÇÃO DE SALDO / ADIANTAMENTO DE SALDO`);
        const w=window.open('','_blank'); w.document.write(html); w.document.close();
      }catch(e){ alert('Erro ao gerar PDF: '+e.message); }
    };
  }
  function buildSaldoPdfHtml(requests, rowsSingle, totalSolSingle, totalAprSingle, title){
    const blocks = requests.map((data,idx)=>{
      const itens = Array.isArray(data.itens)?data.itens:[];
      const rows = rowsSingle && requests.length===1 ? rowsSingle : itens.map(item=>`<tr><td class="desc">${esc(item.categoria||item.descricao||'-')}</td><td class="qtd">${esc(item.quantidade_solicitada??'-')}</td><td class="qtd">${esc(item.quantidade_aprovada??'-')}</td><td class="valor">${money(item.valor_solicitado)}</td><td class="valor">${item.valor_aprovado==null?'-':money(item.valor_aprovado)}</td><td class="status">${esc(item.status||'-')}</td><td class="just">${esc(item.justificativa||'-')}</td></tr>`).join('');
      const totalSol = requests.length===1 && totalSolSingle!=null ? totalSolSingle : (itens.reduce((s,i)=>s+num(i.valor_solicitado),0)||num(data.totalGeral));
      const totalApr = requests.length===1 && totalAprSingle!=null ? totalAprSingle : itens.reduce((s,i)=>s+num(i.valor_aprovado),0);
      return `<section class="solicitacao ${idx?'page-break':''}"><div class="meta"><div><b>Solicitação ID:</b> #${esc(data.id)}</div><div><b>Emissão:</b> ${new Date().toLocaleString('pt-BR')}</div><div><b>Status:</b> ${esc(data.status||'-')}</div><div><b>Empresa:</b> ${esc(data.empresa||data.unitName||UI.getUnitName?.(data.unitId)||'-')}</div></div><hr><h2>DADOS OPERACIONAIS</h2><div class="grid"><div><b>Solicitante:</b> ${esc(data.solicitante||data.nome_solicitante||'-')}</div><div><b>Placa do Veículo:</b> ${esc(data.placa_veiculo||'-')}</div><div><b>Rota / Cidades Destino:</b> ${esc(data.rota_destino||'-')}</div><div><b>Data/Hora:</b> ${esc(dateBR(data.data_solicitacao||data.created_at))} ${esc(data.hora_solicitacao||'')}</div></div><h3>JUSTIFICATIVA:</h3><p>${esc(data.justificativa||'-')}</p><table><thead><tr><th class="desc">Item / Descrição</th><th class="qtd">Qtd S.</th><th class="qtd">Qtd A.</th><th class="valor">Vl. Sol.</th><th class="valor">Vl. Apr.</th><th class="status">Status</th><th class="just">Justificativa</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3"><b>VALORES TOTAIS</b></td><td class="valor"><b>${money(totalSol)}</b></td><td class="valor"><b>${money(totalApr)}</b></td><td colspan="2"></td></tr></tfoot></table><div class="assinatura"><h3>PARECER DO APROVADOR</h3><div class="campo"></div><div class="line"><b>Aprovado por:</b> __________________________________________</div><div class="line"><b>Cargo:</b> _________________________________________________</div><div class="line"><b>Assinatura:</b> ____________________________________________</div><div class="line"><b>Data:</b> ____ / ____ / ______</div></div></section>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;margin:0;color:#111}.top{background:#2563eb;color:white;padding:24px 28px;font-size:20px;font-weight:bold}.wrap{padding:26px}.meta,.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 38px}.solicitacao{max-width:980px;margin:0 auto 32px}.page-break{page-break-before:always}hr{border:0;border-top:4px solid #e5e7eb;margin:18px 0}h2{font-size:16px;margin:18px 0}h3{font-size:14px;margin:20px 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:20px}th,td{padding:9px 10px;border-bottom:1px solid #ddd;vertical-align:top;font-size:12px;word-break:break-word;overflow-wrap:anywhere}th{background:#f0f0f0;text-align:left}.desc{width:24%}.qtd{width:7%;text-align:center}.valor{width:12%;text-align:right;white-space:nowrap}.status{width:16%}.just{width:22%}.assinatura{margin-top:36px;border-top:3px solid #e5e7eb;padding-top:18px}.campo{height:48px;border-bottom:1px solid #999;margin-bottom:18px}.line{margin-top:18px}.print{margin:14px 0 0 26px}@media print{.print{display:none}.top{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><button class="print" onclick="window.print()">Imprimir</button><div class="top">${esc(title)}</div><div class="wrap">${blocks}</div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`;
  }

  // PDF em lote para Solicitações de Saldo com filtros simples/dinâmicos.
  function ensureBatchPdfButton(){
    const body = document.getElementById('despesas-solicitacoes-table-body'); if(!body) return;
    const card = body.closest('.card, .panel, section, div'); if(!card || document.getElementById('btn-pdf-lote-saldo')) return;
    const btn=document.createElement('button'); btn.id='btn-pdf-lote-saldo'; btn.className='btn btn-success btn-sm'; btn.textContent='Gerar PDF em Lote'; btn.style.cssText='float:right;margin:0 0 10px 8px;';
    btn.onclick=showBatchPdfModal; card.insertBefore(btn, card.querySelector('table') || card.firstChild);
  }
  async function showBatchPdfModal(){
    const solicitantes=[...new Set((window.AppBalancesCache||Store.getBalanceRequests?.()||[]).map(x=>x.solicitante||x.nome_solicitante).filter(Boolean))];
    const statuses=[...new Set((window.AppBalancesCache||Store.getBalanceRequests?.()||[]).map(x=>x.status).filter(Boolean))];
    const html=`<div id="modal-pdf-lote-saldo" class="modal" style="display:flex;"><div class="login-card" style="max-width:640px;width:95%;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;"><h2 style="margin:0;color:var(--primary-color);">PDF em Lote - Solicitações</h2><button class="btn btn-secondary" onclick="document.getElementById('modal-pdf-lote-saldo').remove()">Fechar</button></div><div class="form-grid two-columns"><div class="form-group"><label>Data inicial</label><input id="pdf-lote-inicio" type="date"></div><div class="form-group"><label>Data final</label><input id="pdf-lote-fim" type="date"></div><div class="form-group"><label>Solicitante</label><select id="pdf-lote-solicitante"><option value="">Todos</option>${solicitantes.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div><div class="form-group"><label>Status</label><select id="pdf-lote-status"><option value="">Todos</option>${statuses.map(s=>`<option>${esc(s)}</option>`).join('')}<option value="Pendente">Pendente</option><option value="Aprovada">Aprovada</option><option value="Reprovada">Reprovada</option></select></div><div class="form-group"><label>Placa</label><input id="pdf-lote-placa" placeholder="Ex: SYY3E48"></div><div class="form-group"><label>Rota/Destino</label><input id="pdf-lote-rota" placeholder="Ex: gv"></div></div><button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="App.generateBatchBalancePdf()">Gerar PDF</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend',html);
  }
  if(window.App) App.generateBatchBalancePdf = async function(){
    try{
      const inicio=document.getElementById('pdf-lote-inicio')?.value; const fim=document.getElementById('pdf-lote-fim')?.value; const sol=norm(document.getElementById('pdf-lote-solicitante')?.value); const st=norm(document.getElementById('pdf-lote-status')?.value); const placa=norm(document.getElementById('pdf-lote-placa')?.value); const rota=norm(document.getElementById('pdf-lote-rota')?.value);
      let list=window.AppBalancesCache || await this.fetchFromApi('/api/despesas');
      list=(Array.isArray(list)?list:[]).filter(x=>{
        const d=String(x.data_solicitacao||x.created_at||x.date||'').slice(0,10);
        if(inicio && d<inicio) return false; if(fim && d>fim) return false;
        if(sol && norm(x.solicitante||x.nome_solicitante)!==sol) return false;
        if(st && !norm(x.status).includes(st.replace('aprovada','aprovad'))) return false;
        if(placa && !norm(x.placa_veiculo).includes(placa)) return false;
        if(rota && !norm(x.rota_destino).includes(rota)) return false;
        return true;
      });
      const detailed=[]; for(const x of list){ try{ detailed.push(await this.fetchFromApi(`/api/despesas/${encodeURIComponent(x.id)}`)); } catch(e){ detailed.push(x); } }
      if(!detailed.length) return alert('Nenhuma solicitação encontrada para os filtros informados.');
      const w=window.open('','_blank'); w.document.write(buildSaldoPdfHtml(detailed,null,null,null,'RELATÓRIO EM LOTE - SOLICITAÇÕES DE SALDO')); w.document.close(); document.getElementById('modal-pdf-lote-saldo')?.remove();
    }catch(e){ alert('Erro ao gerar PDF em lote: '+e.message); }
  };

  const oldRoute = window.App?.onRouteChanged?.bind(App);
  if(oldRoute && !App.__ccRouteAtual){ App.__ccRouteAtual=true; App.onRouteChanged=function(hash){ if(hash!=='#despesas') sessionStorage.removeItem('cc_expense_approval_mode'); const r=oldRoute(hash); setTimeout(()=>{cleanTabs();enhanceBulkActions();ensureBatchPdfButton();},150); return r; }; }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{cleanTabs();enhanceBulkActions();ensureBatchPdfButton();},900));
  new MutationObserver(()=>setTimeout(()=>{enhanceBulkActions();ensureBatchPdfButton();},120)).observe(document.documentElement,{childList:true,subtree:true});
})();
