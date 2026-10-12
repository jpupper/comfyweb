// ============================================================
// comfyweb - UI propia: NUNCA alert/confirm/prompt nativos.
// Modal estilizado FSC con Enter (aceptar) / Esc (cancelar) / click afuera.
//   uiToast(msg)            -> aviso efimero
//   uiAlert(msg)            -> Promise
//   uiConfirm(msg)          -> Promise<boolean>
//   uiPrompt(msg, default)  -> Promise<string|null>
// ============================================================
(function () {
  const CSS = `
  .jpt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;z-index:100000;padding:1.25rem;
    animation:jptFade .18s ease;}
  @keyframes jptFade{from{opacity:0}to{opacity:1}}
  .jpt-box{width:min(460px,100%);background:linear-gradient(180deg,#0b0f16,#070a10);
    border:1px solid rgba(0,217,255,.35);border-radius:14px;padding:1.4rem 1.4rem 1.1rem;
    box-shadow:0 0 40px rgba(0,217,255,.18),0 24px 60px rgba(0,0,0,.6);color:#e9f6ff;
    font-family:'Inter',-apple-system,Segoe UI,Roboto,sans-serif;animation:jptPop .18s ease;}
  @keyframes jptPop{from{transform:translateY(10px) scale(.98);opacity:0}to{transform:none;opacity:1}}
  .jpt-title{font-size:1.05rem;font-weight:700;color:#00d9ff;letter-spacing:.3px;margin:0 0 .6rem;}
  .jpt-msg{font-size:.95rem;line-height:1.5;color:#cfe9f7;margin:0 0 1rem;white-space:pre-wrap;}
  .jpt-input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);
    border:1px solid rgba(0,217,255,.3);border-radius:8px;color:#eaf7ff;padding:.65rem .8rem;
    font-size:.95rem;outline:none;margin-bottom:1rem;}
  .jpt-input:focus{border-color:#00d9ff;box-shadow:0 0 0 3px rgba(0,217,255,.15);}
  .jpt-actions{display:flex;gap:.6rem;justify-content:flex-end;flex-wrap:wrap;}
  .jpt-btn{border:1px solid transparent;border-radius:8px;padding:.55rem 1.1rem;font-weight:600;
    font-size:.9rem;cursor:pointer;transition:all .15s;}
  .jpt-btn-ok{background:#00d9ff;color:#04121a;}
  .jpt-btn-ok:hover{box-shadow:0 0 18px rgba(0,217,255,.55);}
  .jpt-btn-cancel{background:transparent;border-color:rgba(255,255,255,.25);color:#cfe9f7;}
  .jpt-btn-cancel:hover{border-color:#ff6b6b;color:#ff9b9b;}
  .jpt-btn-danger{background:#ff4d4d;color:#1a0505;}
  .jpt-btn-danger:hover{box-shadow:0 0 18px rgba(255,77,77,.5);}
  .jpt-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:100001;
    background:rgba(8,14,20,.96);border:1px solid rgba(0,217,255,.45);color:#e9f6ff;
    padding:.7rem 1.15rem;border-radius:10px;font-size:.9rem;font-weight:600;
    box-shadow:0 12px 40px rgba(0,0,0,.5);animation:jptPop .2s ease;}
  .jpt-toast.err{border-color:rgba(255,77,77,.6);color:#ffd7d7;}
  .jpt-toast.ok{border-color:rgba(0,255,136,.5);color:#d6ffe9;}
  `;

  function ensureCss() {
    if (document.getElementById('jpt-ui-css')) return;
    const s = document.createElement('style');
    s.id = 'jpt-ui-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function toast(msg, kind) {
    ensureCss();
    const el = document.createElement('div');
    el.className = 'jpt-toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2200);
    setTimeout(() => el.remove(), 2600);
  }

  // options: { title, okText, cancelText, danger, input, defaultValue, message }
  function dialog(options) {
    ensureCss();
    const o = options || {};
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'jpt-overlay';

      const box = document.createElement('div');
      box.className = 'jpt-box';

      const title = document.createElement('h3');
      title.className = 'jpt-title';
      title.textContent = o.title || 'Aviso';
      box.appendChild(title);

      const msg = document.createElement('p');
      msg.className = 'jpt-msg';
      msg.textContent = o.message || '';
      box.appendChild(msg);

      let input = null;
      if (o.input) {
        input = document.createElement('input');
        input.className = 'jpt-input';
        input.type = 'text';
        input.value = o.defaultValue || '';
        box.appendChild(input);
      }

      const actions = document.createElement('div');
      actions.className = 'jpt-actions';

      if (o.cancelText !== null) {
        const cancel = document.createElement('button');
        cancel.className = 'jpt-btn jpt-btn-cancel';
        cancel.textContent = o.cancelText || 'Cancelar';
        cancel.onclick = () => close(o.input ? null : false);
        actions.appendChild(cancel);
      }

      const ok = document.createElement('button');
      ok.className = 'jpt-btn ' + (o.danger ? 'jpt-btn-danger' : 'jpt-btn-ok');
      ok.textContent = o.okText || 'Aceptar';
      ok.onclick = () => close(o.input ? (input.value || '') : true);
      actions.appendChild(ok);

      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      if (input) setTimeout(() => { input.focus(); input.select(); }, 30);

      function close(value) {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(value);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(o.input ? null : false); }
        else if (e.key === 'Enter') { e.preventDefault(); close(o.input ? (input.value || '') : true); }
      }

      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(o.input ? null : false); });
      document.addEventListener('keydown', onKey);
    });
  }

  window.uiToast = toast;
  window.uiAlert = (message, title) => dialog({ title: title || 'Aviso', message, okText: 'OK', cancelText: null });
  window.uiConfirm = (message, title, danger) => dialog({ title: title || 'Confirmar', message, okText: 'Aceptar', cancelText: 'Cancelar', danger: !!danger });
  window.uiPrompt = (message, defaultValue, title) => dialog({ title: title || 'Ingresar dato', message, input: true, defaultValue: defaultValue || '', okText: 'Guardar' });
})();
