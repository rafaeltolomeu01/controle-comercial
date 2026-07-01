/* Correção: card ultra compacto e modal bonito para chamados mecânicos */
(function(){
  'use strict';
  if (window.__ccChamadosMobileCompactoBonito) return;
  window.__ccChamadosMobileCompactoBonito = true;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function validUrl(url) {
    const v = String(url || '').trim();
    return !!v && !['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].includes(v);
  }
  function seller(ticket) { return ticket.seller || (window.UI && UI.getUserName ? UI.getUserName(ticket.userId) : ticket.userId) || ''; }
  function unit(ticket) { return ticket.unit || (window.UI && UI.getUnitName ? UI.getUnitName(ticket.unitId) : ticket.unitId) || ''; }
  function statusClass(status) { if (status === 'Resolvido') return 'badge-success'; if (status === 'Em Atendimento') return 'badge-primary'; return 'badge-warning'; }
  function priorityClass(priority) { if (priority === 'Alta') return 'badge-danger'; if (priority === 'Média') return 'badge-warning'; return 'badge-primary'; }
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
  function injectStyle(){
    if (document.getElementById('cc-chamados-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'cc-chamados-compact-style';
    style.textContent = `
      #modal-ticket-details-mobile .login-card { text-align: left !important; }
      #modal-ticket-details-mobile .cc-detail-card { background: rgba(255,255,255,.025); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; margin-top: 10px; }
      #modal-ticket-details-mobile .cc-detail-title { margin: 0 0 10px; color: var(--primary-color); font-size: .9rem; font-weight: 800; text-align: left; }
      #modal-ticket-details-mobile .cc-detail-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 14px; align-items: start; }
      #modal-ticket-details-mobile .cc-detail-item { min-width: 0; text-align: left; }
      #modal-ticket-details-mobile .cc-detail-item small { display:block; color: var(--text-muted); font-weight: 700; font-size: .68rem; line-height: 1.1; margin-bottom: 3px; text-transform: uppercase; letter-spacing: .02em; }
      #modal-ticket-details-mobile .cc-detail-item b { display:block; color: var(--text-main); font-size: .84rem; line-height: 1.25; word-break: break-word; font-weight: 650; }
      #modal-ticket-details-mobile .cc-detail-full { grid-column: span 2; }
      #modal-ticket-details-mobile .cc-detail-wide { grid-column: 1 / -1; }
      @media (max-width: 768px) {
        #tickets-table-body tr.cc-ticket-compact-row { display: block !important; margin: 8px 0 !important; border: 1px solid var(--border-color) !important; border-radius: 12px !important; background: rgba(17,24,39,.96) !important; overflow: hidden !important; }
        #tickets-table-body tr.cc-ticket-compact-row td { display: block !important; padding: 9px 10px !important; border: 0 !important; min-height: 0 !important; }
        #tickets-table-body tr.cc-ticket-compact-row td:before { display: none !important; content: none !important; }
        #tickets-table-body tr.cc-ticket-compact-row .cc-line { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #tickets-table-body tr.cc-ticket-compact-row .badge-status { font-size: .62rem !important; padding: 3px 7px !important; }
        #modal-ticket-details-mobile .cc-detail-card { padding: 10px; margin-top: 8px; }
        #modal-ticket-details-mobile .cc-detail-title { font-size: .82rem; margin-bottom: 8px; }
        #modal-ticket-details-mobile .cc-detail-grid { grid-template-columns: 1fr 1fr; gap: 7px 10px; }
        #modal-ticket-details-mobile .cc-detail-item small { font-size: .66rem; text-transform: none; letter-spacing: 0; }
        #modal-ticket-details-mobile .cc-detail-item b { font-size: .78rem; }
        #modal-ticket-details-mobile .cc-detail-full, #modal-ticket-details-mobile .cc-detail-wide { grid-column: 1 / -1; }
      }`;
    document.head.appendChild(style);
  }
  function item(label, value, full) {
    const has = value !== undefined && value !== null && String(value).trim() !== '';
    return '<div class=\"cc-detail-item' + (full ? ' cc-detail-wide' : '') + '\"><small>' + esc(label) + '</small><b>' + (has ? esc(value) : '—') + '</b></div>';
  }
  function card(title, html) { return '<section class=\"cc-detail-card\"><h4 class=\"cc-detail-title\">' + esc(title) + '</h4><div class=\"cc-detail-grid\">' + html + '</div></section>'; }
  function actionButton(ticket, isStaff) {
    if (ticket.status === 'Aberto') return isStaff ? '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.startTicketService(\'' + esc(ticket.id) + '\')\" style=\"padding:5px 8px;font-size:.68rem;white-space:nowrap;\">INICIAR</button>' : '';
    if (ticket.status === 'Em Atendimento') return isStaff ? '<button class=\"btn btn-success btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\" style=\"padding:5px 8px;font-size:.68rem;white-space:nowrap;\">FICHA</button>' : '';
    return '<button class=\"btn btn-secondary btn-sm\" onclick=\"event.stopPropagation(); App.openFichaTecnica(\'' + esc(ticket.id) + '\')\" style=\"padding:5px 8px;font-size:.68rem;white-space:nowrap;\">LAUDO</button>';
  }
  function installRenderTickets(){
    if (!window.UI || !window.Store) return false;
    UI.renderTickets = function(tickets) {
      injectStyle();
      const activeUnitId = Store.getActiveUnitId ? Store.getActiveUnitId() : 'all';
      const user = Store.getLoggedUser ? Store.getLoggedUser() : null;
      let list = Array.isArray(tickets) ? tickets.slice() : [];
      if (activeUnitId !== 'all') list = list.filter(t => t.unitId === activeUnitId);
      if (user && user.profile === 'Vendedor') list = list.filter(t => String(t.userId) === String(user.id));
      const body = document.getElementById('tickets-table-body');
      if (!body) return;
      const isStaff = user && ['Administrador','Responsável Equipamentos','Mecânico'].includes(user.profile);
      body.innerHTML = list.map(function(ticket){
        const clientName = ticket.fantasyName || ticket.client || 'Cliente não informado';
        const city = ticket.city ? ' • ' + ticket.city : '';
        const equip = [ticket.equipmentSerial, ticket.equipmentType].filter(Boolean).join(' • ') || 'Equipamento não informado';
        const resp = seller(ticket) || ticket.mechanic || '';
        const anexos = mediaItems(ticket).length;
        const anexosText = anexos ? ' • ' + anexos + ' anexo' + (anexos > 1 ? 's' : '') : '';
        return '<tr class=\"mobile-summary-row cc-ticket-compact-row\" onclick=\"App.showTicketDetails(\'' + esc(ticket.id) + '\')\">' +
          '<td colspan=\"12\">' +
            '<div style=\"display:grid;gap:4px;\">' +
              '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;\"><div class=\"cc-line\" style=\"font-size:.82rem;font-weight:800;\"><span style=\"font-family:monospace;font-weight:900;\">' + esc(ticket.id || '') + '</span> • ' + esc(clientName) + esc(city) + '</div><span style=\"display:flex;align-items:center;gap:4px;flex-shrink:0;\"><span class=\"badge-status ' + priorityClass(ticket.priority) + '\">' + esc(ticket.priority || '—') + '</span><span class=\"badge-status ' + statusClass(ticket.status) + '\">' + esc(ticket.status || '—') + '</span></span></div>' +
              '<div class=\"cc-line\" style=\"font-size:.72rem;color:var(--text-muted);font-weight:700;\">' + esc(equip) + ' • ' + esc(ticket.date || 'S/D') + (resp ? ' • ' + esc(resp) : '') + esc(anexosText) + '</div>' +
              '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;\"><span class=\"cc-line\" style=\"font-size:.72rem;color:var(--text-muted);\">Toque para ver detalhes completos</span>' + actionButton(ticket, isStaff) + '</div>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');
    };
    return true;
  }
  function installDetails(){
    if (!window.App || !window.Store) return false;
    App.showTicketDetails = function(id) {
      injectStyle();
      const tickets = (Store.getTickets && Store.getTickets()) || [];
      const ticket = tickets.find(t => String(t.id) === String(id));
      if (!ticket) return alert('Chamado não encontrado.');
      let modal = document.getElementById('modal-ticket-details-mobile');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-ticket-details-mobile';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:8px;';
        document.body.appendChild(modal);
      }
      modal.innerHTML = '<div class=\"login-card\" style=\"max-width:860px;width:100%;max-height:92vh;overflow:auto;padding:14px!important;border-radius:12px!important;text-align:left!important;\"><div style=\"display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;\"><div style=\"min-width:0;\"><h3 style=\"margin:0;color:var(--primary-color);font-size:1rem;line-height:1.1;\">Detalhes do Chamado</h3><div style=\"font-size:.72rem;color:var(--text-muted);margin-top:2px;\">' + esc(ticket.id || '') + '</div></div><div style=\"display:flex;gap:6px;flex-shrink:0;\"><button class=\"btn btn-primary\" onclick=\"App.generateTicketPdf(\'' + esc(ticket.id) + '\')\" style=\"width:auto;font-size:.72rem;padding:6px 9px;\">PDF</button><button class=\"btn btn-secondary\" onclick=\"document.getElementById(\'modal-ticket-details-mobile\').style.display=\'none\'\" style=\"width:auto;font-size:.72rem;padding:6px 9px;\">Fechar</button></div></div><div id=\"modal-ticket-details-mobile-content\"></div></div>';
      const mediaHtml = (function(){
        const items = mediaItems(ticket);
        if (!items.length) return '';
        return '<section class=\"cc-detail-card\"><h4 class=\"cc-detail-title\">Anexos</h4><div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;\">' + items.map(function(media){
          const finalUrl = (window.TempPhotosCache && window.TempPhotosCache[media.url]) || media.url;
          const body = media.kind === 'video' ? '<a href=\"' + esc(finalUrl) + '\" target=\"_blank\" style=\"display:flex;align-items:center;justify-content:center;height:58px;color:var(--primary-color);font-weight:800;font-size:.72rem;text-decoration:none;\">Vídeo</a>' : '<img src=\"' + esc(finalUrl) + '\" style=\"width:100%;height:58px;object-fit:cover;border-radius:6px;cursor:pointer;\" onclick=\"App.showFacadeImage(\'' + esc(finalUrl) + '\')\" onerror=\"this.parentElement.style.display=\'none\'\">';
          return '<div style=\"background:rgba(255,255,255,.025);border:1px solid var(--border-color);border-radius:8px;padding:6px;text-align:center;\"><small style=\"display:block;color:var(--text-muted);font-size:.62rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">' + esc(media.label) + '</small>' + body + '</div>';
        }).join('') + '</div></section>';
      })();
      const parts = Array.isArray(ticket.parts) ? ticket.parts.join(', ') : (ticket.parts || '');
      const services = Array.isArray(ticket.services) ? ticket.services.join(', ') : (ticket.services || '');
      const html =
        card('Resumo', item('Data', ticket.date) + item('Status', ticket.status) + item('Prioridade', ticket.priority) + item('Unidade', unit(ticket))) +
        card('Abertura', item('Vendedor', seller(ticket)) + item('Tipo', ticket.equipmentType) + item('Patrimônio', ticket.equipmentSerial) + item('Cliente', ticket.client) + item('Fantasia', ticket.fantasyName) + item('Cidade', ticket.city) + item('Endereço', ticket.address, true) + item('Falha', ticket.title, true) + item('Obs.', ticket.observations, true)) +
        card('Atendimento', item('Mecânico', ticket.mechanic) + item('Início', ticket.startTime) + item('Conclusão', ticket.endTime) + item('Situação', ticket.eqStatusAfter) + item('Peças', parts, true) + item('Serviços', services, true) + item('Problema', ticket.faultDescription, true) + item('Solução', ticket.solutionDescription, true) + item('Gás (g)', ticket.gasCharge) + item('Obs. finais', ticket.additionalNotes, true)) + mediaHtml;
      document.getElementById('modal-ticket-details-mobile-content').innerHTML = html;
      modal.style.display = 'flex';
      modal.onclick = function(e){ if (e.target === modal) modal.style.display = 'none'; };
    };
    return true;
  }
  function install(){ const ok = installRenderTickets() & installDetails(); if (ok && window.Store && window.UI && Store.getTickets) UI.renderTickets(Store.getTickets()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 100); });
})();
