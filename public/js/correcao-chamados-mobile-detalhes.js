/* Correção: cards mobile e detalhes completos de chamados mecânicos */
(function(){
  'use strict';
  if (window.__ccChamadosMobileDetalhes) return;
  window.__ccChamadosMobileDetalhes = true;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function validUrl(url) {
    const v = String(url || '').trim();
    return !!v && !['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].includes(v);
  }
  function getSellerName(ticket) {
    return ticket.seller || (window.UI && UI.getUserName ? UI.getUserName(ticket.userId) : ticket.userId) || '';
  }
  function getUnitName(ticket) {
    return ticket.unit || (window.UI && UI.getUnitName ? UI.getUnitName(ticket.unitId) : ticket.unitId) || '';
  }
  function statusClass(status) {
    if (status === 'Resolvido') return 'badge-success';
    if (status === 'Em Atendimento') return 'badge-primary';
    return 'badge-warning';
  }
  function priorityClass(priority) {
    if (priority === 'Alta') return 'badge-danger';
    if (priority === 'Média') return 'badge-warning';
    return 'badge-primary';
  }
  function mediaItems(ticket) {
    const items = [];
    if (validUrl(ticket.defectPhoto)) items.push({ url: ticket.defectPhoto, label: 'Foto do Defeito', kind: 'image' });
    if (validUrl(ticket.defectVideo)) items.push({ url: ticket.defectVideo, label: 'Vídeo do Defeito', kind: 'video' });
    if (validUrl(ticket.fotoAntes)) items.push({ url: ticket.fotoAntes, label: 'Foto Antes', kind: 'image' });
    if (validUrl(ticket.fotoDepois)) items.push({ url: ticket.fotoDepois, label: 'Foto Depois', kind: 'image' });
    if (validUrl(ticket.fotoPlaqueta)) items.push({ url: ticket.fotoPlaqueta, label: 'Foto Plaqueta', kind: 'image' });
    if (validUrl(ticket.videoAtendimento)) items.push({ url: ticket.videoAtendimento, label: 'Vídeo Atendimento', kind: 'video' });
    return items;
  }
  function row(label, value) {
    const has = value !== undefined && value !== null && String(value).trim() !== '';
    return '<div style=\"display:grid;grid-template-columns:minmax(120px,38%) 1fr;gap:14px;border-bottom:1px solid var(--border-color);padding:9px 0;align-items:start;\"><strong style=\"color:var(--text-muted);\">' + esc(label) + '</strong><span style=\"text-align:right;white-space:pre-wrap;word-break:break-word;\">' + (has ? esc(value) : '—') + '</span></div>';
  }
  function section(title) {
    return '<h4 style=\"margin:16px 0 6px;color:var(--primary-color);font-size:.92rem;border-bottom:1px solid rgba(37,99,235,.35);padding-bottom:6px;\">' + esc(title) + '</h4>';
  }
  function actionButton(ticket, isStaff) {
    if (ticket.status === 'Aberto') return isStaff ? '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.startTicketService(\'' + esc(ticket.id) + '\')\">INICIAR ATENDIMENTO</button>' : '<span style=\"font-size:.75rem;color:var(--text-muted);\">Aberto</span>';
    if (ticket.status === 'Em Atendimento') return isStaff ? '<button class=\"btn btn-success btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\">FICHA TÉCNICA</button>' : '<span style=\"font-size:.75rem;color:var(--text-muted);\">Em Atendimento</span>';
    return '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\">VER LAUDO</button>';
  }
  function partsHtml(values, color, bg) {
    const list = Array.isArray(values) ? values : [];
    if (!list.length) return '<span style=\"color:var(--text-muted);font-size:.75rem;\">—</span>';
    return list.map(function(v){ return '<span style=\"display:inline-block;background:' + bg + ';color:' + color + ';border-radius:10px;padding:1px 7px;font-size:.68rem;margin:1px;\">' + esc(v) + '</span>'; }).join(' ');
  }
  function installRenderTickets(){
    if (!window.UI || !window.Store) return false;
    UI.renderTickets = function(tickets) {
      const activeUnitId = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
      const user = Store.getLoggedUser ? Store.getLoggedUser() : null;
      let list = Array.isArray(tickets) ? tickets.slice() : [];
      if (activeUnitId !== 'all') list = list.filter(t => t.unitId === activeUnitId);
      if (user && user.profile === 'Vendedor') list = list.filter(t => String(t.userId) === String(user.id));
      const body = document.getElementById('tickets-table-body');
      if (!body) return;
      const isStaff = user && ['Administrador','Responsável Equipamentos','Mecânico'].includes(user.profile);
      body.innerHTML = list.map(function(ticket){
        const seller = getSellerName(ticket) || '—';
        const unit = getUnitName(ticket) || '—';
        const clientMain = ticket.fantasyName || ticket.client || '—';
        const clientSub = [ticket.client && ticket.fantasyName ? ticket.client : '', ticket.city].filter(Boolean).join(' • ');
        const equipSub = [ticket.equipmentType, ticket.city].filter(Boolean).join(' • ');
        const mediaCount = mediaItems(ticket).length;
        const mediaBadge = mediaCount ? '<span style=\"display:inline-flex;border:1px solid rgba(37,99,235,.35);color:var(--primary-color);border-radius:999px;padding:2px 8px;font-size:.68rem;font-weight:700;white-space:nowrap;\">' + mediaCount + ' anexo' + (mediaCount > 1 ? 's' : '') + '</span>' : '';
        const statusAfterStyle = ticket.eqStatusAfter === 'Funcionando normalmente' ? 'color:var(--success);' : (ticket.eqStatusAfter === 'Funcionando parcialmente' ? 'color:var(--warning);' : ((ticket.eqStatusAfter === 'Aguardando peça' || ticket.eqStatusAfter === 'Aguardando troca') ? 'color:var(--danger);' : ''));
        return '<tr class=\"mobile-summary-row\" onclick=\"App.showTicketDetails(\'' + esc(ticket.id) + '\')\">' +
          '<td data-label=\"Chamado\" style=\"font-family:monospace;font-weight:700;\">' + esc(ticket.id) + '</td>' +
          '<td data-label=\"Data\" style=\"font-size:.78rem;white-space:nowrap;\">' + esc(ticket.date || '—') + '</td>' +
          '<td data-label=\"Unidade\" class=\"normal-wrap\" style=\"font-size:.78rem;color:var(--text-muted);\">' + esc(unit) + '</td>' +
          '<td data-label=\"Vendedor\" class=\"normal-wrap\" style=\"font-size:.78rem;color:var(--text-muted);\">' + esc(seller) + '</td>' +
          '<td data-label=\"Mecânico\" style=\"font-size:.78rem;color:var(--text-muted);\">' + esc(ticket.mechanic || '—') + '</td>' +
          '<td data-label=\"Equipamento\" class=\"normal-wrap\" style=\"font-size:.8rem;\"><strong style=\"font-family:monospace;\">' + esc(ticket.equipmentSerial || '—') + '</strong>' + (equipSub ? '<div style=\"font-size:.72rem;color:var(--text-muted);margin-top:3px;\">' + esc(equipSub) + '</div>' : '') + '</td>' +
          '<td data-label=\"Cliente\" class=\"normal-wrap\" style=\"font-size:.8rem;\"><strong>' + esc(clientMain) + '</strong>' + (clientSub ? '<div style=\"font-size:.72rem;color:var(--text-muted);margin-top:3px;\">' + esc(clientSub) + '</div>' : '') + (ticket.address ? '<div style=\"font-size:.72rem;color:var(--text-muted);margin-top:3px;line-height:1.35;\">' + esc(ticket.address) + '</div>' : '') + '</td>' +
          '<td data-label=\"Chamado\" class=\"normal-wrap\" style=\"font-weight:600;max-width:220px;font-size:.8rem;\"><div>' + esc(ticket.title || '—') + '</div>' + (ticket.observations ? '<div style=\"font-weight:400;color:var(--text-muted);font-size:.72rem;margin-top:4px;line-height:1.35;\">' + esc(ticket.observations) + '</div>' : '') + (mediaBadge ? '<div style=\"margin-top:6px;\">' + mediaBadge + '</div>' : '') + '</td>' +
          '<td data-label=\"Peças\" class=\"normal-wrap\" style=\"max-width:180px;\">' + partsHtml(ticket.parts, 'var(--primary-color)', 'rgba(37,99,235,.12)') + '</td>' +
          '<td data-label=\"Serviços\" class=\"normal-wrap\" style=\"max-width:180px;\">' + partsHtml(ticket.services, 'var(--success)', 'rgba(16,185,129,.12)') + '</td>' +
          '<td data-label=\"Situação\" style=\"font-size:.78rem;' + statusAfterStyle + '\">' + esc(ticket.eqStatusAfter || '—') + '</td>' +
          '<td data-label=\"Prioridade\"><span class=\"badge-status ' + priorityClass(ticket.priority) + '\">' + esc(ticket.priority || '—') + '</span></td>' +
          '<td data-label=\"Status\"><span class=\"badge-status ' + statusClass(ticket.status) + '\">' + esc(ticket.status || '—') + '</span></td>' +
          '<td data-label=\"Ação\">' + actionButton(ticket, isStaff) + '</td>' +
        '</tr>';
      }).join('');
    };
    return true;
  }
  function installDetails(){
    if (!window.App || !window.Store) return false;
    App.showTicketDetails = function(id) {
      const tickets = (Store.getTickets && Store.getTickets()) || [];
      const ticket = tickets.find(t => String(t.id) === String(id));
      if (!ticket) return alert('Chamado não encontrado.');
      let modal = document.getElementById('modal-ticket-details-mobile');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ticket-details-mobile';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:14px;';
        document.body.appendChild(modal);
      }
      modal.innerHTML = '<div class=\"login-card\" style=\"max-width:720px;width:100%;max-height:90vh;overflow:auto;\"><div style=\"display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;\"><h3 style=\"margin:0;color:var(--primary-color);\">Detalhes do Chamado</h3><div style=\"display:flex;gap:8px;\"><button class=\"btn btn-primary\" onclick=\"App.generateTicketPdf(\'' + esc(ticket.id) + '\')\" style=\"width:auto;font-size:.85rem;padding:6px 12px;\">Gerar PDF</button><button class=\"btn btn-secondary\" onclick=\"document.getElementById(\'modal-ticket-details-mobile\').style.display=\'none\'\" style=\"width:auto;font-size:.85rem;padding:6px 12px;\">Fechar</button></div></div><div id=\"modal-ticket-details-mobile-content\"></div></div>';
      const mediaHtml = (function(){
        const items = mediaItems(ticket);
        if (!items.length) return '';
        return '<div style=\"margin-top:14px;\"><strong style=\"color:var(--text-muted);display:block;margin-bottom:8px;\">Fotos e vídeos anexados:</strong><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;\">' + items.map(function(item){
          const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[item.url]) || item.url;
          const body = item.kind === 'video' ? '<a href=\"' + esc(finalUrl) + '\" target=\"_blank\" style=\"display:inline-flex;align-items:center;justify-content:center;min-height:72px;color:var(--primary-color);font-weight:700;text-decoration:none;\">Abrir vídeo</a>' : '<img src=\"' + esc(finalUrl) + '\" style=\"max-width:100%;max-height:80px;border-radius:4px;cursor:pointer;\" onclick=\"App.showFacadeImage(\'' + esc(finalUrl) + '\')\" onerror=\"this.parentElement.style.display=\'none\'\">';
          return '<div style=\"background:rgba(255,255,255,.02);border:1px solid var(--border-color);border-radius:6px;padding:8px;text-align:center;\"><span style=\"font-size:.72rem;color:var(--text-muted);display:block;margin-bottom:6px;\">' + esc(item.label) + '</span>' + body + '</div>';
        }).join('') + '</div></div>';
      })();
      const parts = Array.isArray(ticket.parts) ? ticket.parts.join(', ') : (ticket.parts || '');
      const services = Array.isArray(ticket.services) ? ticket.services.join(', ') : (ticket.services || '');
      const content = document.getElementById('modal-ticket-details-mobile-content');
      content.innerHTML = section('Identificação') + row('OS', ticket.id) + row('Data de abertura', ticket.date) + row('Status', ticket.status) + row('Prioridade', ticket.priority) + section('Dados da abertura') + row('Unidade', getUnitName(ticket)) + row('Vendedor responsável', getSellerName(ticket)) + row('Tipo de equipamento', ticket.equipmentType) + row('Nº patrimônio', ticket.equipmentSerial) + row('Cliente', ticket.client) + row('Nome fantasia', ticket.fantasyName) + row('Cidade', ticket.city) + row('Endereço', ticket.address) + row('Descrição da falha', ticket.title) + row('Observações da abertura', ticket.observations) + section('Atendimento') + row('Mecânico', ticket.mechanic) + row('Início do atendimento', ticket.startTime) + row('Conclusão', ticket.endTime) + row('Situação após atendimento', ticket.eqStatusAfter) + row('Peças utilizadas', parts) + row('Serviços executados', services) + row('Problema encontrado', ticket.faultDescription) + row('Solução aplicada', ticket.solutionDescription) + row('Carga de gás (g)', ticket.gasCharge) + row('Observações adicionais', ticket.additionalNotes) + mediaHtml + '<div style=\"padding-top:12px;color:var(--text-muted);font-size:.9rem;\">Clique fora ou em Fechar para voltar à lista.</div>';
      modal.style.display = 'flex';
      modal.onclick = function(e){ if (e.target === modal) modal.style.display = 'none'; };
    };
    return true;
  }
  function install(){
    const ok = installRenderTickets() & installDetails();
    if (ok && window.Store && window.UI && Store.getTickets) UI.renderTickets(Store.getTickets());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 100); });
})();
