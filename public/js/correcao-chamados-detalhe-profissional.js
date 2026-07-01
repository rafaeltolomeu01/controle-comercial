/* Correção: detalhe profissional de chamado em desktop e mobile */
(function(){
  'use strict';
  if (window.__ccChamadoDetalheProfissional) return;
  window.__ccChamadoDetalheProfissional = true;
  function esc(value){ return String(value == null ? '' : value).replace(/[&<>\"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[ch]; }); }
  function ok(value){ return value !== undefined && value !== null && String(value).trim() !== ''; }
  function val(value){ return ok(value) ? esc(value) : '<span class=\"cc-pro-empty\">-</span>'; }
  function seller(ticket){ return ticket.seller || (window.UI && UI.getUserName ? UI.getUserName(ticket.userId) : ticket.userId) || ''; }
  function unit(ticket){ return ticket.unit || (window.UI && UI.getUnitName ? UI.getUnitName(ticket.unitId) : ticket.unitId) || ''; }
  function validUrl(url){ var v = String(url || '').trim(); return !!v && ['null','undefined','/uploads/null','/uploads/undefined','/uploads/'].indexOf(v) === -1; }
  function mediaItems(ticket){ var items=[]; if(validUrl(ticket.defectPhoto)) items.push({url:ticket.defectPhoto,label:'Foto do defeito',kind:'image'}); if(validUrl(ticket.defectVideo)) items.push({url:ticket.defectVideo,label:'Vídeo do defeito',kind:'video'}); if(validUrl(ticket.fotoAntes)) items.push({url:ticket.fotoAntes,label:'Foto antes',kind:'image'}); if(validUrl(ticket.fotoDepois)) items.push({url:ticket.fotoDepois,label:'Foto depois',kind:'image'}); if(validUrl(ticket.fotoPlaqueta)) items.push({url:ticket.fotoPlaqueta,label:'Plaqueta',kind:'image'}); if(validUrl(ticket.videoAtendimento)) items.push({url:ticket.videoAtendimento,label:'Vídeo atendimento',kind:'video'}); return items; }
  function injectStyle(){
    if(document.getElementById('cc-chamado-pro-style')) return;
    var style=document.createElement('style');
    style.id='cc-chamado-pro-style';
    style.textContent=[
      '#modal-ticket-details-mobile{padding:18px!important;align-items:center!important;justify-content:center!important;}',
      '#modal-ticket-details-mobile .cc-pro-modal{width:min(1400px,95vw)!important;max-height:92vh!important;overflow:auto!important;padding:0!important;border-radius:14px!important;border:1px solid var(--border-color)!important;background:#101827!important;box-shadow:0 24px 80px rgba(0,0,0,.48)!important;text-align:left!important;}',
      '#modal-ticket-details-mobile .cc-pro-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px 12px;background:linear-gradient(180deg,rgba(16,24,39,.98),rgba(16,24,39,.94));border-bottom:1px solid var(--border-color);}',
      '#modal-ticket-details-mobile .cc-pro-title{min-width:0;}',
      '#modal-ticket-details-mobile .cc-pro-title h3{margin:0;color:var(--primary-color);font-size:1.16rem;line-height:1.1;font-weight:850;}',
      '#modal-ticket-details-mobile .cc-pro-title p{margin:5px 0 0;color:var(--text-muted);font-size:.78rem;line-height:1.25;}',
      '#modal-ticket-details-mobile .cc-pro-actions{display:flex;gap:8px;flex-shrink:0;}',
      '#modal-ticket-details-mobile .cc-pro-actions .btn{width:auto!important;min-height:34px!important;padding:7px 12px!important;font-size:.78rem!important;border-radius:8px!important;}',
      '#modal-ticket-details-mobile .cc-pro-body{padding:16px 18px 18px;}',
      '#modal-ticket-details-mobile .cc-pro-summary{display:grid;grid-template-columns:1.2fr .9fr .9fr .9fr;gap:10px;margin-bottom:12px;}',
      '#modal-ticket-details-mobile .cc-pro-stat{border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.025);min-width:0;}',
      '#modal-ticket-details-mobile .cc-pro-stat small,#modal-ticket-details-mobile .cc-pro-field small{display:block;color:var(--text-muted);font-size:.66rem;line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:.025em;margin-bottom:4px;}',
      '#modal-ticket-details-mobile .cc-pro-stat b,#modal-ticket-details-mobile .cc-pro-field b{display:block;color:var(--text-main);font-size:.88rem;line-height:1.25;font-weight:750;word-break:break-word;}',
      '#modal-ticket-details-mobile .cc-pro-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);gap:12px;align-items:start;}',
      '#modal-ticket-details-mobile .cc-pro-stack{display:grid;gap:12px;min-width:0;}',
      '#modal-ticket-details-mobile .cc-pro-card{border:1px solid var(--border-color);border-radius:12px;background:rgba(255,255,255,.022);overflow:hidden;}',
      '#modal-ticket-details-mobile .cc-pro-card-head{padding:10px 12px;background:rgba(37,99,235,.075);border-bottom:1px solid rgba(37,99,235,.18);}',
      '#modal-ticket-details-mobile .cc-pro-card-head h4{margin:0;color:var(--primary-color);font-size:.86rem;line-height:1.1;font-weight:850;}',
      '#modal-ticket-details-mobile .cc-pro-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;padding:12px;}',
      '#modal-ticket-details-mobile .cc-pro-field{min-width:0;text-align:left;}',
      '#modal-ticket-details-mobile .cc-pro-field-wide{grid-column:1/-1;}',
      '#modal-ticket-details-mobile .cc-pro-empty{color:var(--text-muted);font-weight:650;}',
      '#modal-ticket-details-mobile .cc-pro-media{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;padding:12px;}',
      '#modal-ticket-details-mobile .cc-pro-media-card{border:1px solid var(--border-color);border-radius:10px;padding:7px;background:rgba(255,255,255,.025);text-align:left;}',
      '#modal-ticket-details-mobile .cc-pro-media-card small{display:block;color:var(--text-muted);font-size:.66rem;font-weight:750;line-height:1.1;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#modal-ticket-details-mobile .cc-pro-media-card img{width:100%;height:74px;object-fit:cover;border-radius:7px;cursor:pointer;display:block;}',
      '#modal-ticket-details-mobile .cc-pro-video{display:flex;align-items:center;justify-content:center;height:74px;border-radius:7px;background:rgba(37,99,235,.08);color:var(--primary-color);font-size:.78rem;font-weight:800;text-decoration:none;}',
      '@media(max-width:768px){#modal-ticket-details-mobile{padding:8px!important;}#modal-ticket-details-mobile .cc-pro-modal{width:100%!important;max-height:92vh!important;border-radius:12px!important;}#modal-ticket-details-mobile .cc-pro-header{padding:12px;}#modal-ticket-details-mobile .cc-pro-title h3{font-size:1rem;}#modal-ticket-details-mobile .cc-pro-title p{font-size:.72rem;}#modal-ticket-details-mobile .cc-pro-actions .btn{padding:6px 9px!important;font-size:.72rem!important;}#modal-ticket-details-mobile .cc-pro-body{padding:10px;}#modal-ticket-details-mobile .cc-pro-summary{grid-template-columns:1fr 1fr;gap:8px;}#modal-ticket-details-mobile .cc-pro-grid{grid-template-columns:1fr;gap:10px;}#modal-ticket-details-mobile .cc-pro-stack{gap:10px;}#modal-ticket-details-mobile .cc-pro-fields{grid-template-columns:1fr 1fr;gap:8px 10px;padding:10px;}#modal-ticket-details-mobile .cc-pro-stat{padding:8px 10px;}#modal-ticket-details-mobile .cc-pro-stat small,#modal-ticket-details-mobile .cc-pro-field small{font-size:.64rem;text-transform:none;letter-spacing:0;}#modal-ticket-details-mobile .cc-pro-stat b,#modal-ticket-details-mobile .cc-pro-field b{font-size:.78rem;}#modal-ticket-details-mobile .cc-pro-field-wide{grid-column:1/-1;}#modal-ticket-details-mobile .cc-pro-media{grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;padding:10px;}#modal-ticket-details-mobile .cc-pro-media-card img,#modal-ticket-details-mobile .cc-pro-video{height:58px;}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function stat(label,value){return '<div class=\"cc-pro-stat\"><small>'+esc(label)+'</small><b>'+val(value)+'</b></div>';}
  function field(label,value,wide){return '<div class=\"cc-pro-field'+(wide?' cc-pro-field-wide':'')+'\"><small>'+esc(label)+'</small><b>'+val(value)+'</b></div>';}
  function card(title,fields){return '<section class=\"cc-pro-card\"><div class=\"cc-pro-card-head\"><h4>'+esc(title)+'</h4></div><div class=\"cc-pro-fields\">'+fields+'</div></section>';}
  function mediaHtml(ticket){var items=mediaItems(ticket); if(!items.length) return ''; return '<section class=\"cc-pro-card\"><div class=\"cc-pro-card-head\"><h4>Anexos</h4></div><div class=\"cc-pro-media\">'+items.map(function(media){var url=(window.TempPhotosCache&&window.TempPhotosCache[media.url])||media.url; var body=media.kind==='video'?'<a class=\"cc-pro-video\" href=\"'+esc(url)+'\" target=\"_blank\">Abrir vídeo</a>':'<img src=\"'+esc(url)+'\" onclick=\"App.showFacadeImage(\''+esc(url)+'\')\" onerror=\"this.parentElement.style.display=\'none\'\">'; return '<div class=\"cc-pro-media-card\"><small>'+esc(media.label)+'</small>'+body+'</div>';}).join('')+'</div></section>';}
  function install(){
    if(!window.App||!window.Store) return false;
    App.showTicketDetails=function(id){
      injectStyle();
      var tickets=(Store.getTickets&&Store.getTickets())||[];
      var ticket=tickets.find(function(t){return String(t.id)===String(id);});
      if(!ticket) return alert('Chamado não encontrado.');
      var modal=document.getElementById('modal-ticket-details-mobile');
      if(!modal){modal=document.createElement('div');modal.id='modal-ticket-details-mobile';modal.style.cssText='display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.72);align-items:center;justify-content:center;';document.body.appendChild(modal);}
      var subtitle=[ticket.fantasyName||ticket.client,ticket.city,ticket.equipmentSerial].filter(Boolean).join(' • ');
      modal.innerHTML='<div class=\"login-card cc-pro-modal\"><header class=\"cc-pro-header\"><div class=\"cc-pro-title\"><h3>Detalhes do chamado</h3><p>'+esc(ticket.id||'')+(subtitle?' | '+esc(subtitle):'')+'</p></div><div class=\"cc-pro-actions\"><button class=\"btn btn-primary\" onclick=\"App.generateTicketPdf(\''+esc(ticket.id)+'\')\">PDF</button><button class=\"btn btn-secondary\" onclick=\"document.getElementById(\'modal-ticket-details-mobile\').style.display=\'none\'\">Fechar</button></div></header><div class=\"cc-pro-body\" id=\"modal-ticket-details-mobile-content\"></div></div>';
      var parts=Array.isArray(ticket.parts)?ticket.parts.join(', '):(ticket.parts||'');
      var services=Array.isArray(ticket.services)?ticket.services.join(', '):(ticket.services||'');
      var resumo='<div class=\"cc-pro-summary\">'+stat('OS',ticket.id)+stat('Data',ticket.date)+stat('Status',ticket.status)+stat('Prioridade',ticket.priority)+'</div>';
      var abertura=card('Abertura do chamado',field('Unidade',unit(ticket))+field('Vendedor',seller(ticket))+field('Tipo',ticket.equipmentType)+field('Patrimônio',ticket.equipmentSerial)+field('Cliente',ticket.client)+field('Fantasia',ticket.fantasyName)+field('Cidade',ticket.city)+field('Endereço',ticket.address)+field('Falha relatada',ticket.title,true)+field('Observações',ticket.observations,true));
      var atendimento=card('Atendimento técnico',field('Mecânico',ticket.mechanic)+field('Início',ticket.startTime)+field('Conclusão',ticket.endTime)+field('Situação pós',ticket.eqStatusAfter)+field('Peças utilizadas',parts,true)+field('Serviços executados',services,true)+field('Problema encontrado',ticket.faultDescription,true)+field('Solução aplicada',ticket.solutionDescription,true)+field('Carga de gás',ticket.gasCharge)+field('Observações finais',ticket.additionalNotes,true));
      document.getElementById('modal-ticket-details-mobile-content').innerHTML=resumo+'<div class=\"cc-pro-grid\"><div class=\"cc-pro-stack\">'+abertura+'</div><div class=\"cc-pro-stack\">'+atendimento+mediaHtml(ticket)+'</div></div>';
      modal.style.display='flex';
      modal.onclick=function(e){if(e.target===modal) modal.style.display='none';};
    };
    return true;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
  window.addEventListener('hashchange',function(){setTimeout(install,100);});
})();

; 
if(!document.getElementById('cc-chamado-desktop-fix')){
  var style2=document.createElement('style');
  style2.id='cc-chamado-desktop-fix';
  style2.textContent=`
@media (min-width: 1024px){
  #modal-ticket-details-mobile .cc-pro-modal{
    width:min(1400px,95vw)!important;
  }
  #modal-ticket-details-mobile .cc-pro-body{
    display:grid!important;
    grid-template-columns: 1.2fr 1fr!important;
    gap:16px!important;
  }
  .cc-card-actions{
    display:flex!important;
    justify-content:flex-end!important;
    gap:8px!important;
    order:-1!important;
  }
  .cc-ticket-card{
    position:relative!important;
  }
}
`;
  document.head.appendChild(style2);
}
