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
          transition: transform(100%);
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
  let activeStream = null;

  function closeSheet() {
    const overlay = document.getElementById('cc-photo-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  function handleCamera() {
    closeSheet();
    showInAppCamera();
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

  function showInAppCamera() {
    let cameraOverlay = document.getElementById('cc-inapp-camera-overlay');
    if (!cameraOverlay) {
      cameraOverlay = document.createElement('div');
      cameraOverlay.id = 'cc-inapp-camera-overlay';
      cameraOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999999;
        background: #000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        font-family: system-ui, -apple-system, sans-serif;
      `;
      cameraOverlay.innerHTML = `
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 15px; box-sizing: border-box; background: rgba(0,0,0,0.5); position: absolute; top:0; z-index: 10;">
          <span style="color:#fff; font-size:1.1rem; font-weight:600;">Câmera do Sistema</span>
          <button type="button" id="cc-camera-close-btn" style="background:none; border:none; color:#fff; font-size:1.8rem; cursor:pointer; padding:5px; line-height:1;">&times;</button>
        </div>
        <video id="cc-camera-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
        <div style="width:100%; display:flex; justify-content:center; align-items:center; padding:30px 20px; box-sizing:border-box; background:rgba(0,0,0,0.3); position:absolute; bottom:0; z-index:10;">
          <button type="button" id="cc-camera-capture-btn" style="width: 72px; height: 72px; border-radius: 50%; background: #fff; border: 5px solid rgba(255,255,255,0.3); box-shadow: 0 0 10px rgba(0,0,0,0.5); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; transition: transform 0.1s ease; outline: none;">
            <div style="width: 50px; height: 50px; border-radius: 50%; background: #fff; border: 2px solid #000;"></div>
          </button>
        </div>
      `;
      document.body.appendChild(cameraOverlay);
    }

    cameraOverlay.style.display = 'flex';

    const video = document.getElementById('cc-camera-video');
    const closeBtn = document.getElementById('cc-camera-close-btn');
    const captureBtn = document.getElementById('cc-camera-capture-btn');

    closeBtn.onclick = closeInAppCamera;

    captureBtn.onclick = function() {
      captureBtn.style.transform = 'scale(0.9)';
      setTimeout(() => { captureBtn.style.transform = 'scale(1)'; }, 100);
      takeSnapshot(video);
    };

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    }).then(stream => {
      activeStream = stream;
      video.srcObject = stream;
    }).catch(err => {
      console.error('Erro ao acessar a câmera:', err);
      alert('Não foi possível acessar a câmera. Verifique se deu permissão de acesso à câmera no seu navegador.');
      closeInAppCamera();
    });
  }

  function closeInAppCamera() {
    const cameraOverlay = document.getElementById('cc-inapp-camera-overlay');
    if (cameraOverlay) {
      cameraOverlay.style.display = 'none';
    }
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }
    activeInput = null;
  }

  function takeSnapshot(video) {
    if (!activeInput) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) {
        alert('Erro ao capturar a imagem.');
        closeInAppCamera();
        return;
      }
      
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        activeInput.files = dataTransfer.files;
        activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.error('Erro ao injetar arquivo no input:', err);
      }
      
      closeInAppCamera();
    }, 'image/jpeg', 0.85);
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
          document.getElementById('cc-btn-camera').onclick = handleCamera;
          document.getElementById('cc-btn-gallery').onclick = handleGallery;
          document.getElementById('cc-btn-cancel').onclick = function() {
            closeSheet();
            activeInput = null;
          };
          overlay.onclick = function(evt) {
            if (evt.target === overlay) {
              closeSheet();
              activeInput = null;
            }
          };
        }
      }, 50);
    }
  }, true);

})();
