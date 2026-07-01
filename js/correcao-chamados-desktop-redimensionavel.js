/* Correção: modal de chamados redimensionável no desktop */
(function(){
  'use strict';
  if (window.__ccChamadoDesktopResizable) return;
  window.__ccChamadoDesktopResizable = true;

  var STORAGE_KEY = 'cc_ticket_modal_desktop_size_v1';
  var MIN_W = 720;
  var MIN_H = 520;
  var DEFAULT_W = 980;
  var DEFAULT_H = 760;

  function isDesktop(){ return window.matchMedia && window.matchMedia('(min-width: 769px)').matches; }
  function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
  function getSavedSize(){
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        width: Number(saved.width) || DEFAULT_W,
        height: Number(saved.height) || DEFAULT_H
      };
    } catch (_) {
      return { width: DEFAULT_W, height: DEFAULT_H };
    }
  }
  function saveSize(width, height){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: Math.round(width), height: Math.round(height) })); } catch (_) {}
  }
  function injectStyle(){
    if (document.getElementById('cc-ticket-resize-style')) return;
    var style = document.createElement('style');
    style.id = 'cc-ticket-resize-style';
    style.textContent = [
      '@media (min-width: 769px){',
      '  #modal-ticket-details-mobile{align-items:center!important;justify-content:center!important;padding:18px!important;}',
      '  #modal-ticket-details-mobile .cc-pro-modal, #modal-ticket-details-mobile .cc-ticket-modal{resize:none!important;position:relative!important;max-width:calc(100vw - 56px)!important;max-height:calc(100vh - 56px)!important;}',
      '  #modal-ticket-details-mobile .cc-pro-body, #modal-ticket-details-mobile .cc-ticket-body{height:calc(100% - 67px);overflow:auto;}',
      '  #modal-ticket-details-mobile .cc-resize-handle{position:absolute;right:5px;bottom:5px;width:18px;height:18px;border-right:3px solid rgba(156,163,175,.75);border-bottom:3px solid rgba(156,163,175,.75);cursor:nwse-resize;border-radius:2px;opacity:.75;z-index:8;}',
      '  #modal-ticket-details-mobile .cc-resize-handle:hover{opacity:1;border-color:var(--primary-color);}',
      '  #modal-ticket-details-mobile .cc-resize-hint{font-size:.68rem;color:var(--text-muted);margin-left:8px;white-space:nowrap;}',
      '}',
      '@media (max-width: 768px){#modal-ticket-details-mobile .cc-resize-handle,#modal-ticket-details-mobile .cc-resize-hint{display:none!important;}}'
    ].join('\n');
    document.head.appendChild(style);
  }
  function modalBox(){
    var modal = document.getElementById('modal-ticket-details-mobile');
    if (!modal) return null;
    return modal.querySelector('.cc-pro-modal') || modal.querySelector('.cc-ticket-modal') || modal.querySelector('.login-card');
  }
  function applyDesktopSize(box){
    if (!box || !isDesktop()) return;
    var maxW = window.innerWidth - 56;
    var maxH = window.innerHeight - 56;
    var saved = getSavedSize();
    var width = clamp(saved.width, MIN_W, maxW);
    var height = clamp(saved.height, MIN_H, maxH);
    box.style.width = width + 'px';
    box.style.height = height + 'px';
    box.style.maxWidth = maxW + 'px';
    box.style.maxHeight = maxH + 'px';
  }
  function addHint(box){
    if (!box || !isDesktop()) return;
    var actions = box.querySelector('.cc-pro-actions') || box.querySelector('.cc-ticket-actions');
    if (actions && !actions.querySelector('.cc-resize-hint')) {
      var hint = document.createElement('span');
      hint.className = 'cc-resize-hint';
      hint.textContent = 'arraste o canto para ajustar';
      actions.appendChild(hint);
    }
  }
  function enableResize(box){
    if (!box || !isDesktop() || box.querySelector('.cc-resize-handle')) return;
    var handle = document.createElement('div');
    handle.className = 'cc-resize-handle';
    handle.title = 'Arraste para aumentar ou diminuir';
    box.appendChild(handle);

    var startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
    function onMove(event){
      if (!resizing) return;
      var maxW = window.innerWidth - 56;
      var maxH = window.innerHeight - 56;
      var nextW = clamp(startW + (event.clientX - startX), MIN_W, maxW);
      var nextH = clamp(startH + (event.clientY - startY), MIN_H, maxH);
      box.style.width = nextW + 'px';
      box.style.height = nextH + 'px';
      event.preventDefault();
    }
    function onUp(){
      if (!resizing) return;
      resizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveSize(box.offsetWidth, box.offsetHeight);
      document.body.style.userSelect = '';
    }
    handle.addEventListener('mousedown', function(event){
      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      startW = box.offsetWidth;
      startH = box.offsetHeight;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.userSelect = 'none';
      event.preventDefault();
      event.stopPropagation();
    });
  }
  function enhance(){
    injectStyle();
    var box = modalBox();
    if (!box) return;
    if (isDesktop()) {
      applyDesktopSize(box);
      addHint(box);
      enableResize(box);
    } else {
      box.style.width = '';
      box.style.height = '';
      box.style.maxWidth = '';
      box.style.maxHeight = '';
    }
  }
  function wrapShowDetails(){
    if (!window.App || !App.showTicketDetails || App.showTicketDetails.__ccResizableWrapped) return false;
    var original = App.showTicketDetails.bind(App);
    App.showTicketDetails = function(){
      var result = original.apply(App, arguments);
      setTimeout(enhance, 0);
      setTimeout(enhance, 80);
      return result;
    };
    App.showTicketDetails.__ccResizableWrapped = true;
    return true;
  }
  function install(){
    wrapShowDetails();
    enhance();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.addEventListener('hashchange', function(){ setTimeout(install, 120); });
  window.addEventListener('resize', function(){ setTimeout(enhance, 80); });
})();
