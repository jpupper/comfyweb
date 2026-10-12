// ============================================================
// comfyweb - comportamiento del front (ecosistema FSC)
// ------------------------------------------------------------
// Regla dura del ecosistema: el HTML es solo estructura y el
// markup dinamico se arma con createElement/textContent.
// Aca NO hay innerHTML con handlers ni estilos inline de markup.
//
// Depende (orden de carga): config.js -> ui.js -> auth.js -> menu.js
//   -> background.js -> socket.io -> app.js
// Helpers usados de auth.js: getToken(), authHeaders(),
//   apiRequest(), isLoggedIn(), getUserUsername(), showLogin(),
//   logout(), CONFIG.
// ============================================================
(function () {
  'use strict';

  // ---------- Estado local ----------
  var agent = { online: false, comfyConnected: false, info: null, queued: 0 };
  var jobs = {};            // id -> job
  var activeJobId = null;
  var agentWorkflows = [];  // [{id,label,kind}]
  var pendingSubmit = false;
  var socket = null;

  // Workflows por defecto si el agente no informa ninguno.
  var DEFAULT_WORKFLOWS = [
    { id: 'flux', label: 'Flux (imagen)', kind: 'image' },
    { id: 'ltx', label: 'LTX-2 (video)', kind: 'video' }
  ];

  // ---------- Utilidades DOM ----------
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function truncate(str, n) {
    str = String(str == null ? '' : str);
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function intFrom(input, fallback, min, max) {
    var v = parseInt(input && input.value, 10);
    if (isNaN(v)) return fallback;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return d.toLocaleString();
    }
  }

  // Resuelve resultUrl (relativa o absoluta) contra el origen del backend.
  function resolveUrl(u) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u) || u.indexOf('data:') === 0 || u.indexOf('blob:') === 0) return u;
    var base = '';
    try {
      base = new URL(window.CONFIG.SOCKET_URL, window.location.href).href.replace(/\/$/, '');
    } catch (e) {
      base = window.location.origin;
    }
    return base + (u.charAt(0) === '/' ? u : '/' + u);
  }

  function isVideoUrl(url, mime) {
    if (mime && /^video\//i.test(mime)) return true;
    return /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(url || '');
  }

  function isImageUrl(url, mime) {
    if (mime && /^image\//i.test(mime)) return true;
    return /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url || '');
  }

  function statusLabel(status) {
    switch (status) {
      case 'queued': return 'En cola';
      case 'running': return 'En curso';
      case 'done': return 'Listo';
      case 'error': return 'Error';
      default: return status || '—';
    }
  }

  // ============================================================
  // Estado del agente
  // ============================================================
  function renderAgent() {
    var agentDot = $('agentDot'), agentText = $('agentText');
    var comfyDot = $('comfyDot'), comfyText = $('comfyText');
    var queueText = $('queueText');
    var banner = $('offlineBanner');
    var footerDevice = $('footerDevice');

    agentDot.className = 'cw-dot ' + (agent.online ? 'cw-dot-ok' : 'cw-dot-off');
    agentText.textContent = 'Agente local: ' + (agent.online ? 'conectado' : 'desconectado');

    comfyDot.className = 'cw-dot ' + (agent.comfyConnected ? 'cw-dot-ok' : 'cw-dot-off');
    comfyText.textContent = 'Comfy local: ' + (agent.comfyConnected ? 'conectado' : 'desconectado');

    queueText.textContent = 'Cola: ' + (agent.queued || 0);

    banner.classList.toggle('cw-hidden', agent.online);

    var info = agent.info || {};
    var bits = [];
    if (info.device) bits.push(String(info.device));
    if (info.comfyVersion) bits.push('ComfyUI ' + info.comfyVersion);
    footerDevice.textContent = bits.join(' · ');

    populateWorkflows();
  }

  // ============================================================
  // Selector de workflow
  // ============================================================
  function currentKind() {
    var k = $('kindSelect');
    return k ? k.value : 'image';
  }

  function workflowList() {
    return (agentWorkflows && agentWorkflows.length) ? agentWorkflows : DEFAULT_WORKFLOWS;
  }

  function workflowsForKind(kind) {
    var all = workflowList().filter(function (w) { return w.kind === kind; });
    return all.length ? all : workflowList();
  }

  function populateWorkflows() {
    var sel = $('workflowSelect');
    if (!sel) return;
    var kind = currentKind();
    var list = workflowsForKind(kind);
    var prev = sel.value;
    clear(sel);
    list.forEach(function (w) {
      var opt = el('option', null, w.label || w.id || 'workflow');
      opt.value = w.id || w.label || '';
      opt.setAttribute('data-kind', w.kind || kind);
      sel.appendChild(opt);
    });
    // Restituye la seleccion previa si todavia existe entre las opciones.
    if (prev && list.some(function (w) { return (w.id || w.label) === prev; })) {
      sel.value = prev;
    }
  }

  // ============================================================
  // Progreso + log
  // ============================================================
  function setProgress(value, max, label) {
    var fill = $('progressFill'), pct = $('progressPct'), lbl = $('progressLabel');
    var p = 0;
    if (typeof value === 'number' && typeof max === 'number' && max > 0) {
      p = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
    }
    fill.style.width = p + '%';
    pct.textContent = p + '%';
    if (label !== undefined) lbl.textContent = label;
  }

  function setLog(line) {
    var logLine = $('logLine');
    if (logLine) logLine.textContent = line || '—';
  }

  function setBusy(busy) {
    var btn = $('btnGenerate');
    var cancel = $('btnCancel');
    if (btn) {
      btn.disabled = busy;
      btn.textContent = busy ? 'Generando…' : 'Generar';
    }
    if (cancel) cancel.classList.toggle('cw-hidden', !activeJobId && !busy);
  }

  // ============================================================
  // Resultado
  // ============================================================
  function showResult(job) {
    var empty = $('resultEmpty');
    var media = $('resultMedia');
    var foot = $('resultFoot');
    var promptEl = $('resultPrompt');
    var dl = $('btnDownload');

    clear(media);

    if (!job) {
      empty.classList.remove('cw-hidden');
      media.classList.add('cw-hidden');
      foot.classList.add('cw-hidden');
      return;
    }

    empty.classList.add('cw-hidden');
    promptEl.textContent = job.prompt || '(sin prompt)';

    if (job.status === 'error') {
      var errBox = el('div', 'cw-result-error', job.error || 'El trabajo terminó con error.');
      media.appendChild(errBox);
      media.classList.remove('cw-hidden');
      foot.classList.remove('cw-hidden');
      dl.classList.add('cw-hidden');
      return;
    }

    if (job.resultUrl) {
      var url = resolveUrl(job.resultUrl);
      if (isVideoUrl(url, job.resultMime)) {
        var video = el('video', 'cw-media');
        video.controls = true;
        video.preload = 'metadata';
        video.src = url;
        media.appendChild(video);
      } else if (isImageUrl(url, job.resultMime)) {
        var img = el('img', 'cw-media');
        img.src = url;
        img.alt = 'Resultado generado';
        img.loading = 'lazy';
        media.appendChild(img);
      } else {
        media.appendChild(el('div', 'cw-result-error', 'Resultado no reconocido como imagen ni video.'));
      }
      media.classList.remove('cw-hidden');
      foot.classList.remove('cw-hidden');
      dl.classList.remove('cw-hidden');
      dl.setAttribute('href', url);
      dl.setAttribute('download', downloadName(job));
    } else {
      media.appendChild(el('div', 'cw-result-empty', 'El trabajo todavía no tiene resultado.'));
      media.classList.remove('cw-hidden');
      foot.classList.remove('cw-hidden');
      dl.classList.add('cw-hidden');
    }
  }

  function downloadName(job) {
    var ext = job.kind === 'video' ? 'mp4' : 'png';
    var id = (job._id || 'comfyweb').toString().slice(-8);
    return 'comfyweb-' + id + '.' + ext;
  }

  // ============================================================
  // Historial
  // ============================================================
  function jobCard(job) {
    var card = el('button', 'cw-card');
    card.type = 'button';
    if (job._id === activeJobId) card.classList.add('is-active');

    var thumb = el('div', 'cw-card-thumb');
    if (job.resultUrl && isImageUrl(job.resultUrl, job.resultMime)) {
      var im = el('img', null);
      im.src = resolveUrl(job.resultUrl);
      im.alt = '';
      im.loading = 'lazy';
      thumb.appendChild(im);
    } else {
      thumb.appendChild(el('span', 'cw-card-ico', job.kind === 'video' ? '▶' : '▢'));
    }

    var body = el('div', 'cw-card-body');
    body.appendChild(el('div', 'cw-card-prompt', truncate(job.prompt || '(sin prompt)', 90)));

    var meta = el('div', 'cw-card-meta');
    meta.appendChild(el('span', 'cw-badge cw-badge-' + (job.status || 'queued'), statusLabel(job.status)));
    meta.appendChild(el('span', 'cw-card-date', formatDate(job.createdAt)));
    body.appendChild(meta);

    card.appendChild(thumb);
    card.appendChild(body);
    card.addEventListener('click', function () { selectJob(job._id); });
    return card;
  }

  function sortedJobs() {
    return Object.keys(jobs)
      .map(function (id) { return jobs[id]; })
      .sort(function (a, b) {
        var da = new Date(a.createdAt || 0).getTime();
        var db = new Date(b.createdAt || 0).getTime();
        return db - da;
      });
  }

  function renderHistory() {
    var grid = $('historyGrid');
    var emptyMsg = $('historyEmpty');
    var count = $('historyCount');
    var list = sortedJobs();

    clear(grid);
    list.forEach(function (job) { grid.appendChild(jobCard(job)); });

    if (count) count.textContent = String(list.length);
    if (emptyMsg) emptyMsg.classList.toggle('cw-hidden', list.length > 0);
  }

  function upsertJob(job) {
    if (!job || !job._id) return;
    jobs[job._id] = job;
  }

  function selectJob(id) {
    activeJobId = id;
    var job = jobs[id];
    if (!job) return;
    if (job.status === 'running' || job.status === 'queued') {
      var pr = job.progress || {};
      setProgress(pr.value, pr.max, statusLabel(job.status));
    } else {
      setProgress(100, 100, statusLabel(job.status));
    }
    setLog(job._id ? ('trabajo ' + String(job._id).slice(-8) + ' · ' + statusLabel(job.status)) : statusLabel(job.status));
    showResult(job);
    renderHistory();
    setBusy(false);
  }

  // ============================================================
  // Socket.io
  // ============================================================
  function loadSocketFallback() {
    var s = document.createElement('script');
    // Mismo origen, asset propio de la app (tambien esta en el FTP).
    s.src = (window.CONFIG.BASE || '') + '/vendor/socket.io.min.js';
    s.addEventListener('load', function () { connectSocket(); });
    s.addEventListener('error', function () {
      console.warn('[comfyweb] no se pudo cargar el cliente socket.io');
    });
    document.body.appendChild(s);
  }

  function connectSocket() {
    if (typeof io === 'undefined') { loadSocketFallback(); return; }

    socket = io(window.CONFIG.SOCKET_URL, {
      path: window.CONFIG.SOCKET_PATH,
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', function () {
      // Pide un estado fresco apenas conecta.
      refreshStatus();
    });

    socket.on('disconnect', function () {
      agent.online = false;
      agent.comfyConnected = false;
      renderAgent();
    });

    socket.on('connect_error', function () {
      agent.online = false;
      renderAgent();
    });

    socket.on('agent:status', onAgentStatus);
    socket.on('job:update', onJobUpdate);
    socket.on('job:log', onJobLog);
  }

  function onAgentStatus(data) {
    if (!data) return;
    agent.online = !!data.online;
    agent.comfyConnected = !!data.comfyConnected;
    if (data.info) agent.info = data.info;
    if (typeof data.queued === 'number') agent.queued = data.queued;
    if (agent.info && Object.prototype.toString.call(agent.info.workflows) === '[object Array]') {
      agentWorkflows = agent.info.workflows;
    }
    renderAgent();
  }

  function onJobUpdate(payload) {
    var job = payload && payload.job ? payload.job : payload;
    if (!job || !job._id) return;

    upsertJob(job);

    if (pendingSubmit) {
      pendingSubmit = false;
      setBusy(false);
    }

    // El trabajo "activo" es el que esta corriendo; si no hay, el recien llegado.
    if (job.status === 'running' || job.status === 'queued') {
      if (!activeJobId || job.status === 'running') activeJobId = job._id;
    }

    if (job._id === activeJobId) {
      var pr = job.progress || {};
      if (job.status === 'done' || job.status === 'error') {
        setProgress(100, 100, statusLabel(job.status));
      } else {
        setProgress(pr.value, pr.max, statusLabel(job.status));
      }
      setLog('trabajo ' + String(job._id).slice(-8) + ' · ' + statusLabel(job.status));
      if (job.status === 'done' || job.status === 'error') showResult(job);
    }

    if (typeof job.status === 'string' && (job.status === 'done' || job.status === 'error')) {
      refreshStatus();
    }

    renderHistory();
    if (activeJobId) setBusy(false);
  }

  function onJobLog(payload) {
    if (!payload) return;
    if (!activeJobId || payload.jobId === activeJobId) {
      setLog(payload.line || '');
    }
  }

  // ============================================================
  // REST
  // ============================================================
  function requireLogin() {
    if (!isLoggedIn()) {
      uiToast('Ingresá para ver y generar trabajos.', 'err');
      return false;
    }
    return true;
  }

  function refreshStatus() {
    if (!isLoggedIn() || typeof apiRequest !== 'function') return;
    apiRequest('/status', { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        onAgentStatus(data);
      })
      .catch(function () { /* agente desconectado: el banner ya lo dice */ });
  }

  function refreshJobs() {
    if (!isLoggedIn() || typeof apiRequest !== 'function') return;
    apiRequest('/jobs?mine=1&limit=30', { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.jobs) return;
        data.jobs.forEach(upsertJob);
        renderHistory();
      })
      .catch(function () { /* sin historial: dejamos la grilla vacia */ });
  }

  // ============================================================
  // Envio de trabajos
  // ============================================================
  function buildParams() {
    var kind = currentKind();
    var w = intFrom($('widthInput'), 1024, 64, 4096);
    var h = intFrom($('heightInput'), 1024, 64, 4096);
    var steps = intFrom($('stepsInput'), 25, 1, 150);

    // Contrato: params { storyboardSteps, videoWidth, videoHeight,
    //   seed?, samplerSteps?, cfgScale?, videoLength? }
    var params = { samplerSteps: steps, videoWidth: w, videoHeight: h };
    if (kind === 'video') params.storyboardSteps = steps;

    var seedRaw = $('seedInput').value.trim();
    if (seedRaw !== '') {
      var seed = parseInt(seedRaw, 10);
      if (!isNaN(seed)) params.seed = seed;
    }
    return params;
  }

  function uploadImage(file) {
    // FormData: NO setear Content-Type (el browser pone el boundary multipart).
    var headers = {};
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var fd = new FormData();
    fd.append('image', file);

    return fetch(window.CONFIG.API_URL + '/upload-image', {
      method: 'POST',
      headers: headers,
      body: fd,
      credentials: 'include'
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || !data || !data.success || !data.filename) {
          throw new Error((data && (data.message || data.error)) || ('HTTP ' + r.status));
        }
        return data.filename;
      });
    });
  }

  function sendJob(payload) {
    pendingSubmit = true;
    setBusy(true);
    setLog('enviando trabajo…');

    if (socket && socket.connected) {
      socket.emit('job:submit', payload);
      // Red de seguridad: si el agente no contesta, liberamos el boton.
      setTimeout(function () {
        if (pendingSubmit) { pendingSubmit = false; setBusy(false); }
      }, 8000);
      return;
    }

    // Sin socket: fallback REST.
    apiRequest('/jobs', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.job) {
          upsertJob(data.job);
          activeJobId = data.job._id;
          renderHistory();
          setLog('trabajo ' + String(data.job._id).slice(-8) + ' · ' + statusLabel(data.job.status));
        } else {
          uiToast('No se pudo encolar el trabajo.', 'err');
        }
      })
      .catch(function () {
        uiToast('No se pudo encolar: el agente local no está conectado.', 'err');
      })
      .then(function () {
        pendingSubmit = false;
        setBusy(false);
      });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!requireLogin()) { showLogin(); return; }

    var promptEl = $('promptInput');
    var prompt = promptEl.value.trim();
    if (!prompt) {
      uiToast('Escribí un prompt antes de generar.', 'err');
      promptEl.focus();
      return;
    }

    var payload = { kind: currentKind(), prompt: prompt, params: buildParams() };

    var refCheck = $('refCheck');
    var refFile = $('refFile');
    var hasRef = refCheck.checked && refFile.files && refFile.files[0];

    if (hasRef) {
      setBusy(true);
      setLog('subiendo imagen de referencia…');
      uploadImage(refFile.files[0])
        .then(function (filename) {
          payload.imageFilename = filename;
          sendJob(payload);
        })
        .catch(function (err) {
          setBusy(false);
          uiToast('No se pudo subir la imagen: ' + (err && err.message ? err.message : err), 'err');
        });
      return;
    }

    sendJob(payload);
  }

  function cancelActive() {
    if (!activeJobId) { uiToast('No hay un trabajo activo para cancelar.', 'err'); return; }
    var jobId = activeJobId;
    if (socket && socket.connected) {
      socket.emit('job:cancel', { jobId: jobId });
    } else {
      apiRequest('/jobs/' + jobId + '/cancel', { method: 'POST', headers: authHeaders() })
        .catch(function () { uiToast('No se pudo cancelar el trabajo.', 'err'); });
    }
    uiToast('Cancelación pedida.', 'ok');
  }

  // ============================================================
  // Identidad / sesion
  // ============================================================
  function updateAuthUI() {
    var logged = isLoggedIn();
    var btnLogin = $('btnLogin');
    var userInfo = $('userInfo');
    var userName = $('userName');
    if (btnLogin) btnLogin.classList.toggle('cw-hidden', logged);
    if (userInfo) userInfo.classList.toggle('cw-hidden', !logged);
    if (userName) userName.textContent = logged ? '@' + (getUserUsername() || 'usuario') : '';
  }

  // ============================================================
  // Init
  // ============================================================
  function init() {
    // Refs de formulario
    var kindSelect = $('kindSelect');
    var refCheck = $('refCheck');
    var refFile = $('refFile');
    var form = $('genForm');

    // Auth
    var btnLogin = $('btnLogin');
    var btnLogout = $('btnLogout');
    if (btnLogin) btnLogin.addEventListener('click', function () { showLogin(); });
    if (btnLogout) btnLogout.addEventListener('click', function () { logout(); });
    updateAuthUI();
    window.addEventListener('authStateChanged', function () { updateAuthUI(); refreshStatus(); refreshJobs(); });

    // Workflows
    populateWorkflows();
    if (kindSelect) kindSelect.addEventListener('change', populateWorkflows);

    // Imagen de referencia
    if (refCheck) {
      refCheck.addEventListener('change', function () {
        var wrap = $('refWrap');
        wrap.classList.toggle('cw-hidden', !refCheck.checked);
        if (!refCheck.checked && refFile) { refFile.value = ''; $('refName').textContent = 'Ningún archivo seleccionado'; }
      });
    }
    if (refFile) {
      refFile.addEventListener('change', function () {
        var f = refFile.files && refFile.files[0];
        $('refName').textContent = f ? (f.name + ' · ' + Math.round(f.size / 1024) + ' KB') : 'Ningún archivo seleccionado';
      });
    }

    // Envio
    if (form) form.addEventListener('submit', onSubmit);
    var promptInput = $('promptInput');
    if (promptInput) {
      promptInput.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onSubmit(e); }
      });
    }

    // Cancelar
    var btnCancel = $('btnCancel');
    if (btnCancel) btnCancel.addEventListener('click', cancelActive);

    // Socket + datos iniciales
    connectSocket();
    if (isLoggedIn()) { refreshStatus(); refreshJobs(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
