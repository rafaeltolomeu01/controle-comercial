(function() {
  'use strict';

  function createBottomSheet() {
    let container = document.getElementById('cc-photo-sheet-container');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'cc-photo-sheet-container';
    container.style.cssText = 'display:none;';
    container.innerHTML = `
      <style>
        .cc-photo-sheet-overlay {
          position: fixed;
          inset: 0;
          z-index: 999999;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .cc-photo-sheet-overlay.active {
          opacity: 1;
          pointer-events: auto;
        }
        .cc-photo-sheet {
          background: #1f2937;
          border-top-left-radius: 20px;
          border-top-right-radius: 20px;
          padding: 20px;
          width: 100%;
          max-width: 480px;
          box-sizing: border-box;
          transform: translateY(100%);
          transition: transform 0.25s cubic-bezier(0.1, 0.76, 0.55, 0.94);
        }
        .cc-photo-sheet-overlay.active .cc-photo-sheet {
          transform: translateY(0);
        }
        .cc-photo-sheet-title {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          color: #f3f4f6;
          text-align: center;
          margin-top: 0;
          margin-bottom: 18px;
        }
        .cc-photo-sheet-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          height: 48px;
          border: 1px solid var(--border-color, #374151);
          background: rgba(255,255,255,0.03);
          color: #fff;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          margin-bottom: 10px;
          cursor: pointer;
          font-family: system-ui, -apple-system, sans-serif;
          transition: background 0.15s ease;
        }
        .cc-photo-sheet-btn:active, .cc-photo-sheet-btn:hover {
          background: rgba(255,255,255,0.08);
        }
        .cc-photo-sheet-btn.cc-cancel {
          background: #ef4444;
          border: 1px solid #dc2626;
          margin-bottom: 0;
          margin-top: 8px;
        }
        .cc-photo-sheet-btn.cc-cancel:active, .cc-photo-sheet-btn.cc-cancel:hover {
          background: #dc2626;
        }
      </style>
      <div class="cc-photo-sheet-overlay" id="cc-photo-overlay">
        <div class="cc-photo-sheet">
          <h3 class="cc-photo-sheet-title">Como deseja anexar a foto?</h3>
          <button type="button" class="cc-photo-sheet-btn" id="cc-btn-camera">
            📷 Tirar Foto (Câmera)
          </button>
          <button type="button" class="cc-photo-sheet-btn" id="cc-btn-gallery">
            🖼️ Escolher da Galeria
          </button>
          <button type="button" class="cc-photo-sheet-btn cc-cancel" id="cc-btn-cancel">
            Cancelar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    container.style.display = 'block';
    return container;
  }

  let activeInput = null;

  function closeSheet() {
    const overlay = document.getElementById('cc-photo-overlay');
    if (overlay) overlay.classList.remove('active');
    activeInput = null;
  }

  async function handleCamera() {
    if (!activeInput) return;
    const input = activeInput;
    closeSheet();

    // Solicitar permissão de câmera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      alert("Permissão para usar a câmera foi negada. Por favor, ative a permissão de câmera nas configurações do seu celular ou navegador para tirar fotos.");
      return;
    }

    input.setAttribute('capture', 'environment');
    input.dataset.ccIgnoreClick = 'true';
    input.click();

    setTimeout(() => {
      input.removeAttribute('capture');
      delete input.dataset.ccIgnoreClick;
    }, 800);
  }

  function handleGallery() {
    if (!activeInput) return;
    const input = activeInput;
    closeSheet();

    input.removeAttribute('capture');
    input.dataset.ccIgnoreClick = 'true';
    input.click();

    setTimeout(() => {
      delete input.dataset.ccIgnoreClick;
    }, 800);
  }

  document.addEventListener('click', function(e) {
    const target = e.target;
    if (target && target.tagName === 'INPUT' && target.type === 'file' && target.accept && target.accept.includes('image')) {
      if (target.dataset.ccIgnoreClick === 'true') {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();

      activeInput = target;
      createBottomSheet();

      setTimeout(() => {
        const overlay = document.getElementById('cc-photo-overlay');
        if (overlay) {
          overlay.classList.add('active');
          // Bind buttons
          document.getElementById('cc-btn-camera').onclick = handleCamera;
          document.getElementById('cc-btn-gallery').onclick = handleGallery;
          document.getElementById('cc-btn-cancel').onclick = closeSheet;
          overlay.onclick = function(evt) {
            if (evt.target === overlay) closeSheet();
          };
        }
      }, 50);
    }
  }, true);

})();
