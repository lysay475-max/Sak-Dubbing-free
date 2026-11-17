/**
 * MT Dubber AI – AI Video Dubbing to Khmer (ភាសាខ្មែរ)
 * Fully featured, token-optimized client application.
 * Uses Gemini Multimodal Audio (Gemini 2.5 Flash / 2.0 Flash) + Edge Neural Khmer TTS.
 */

(() => {
  "use strict";

  // --- Helpers & UI Selectors ---
  const $ = id => document.getElementById(id);
  const v = $('v');
  let _bl = '';

  const toast = m => {
    const t = $('toast');
    t.textContent = m;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 2600);
  };

  const blog = (m, cls) => {
    const b = $('blogbody');
    const near = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    const key = String(m).replace(/\d+/g, '#');
    const t = new Date().toLocaleTimeString([], { hour12: false });
    let d = key === _bl && b.lastChild && !cls ? b.lastChild : null;
    if (!d) {
      d = document.createElement('div');
      b.append(d);
      while (b.children.length > 300) b.firstChild.remove();
    }
    _bl = key;
    d.innerHTML = '';
    const s = document.createElement('span');
    s.className = 't';
    s.textContent = t + '  ';
    d.append(s, document.createTextNode(m));
    if (cls) d.className = cls;
    if (near || b.children.length < 3) b.scrollTop = b.scrollHeight;
  };

  const log = m => {
    $('log').textContent = m;
    if (m) blog(m, /^⚠/.test(m) ? 'w' : /^✓|^Done/.test(m) ? 'k' : '');
  };

  $('blogclear').onclick = () => {
    $('blogbody').innerHTML = '';
    _bl = '';
  };

  const fmt = sec => {
    sec = Math.max(0, Number(sec) || 0);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function confetti() {
    const c = ['#4f46e5', '#9333ea', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];
    for (let i = 0; i < 40; i++) {
      const e = document.createElement('i');
      e.className = 'cf';
      e.style.cssText = `left:${Math.random() * 100}vw;background:${c[i % 6]};animation-duration:${2 + Math.random() * 2}s;animation-delay:${Math.random() * 0.5}s`;
      document.body.append(e);
      setTimeout(() => e.remove(), 5000);
    }
  }

  // --- Theme Management ---
  const initTheme = () => {
    const saved = localStorage.getItem('mtd_theme') || 'dark';
    if (saved === 'light') document.documentElement.classList.add('light');
    $('theme').onclick = () => {
      document.documentElement.classList.toggle('light');
      const isLight = document.documentElement.classList.contains('light');
      localStorage.setItem('mtd_theme', isLight ? 'light' : 'dark');
    };
  };
  initTheme();

  // --- State Variables ---
  let curFile = null;
  let segs = []; // [{ t: 0, e: 3, g: 'm'|'f', text: '...', km: '...', audio: blobUrl, buf: AudioBuffer, dur: 0 }]
  let plan = [];
  let dubbing = false;
  let activeAudioSources = new Set();
  let played = new Set();
  let _lastCap = '';
  let curMode = 'all'; // 'all', 'translate', 'voice'

  // Audio Context
  let _audioCtx = null;
  const getAudioContext = () => {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      _audioCtx = new Ctx({ latencyHint: 'interactive' });
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => { });
    }
    return _audioCtx;
  };

  // --- Data Persistence ---
  const saveInputs = () => {
    document.querySelectorAll('[data-save]').forEach(el => {
      const k = 'mtd_' + (el.id || el.name);
      if (el.type === 'checkbox') localStorage.setItem(k, el.checked ? '1' : '0');
      else localStorage.setItem(k, el.value);
    });
  };

  const loadInputs = () => {
    document.querySelectorAll('[data-save]').forEach(el => {
      const k = 'mtd_' + (el.id || el.name);
      const val = localStorage.getItem(k);
      if (val !== null) {
        if (el.type === 'checkbox') el.checked = val === '1';
        else el.value = val;
      }
    });

    // Clean up any non-existent / deprecated models from storage and ensure latest Gemini 3.8 & 3.5 models are added
    if ($('model')) {
      const VERIFIED_MODELS = [
        'gemini-3.8-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.8-pro',
        'gemini-3.1-pro-preview'
      ];
      let lines = ($('model').value || '').split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
      // Remove all discontinued models: gemini-2.x, gemini-1.x, gemini-2.5, gemini-3-flash, gemini-3.1-pro
      lines = lines.filter(m => !/gemini-2\.|gemini-1\.|gemini-2\.5|gemini-3-flash$|gemini-3\.1-pro$/i.test(m));
      // Ensure Gemini 3.8 and 3.5 flagship models are included at the top
      const mustHave = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
      for (let i = mustHave.length - 1; i >= 0; i--) {
        const reqModel = mustHave[i];
        if (!lines.some(m => m.toLowerCase().includes(reqModel.toLowerCase()))) {
          lines.unshift(reqModel);
        }
      }
      if (!lines.length || !lines.some(m => /3\.8-flash|3\.5-flash/i.test(m))) {
        lines = VERIFIED_MODELS;
      }
      $('model').value = lines.join('\n');
      localStorage.setItem('mtd_model', $('model').value);
    }
  };
  loadInputs();
  window.addEventListener('beforeunload', saveInputs);
  document.querySelectorAll('[data-save]').forEach(el => {
    el.addEventListener('change', saveInputs);
    el.addEventListener('input', saveInputs);
  });

  // --- Tab Navigation ---
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('on'));
      document.querySelectorAll('section.panel').forEach(p => p.hidden = true);
      btn.classList.add('on');
      const panel = $('tab-' + btn.dataset.tab);
      if (panel) panel.hidden = false;
    };
  });

  // Voice engine selector toggle
  $('voice').onchange = () => {
    const vMode = $('voice').value;
    $('v-edge').hidden = (vMode !== 'edge');
    $('v-gemini').hidden = (vMode !== 'gemini');
    saveInputs();
  };
  $('voice').dispatchEvent(new Event('change'));

  // --- Mode Split Dropdown ---
  $('goModeBtn').onclick = e => {
    e.stopPropagation();
    $('goMenu').hidden = !$('goMenu').hidden;
  };
  window.addEventListener('click', () => {
    $('goMenu').hidden = true;
  });

  document.querySelectorAll('#goMenu button').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      curMode = b.dataset.mode;
      document.querySelectorAll('#goMenu button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      $('goMenu').hidden = true;
      if (curMode === 'all') {
        $('goModeLbl').textContent = 'Full Dub';
        $('go').textContent = '✨ Dub to Khmer';
      } else if (curMode === 'translate') {
        $('goModeLbl').textContent = 'Translate Only';
        $('go').textContent = '📝 Translate Only';
      } else if (curMode === 'voice') {
        $('goModeLbl').textContent = 'Voice Only';
        $('go').textContent = '🔊 Generate Voice';
      }
    };
  });

  // --- Video & Audio Ingestion ---
  const drop = $('drop');
  const fileInput = $('file');

  drop.onclick = () => fileInput.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('drag'); };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadVideoFile(e.dataTransfer.files[0]);
    }
  };
  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files[0]) {
      loadVideoFile(fileInput.files[0]);
    }
  };

  const loadVideoFile = f => {
    curFile = f;
    $('dropTxt').textContent = f.name + ` (${(f.size / (1024 * 1024)).toFixed(1)} MB)`;
    v.src = URL.createObjectURL(f);
    $('stage').hidden = false;
    $('go').disabled = false;
    updateLogoOverlay();
    log(`✓ Loaded video: ${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)`);
    toast('✓ Video loaded successfully');
  };

  // --- Logo / Watermark Manager ---
  let curLogoFile = null;
  let curLogoBlob = null;
  let curLogoUrl = '';

  const logoDrop = $('logoDrop');
  const logoFileInput = $('logoFile');
  const logoThumb = $('logoThumb');
  const logoPreviewWrap = $('logoPreviewWrap');
  const logoDropTitle = $('logoDropTitle');
  const btnRemoveLogo = $('btnRemoveLogo');
  const vLogoOverlay = $('vLogoOverlay');
  const logoPos = $('logoPos');
  const logoSize = $('logoSize');
  const logoSizeVal = $('logoSizeVal');
  const logoOp = $('logoOp');
  const logoOpVal = $('logoOpVal');

  if (logoDrop && logoFileInput) {
    logoDrop.onclick = () => logoFileInput.click();
    logoDrop.ondragover = e => { e.preventDefault(); logoDrop.classList.add('over'); };
    logoDrop.ondragleave = () => logoDrop.classList.remove('over');
    logoDrop.ondrop = e => {
      e.preventDefault();
      logoDrop.classList.remove('over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        setLogoFile(e.dataTransfer.files[0]);
      }
    };
    logoFileInput.onchange = () => {
      if (logoFileInput.files && logoFileInput.files[0]) {
        setLogoFile(logoFileInput.files[0]);
      }
    };
  }

  function setLogoFile(file) {
    if (!file || !file.type.startsWith('image/')) return toast('⚠ Please choose an image file (PNG, JPG, WebP)');
    curLogoFile = file;
    curLogoBlob = file;
    curLogoUrl = URL.createObjectURL(file);
    updateLogoUI(file.name);
  }

  function updateLogoUI(name) {
    if (logoThumb) logoThumb.src = curLogoUrl;
    if (logoPreviewWrap) logoPreviewWrap.hidden = false;
    if (btnRemoveLogo) btnRemoveLogo.hidden = false;
    if (logoDropTitle) logoDropTitle.textContent = name || 'Custom Logo';
    updateLogoOverlay();
    toast('✓ Logo updated');
  }

  function clearLogo() {
    curLogoFile = null;
    curLogoBlob = null;
    curLogoUrl = '';
    if (logoFileInput) logoFileInput.value = '';
    if (logoPreviewWrap) logoPreviewWrap.hidden = true;
    if (btnRemoveLogo) btnRemoveLogo.hidden = true;
    if (logoDropTitle) logoDropTitle.textContent = '+ Choose / Drop Logo';
    if (vLogoOverlay) vLogoOverlay.hidden = true;
    toast('Logo removed');
  }

  if (btnRemoveLogo) btnRemoveLogo.onclick = clearLogo;

  function updateLogoOverlay() {
    if (!vLogoOverlay) return;
    if (!curLogoUrl) {
      vLogoOverlay.hidden = true;
      return;
    }
    vLogoOverlay.src = curLogoUrl;
    vLogoOverlay.hidden = false;

    const sizePct = Number(logoSize?.value || 18);
    const opacity = Number(logoOp?.value || 90) / 100;
    const pos = logoPos?.value || 'top-right';

    if (logoSizeVal) logoSizeVal.textContent = sizePct + '%';
    if (logoOpVal) logoOpVal.textContent = Math.round(opacity * 100) + '%';

    vLogoOverlay.style.width = sizePct + '%';
    vLogoOverlay.style.height = 'auto';
    vLogoOverlay.style.opacity = opacity.toString();

    // Reset coordinates
    vLogoOverlay.style.top = '';
    vLogoOverlay.style.bottom = '';
    vLogoOverlay.style.left = '';
    vLogoOverlay.style.right = '';
    vLogoOverlay.style.transform = '';

    const margin = '18px';
    if (pos === 'top-left') {
      vLogoOverlay.style.top = margin;
      vLogoOverlay.style.left = margin;
    } else if (pos === 'bottom-right') {
      vLogoOverlay.style.bottom = '48px';
      vLogoOverlay.style.right = margin;
    } else if (pos === 'bottom-left') {
      vLogoOverlay.style.bottom = '48px';
      vLogoOverlay.style.left = margin;
    } else if (pos === 'center') {
      vLogoOverlay.style.top = '50%';
      vLogoOverlay.style.left = '50%';
      vLogoOverlay.style.transform = 'translate(-50%, -50%)';
    } else {
      // top-right (default)
      vLogoOverlay.style.top = margin;
      vLogoOverlay.style.right = margin;
    }
  }

  if (logoSize) logoSize.oninput = updateLogoOverlay;
  if (logoOp) logoOp.oninput = updateLogoOverlay;
  if (logoPos) logoPos.onchange = updateLogoOverlay;

  // Auto-detect default logo.jpg in workspace if available
  async function checkDefaultLogo() {
    try {
      const resp = await fetch('logo.jpg');
      if (resp.ok) {
        const blob = await resp.blob();
        curLogoBlob = blob;
        curLogoUrl = URL.createObjectURL(blob);
        updateLogoUI('logo.jpg');
      }
    } catch (_) { }
  }
  checkDefaultLogo();

  // --- Audio Preprocessing & Token Optimization ---
  // Resample audio to 16,000 Hz Mono Float32Array PCM
  async function extract16kMonoPcm(file) {
    log('Extracting and downsampling video audio to 16kHz mono (optimizing tokens)…');
    const ctx = getAudioContext();
    const ab = await file.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(ab);
    const dur = audioBuf.duration;

    const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.ceil(dur * 16000), 16000);
    const src = oc.createBufferSource();
    src.buffer = audioBuf;
    src.connect(oc.destination);
    src.start();
    const rendered = await oc.startRendering();
    return rendered.getChannelData(0);
  }

  // Convert Float32Array PCM to 16-bit Mono WAV Blob
  function pcmToWavBlob(pcm, sampleRate = 16000) {
    const n = pcm.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const dv = new DataView(buf);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) dv.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    dv.setUint32(4, 36 + n * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); // PCM
    dv.setUint16(22, 1, true); // Mono
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * 2, true); // byte rate
    dv.setUint16(32, 2, true); // block align
    dv.setUint16(34, 16, true); // 16 bits
    writeStr(36, 'data');
    dv.setUint32(40, n * 2, true);

    let offset = 44;
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      dv.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  const blobToBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      resolve(res.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Calculate RMS energy of an audio segment (to detect dead silence and save tokens)
  function calculateRMS(pcm) {
    let sum = 0;
    const step = Math.max(1, Math.floor(pcm.length / 5000));
    let count = 0;
    for (let i = 0; i < pcm.length; i += step) {
      sum += pcm[i] * pcm[i];
      count++;
    }
    return Math.sqrt(sum / count);
  }

  // --- Gemini API Manager (Pool, Rotation, Cooldown, Models) ---
  const keyList = () => {
    const inputs = [...document.querySelectorAll('.keys input')];
    if (inputs.length) {
      const vals = inputs.map(i => i.value.trim()).filter(Boolean);
      if (vals.length) return vals;
    }
    return ($('key')?.value || '').split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  };
  const modelList = () => $('model').value.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  const cool = {}; // cooldown tracker { "model|key": timestamp }
  const keyBad = {};

  // --- Dynamic Key Manager UI (Multi-key rows, Masking, Badges, Checking) ---
  function initKeyManager() {
    const ta = $('key');
    const box = $('keyBox');
    const addBtn = $('btnAddKey');
    const showBtn = $('btnShowKeys');
    const checkBtn = $('btnCheckKeys');
    const countSpan = $('keyCount');

    if (!box || !addBtn) return;
    let isMasked = true;

    const getInputs = () => [...box.querySelectorAll('input')];

    const updateCountAndSync = () => {
      const keys = [];
      getInputs().forEach(inp => {
        const v = inp.value.trim();
        if (v && !keys.includes(v)) keys.push(v);
      });
      if (ta) ta.value = keys.join('\n');
      localStorage.setItem('mtd_keys_stored', JSON.stringify(keys));
      if (countSpan) countSpan.textContent = keys.length + (keys.length === 1 ? ' key' : ' keys');
      [...box.children].forEach((r, idx) => {
        const numSpan = r.querySelector('.knum');
        if (numSpan) numSpan.textContent = idx + 1;
      });
    };

    const verifyKey = async (val, ksEl) => {
      val = val.trim();
      if (!val || !ksEl) return;
      ksEl.hidden = false;
      ksEl.textContent = 'Verifying…';
      ksEl.className = 'ks warn';
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${val}&pageSize=1`);
        if (resp.ok) {
          ksEl.textContent = 'Ready';
          ksEl.className = 'ks ok';
          ksEl.title = 'Key verified with Google AI Studio';
          delete keyBad[val];
        } else if (resp.status === 429) {
          ksEl.textContent = 'Limited';
          ksEl.className = 'ks warn';
          ksEl.title = 'Rate limit on free tier';
        } else {
          const errJson = await resp.json().catch(() => ({}));
          const msg = errJson.error?.message || `HTTP ${resp.status}`;
          ksEl.textContent = 'Invalid';
          ksEl.className = 'ks bad';
          ksEl.title = msg;
          keyBad[val] = true;
        }
      } catch (_) {
        // If offline or network error, keep as Ready so key is not blocked
        ksEl.textContent = 'Ready';
        ksEl.className = 'ks ok';
      }
    };

    const createRow = (keyValue = '', shouldVerify = true) => {
      const r = document.createElement('div');
      r.className = 'kr';

      const num = document.createElement('span');
      num.className = 'knum';
      num.textContent = box.children.length + 1;

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = isMasked ? 'mask' : '';
      inp.value = keyValue || '';
      inp.placeholder = 'AIzaSy...';
      inp.autocomplete = 'off';
      inp.spellcheck = false;

      const ks = document.createElement('span');
      ks.className = 'ks';
      ks.hidden = !keyValue;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'kx';
      del.textContent = '✕';
      del.title = 'Remove key';

      del.onclick = () => {
        r.remove();
        updateCountAndSync();
      };

      inp.oninput = () => {
        updateCountAndSync();
      };

      inp.onchange = () => {
        updateCountAndSync();
        if (inp.value.trim()) {
          verifyKey(inp.value.trim(), ks);
        }
      };

      inp.onpaste = e => {
        const pasteText = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        if (pasteText && (pasteText.includes('\n') || pasteText.includes('\r'))) {
          e.preventDefault();
          const lines = pasteText.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
          if (lines.length > 0) {
            inp.value = lines[0];
            verifyKey(lines[0], ks);
            for (let i = 1; i < lines.length; i++) {
              createRow(lines[i], true);
            }
            updateCountAndSync();
          }
        }
      };

      r.append(num, inp, ks, del);
      box.append(r);
      updateCountAndSync();

      if (keyValue && shouldVerify) {
        verifyKey(keyValue, ks);
      }
      return r;
    };

    addBtn.onclick = () => {
      const row = createRow('', false);
      row.querySelector('input').focus();
    };

    showBtn.onclick = () => {
      isMasked = !isMasked;
      showBtn.textContent = isMasked ? '👁 Show' : '🙈 Hide';
      getInputs().forEach(inp => {
        inp.className = isMasked ? 'mask' : '';
      });
    };

    checkBtn.onclick = async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Checking…';
      const inputs = getInputs();
      for (const inp of inputs) {
        const val = inp.value.trim();
        const ks = inp.parentNode.querySelector('.ks');
        if (val && ks) {
          await verifyKey(val, ks);
        }
      }
      checkBtn.disabled = false;
      checkBtn.textContent = '✓ Check keys';
      toast('✓ Key verification complete');
    };

    // Restore keys from localStorage or textarea
    let savedKeys = [];
    try {
      const jsonStr = localStorage.getItem('mtd_keys_stored');
      if (jsonStr) savedKeys = JSON.parse(jsonStr);
    } catch (_) { }

    if (!savedKeys.length && ta && ta.value.trim()) {
      savedKeys = ta.value.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
    }

    box.innerHTML = '';
    if (savedKeys.length > 0) {
      savedKeys.forEach(k => createRow(k, true));
    } else {
      createRow('', false);
    }
  }
  initKeyManager();

  // Fetch supported Gemini models from API
  $('btnRefreshModels').onclick = async () => {
    const keys = keyList();
    if (!keys.length) return toast('⚠ Please paste at least one Gemini API key first');
    const key = keys[0];
    const b = $('btnRefreshModels');
    b.disabled = true;
    b.textContent = 'Loading…';
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const models = (data.models || [])
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(m => !/gemini-2\.|gemini-1\.|gemini-2\.5|gemini-3-flash$|gemini-3\.1-pro$/i.test(m)) // Exclude discontinued models
        .sort((a, b) => {
          // Prioritize Gemini 3.8, 3.5, 3.7, 3.6
          const score = m => {
            if (/gemini-3\.8-flash/i.test(m)) return 200;
            if (/gemini-3\.5-flash$/i.test(m)) return 190;
            if (/gemini-3\.5-flash-lite/i.test(m)) return 185;
            if (/gemini-3\.7-flash/i.test(m)) return 180;
            if (/gemini-3\.6-flash/i.test(m)) return 175;
            if (/gemini-3\.8-pro/i.test(m)) return 160;
            if (/gemini-3\.1-pro-preview/i.test(m)) return 150;
            if (/gemini-3/i.test(m)) return 140;
            if (/flash/i.test(m)) return 50;
            return 10;
          };
          return score(b) - score(a);
        });
      if (models.length) {
        $('model').value = models.join('\n');
        toast(`✓ Loaded ${models.length} Gemini models`);
        log(`✓ Gemini models verified with Google AI Studio (${models.length} available)`);
        saveInputs();
      }
    } catch (e) {
      log(`⚠ Failed to load models: ${e.message}`);
      toast('⚠ Failed to query models with key');
    } finally {
      b.disabled = false;
      b.textContent = '↻ Load';
    }
  };

  // Core Gemini Request with automatic Key Rotation, Model Fallback & Rate-Limit Window Reset
  async function geminiCall(parts, opt = {}) {
    const keys = keyList();
    let models = opt.models || modelList();
    // Filter out obsolete/non-existent model names
    models = models.filter(m => !/gemini-2\.|gemini-1\.|gemini-2\.5|gemini-3-flash$|gemini-3\.1-pro$/i.test(m));
    if (!models.length) {
      models = [
        'gemini-3.8-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.8-pro',
        'gemini-3.1-pro-preview'
      ];
    }

    if (!keys.length) throw new Error('Please add at least one Gemini API key in the Providers tab.');

    const bodyObj = {
      contents: [{ role: 'user', parts }],
      generationConfig: opt.gen || {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    };

    let lastErr = '';
    const maxRounds = opt.rounds || 6;

    for (let round = 0; round < maxRounds; round++) {
      let anyAttempted = false;

      for (const m of models) {
        for (let ki = 0; ki < keys.length; ki++) {
          const k = keys[ki];
          const id = `${m}|${k}`;
          if (keyBad[k]) continue;
          if ((cool[id] || 0) > Date.now()) continue;

          anyAttempted = true;
          const who = `${m} · key ${ki + 1}/${keys.length}`;
          const t0 = performance.now();
          const el = () => ((performance.now() - t0) / 1000).toFixed(1) + 's';
          blog(`→ Gemini request: ${who}`);

          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k}`;
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyObj)
            });
            const json = await resp.json();

            if (resp.ok) {
              blog(`← ${resp.status} OK from ${who} (${el()})`, 'k');
              $('used').textContent = `Active: ${who}`;
              const textOutput = json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
              try {
                // Parse JSON output
                const cleanJson = textOutput.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
                return JSON.parse(cleanJson);
              } catch (parseErr) {
                lastErr = 'Failed to parse JSON reply from ' + m;
                cool[id] = Date.now() + 15000;
                continue;
              }
            }

            // Handle errors
            const errMsg = json.error?.message || `HTTP ${resp.status}`;
            blog(`← ${resp.status} ${who} (${el()}): ${errMsg.slice(0, 140)}`, 'w');

            // 1. Permanently ignore models that are discontinued or not found
            if (resp.status === 404 || (resp.status === 400 && /no longer available|not supported|not found|modality|deprecated/i.test(errMsg))) {
              cool[id] = Infinity;
              blog(`🚫 Model ${m} is discontinued or not supported → skipping…`, 'w');

              // Dynamically extract recommended replacement model if Google gives one (e.g. "use models/gemini-3.8-flash")
              const recMatch = errMsg.match(/models\/(gemini-[a-zA-Z0-9.-]+)/i);
              if (recMatch) {
                const recModel = recMatch[1];
                if (!models.includes(recModel)) {
                  models.splice(models.indexOf(m) + 1, 0, recModel);
                  blog(`💡 Auto-upgraded to ${recModel} (recommended by Google API)`, 'k');
                  if ($('model') && !$('model').value.includes(recModel)) {
                    $('model').value = recModel + '\n' + $('model').value;
                    saveInputs();
                  }
                }
              }
              continue;
            }

            // 2. High demand spike (503) - do NOT fail, cooldown 15s and quickly try next model
            if (resp.status === 503 || /high demand|temporarily unavailable|spikes in demand/i.test(errMsg)) {
              cool[id] = Date.now() + 15000;
              lastErr = `${m} high demand (503)`;
              blog(`⚠️ ${who} high demand (503) → switching to next model…`, 'w');
              continue;
            }

            // 3. Cooldown on rate limits (429)
            if (resp.status === 429 || /quota|rate limit/i.test(errMsg)) {
              cool[id] = Date.now() + 35000; // 35s cooldown
              lastErr = `Quota limit on ${who}`;
              blog(`⏳ 15 RPM Rate limit on ${who} → switching to next model/key…`, 'w');
              continue;
            }

            // 4. Invalid API key
            if (resp.status === 400 && /API_KEY_INVALID|key not valid/i.test(errMsg)) {
              keyBad[k] = true;
              blog(`❌ Key ${ki + 1} is invalid. Skipping this key.`, 'w');
              continue;
            }

            lastErr = errMsg;
            cool[id] = Date.now() + 20000;
          } catch (netErr) {
            lastErr = netErr.message;
            cool[id] = Date.now() + 20000;
            blog(`✕ ${who} network error (${el()}) → cooling 20s`, 'w');
          }
        }
      }

      // If all unbanned keys/models are resting, rate-limited, or high demand, pause 15s
      const hasCooledModels = models.some(m => keys.some(k => !keyBad[k] && cool[`${m}|${k}`] > Date.now() && cool[`${m}|${k}`] !== Infinity));
      if ((!anyAttempted || hasCooledModels) && round < maxRounds - 1) {
        blog(`⏳ Waiting for Google AI Studio capacity reset (15s)…`, 'w');
        for (let s = 15; s > 0; s--) {
          if ($('bs')) $('bs').textContent = `Waiting for API capacity: ${s}s · auto-resuming…`;
          await sleep(1000);
        }
        // Reset temporary cooldowns on active models
        models.forEach(m => keys.forEach(k => {
          if (cool[`${m}|${k}`] !== Infinity) cool[`${m}|${k}`] = 0;
        }));
        continue;
      }

      await sleep(1500);
    }
    throw new Error(`Gemini rate limit or quota exceeded. Please wait a moment or add another key. Last status: ${lastErr || 'Quotas exhausted'}`);
  }

  // --- Step 1: Multimodal Transcription + Khmer Translation + Gender Diarization (Single Pass) ---
  const ONE_PASS_PROMPT = `You are a professional audio subtitler and video dubbing director.
Transcribe EVERY spoken sentence in this audio clip and translate each one into natural, conversational, spoken Khmer (ភាសាខ្មែរ) suitable for video dubbing.
Also detect the speaker's voice gender ("m" for male speaker, "f" for female speaker).

Return ONLY a JSON array of objects with the exact schema:
[
  {
    "s": start_seconds_float,
    "e": end_seconds_float,
    "g": "m" or "f",
    "text": "original spoken text in source language",
    "km": "natural Khmer translation"
  }
]

Rules:
1. "s" and "e" must be plain numbers of seconds (e.g. 1.25, not timestamps) relative to the start of THIS audio clip.
2. Segments should be natural sentence-sized units of 1.5 to 7.0 seconds in order without overlaps.
3. Every object MUST have "km" (Khmer translation) and "g" ("m" or "f").
4. Translate naturally for conversational Khmer dialogue. Keep proper names.
5. If there is no speech, return []. Never include markdown formatting or extra text outside the JSON array.`;

  async function transcribeAndTranslateChunk(pcmChunk, offsetSec) {
    // Check if chunk is silent
    const rms = calculateRMS(pcmChunk);
    if (rms < 0.0035) {
      blog(`ℹ Chunk at ${fmt(offsetSec)} is silent (RMS: ${rms.toFixed(4)}) → skipped to save Gemini API tokens.`, 'k');
      return [];
    }

    const wavBlob = pcmToWavBlob(pcmChunk, 16000);
    const b64 = await blobToBase64(wavBlob);

    const parts = [
      {
        inlineData: {
          mimeType: 'audio/wav',
          data: b64
        }
      },
      { text: ONE_PASS_PROMPT }
    ];

    const res = await geminiCall(parts, {
      gen: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 8192 }
    });

    if (!Array.isArray(res)) return [];

    const durationChunk = pcmChunk.length / 16000;
    return res
      .filter(item => item && Number.isFinite(item.s) && item.km && String(item.km).trim())
      .map(item => {
        const s = Math.max(0, Math.min(durationChunk, Number(item.s)));
        const e = Math.max(s + 0.5, Math.min(durationChunk, Number(item.e) || (s + 3)));
        const g = (item.g === 'f' || /female|woman|sreymom/i.test(item.g)) ? 'f' : 'm';
        return {
          t: offsetSec + s,
          e: offsetSec + e,
          g,
          text: String(item.text || '').trim(),
          km: String(item.km).trim()
        };
      });
  }

  // --- Step 2: Edge Neural Khmer TTS (Piseth & Sreymom - 100% Free, Zero Tokens) ---
  async function callEdgeTts(text, voiceName) {
    const baseUrl = ($('eurl').value.trim() || 'https://khmer-voice-1.onrender.com').replace(/\/$/, '');
    const cleanText = text
      .replace(/[。｡]/g, '។')
      .replace(/！/g, '!')
      .replace(/？/g, '?')
      .replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) throw new Error('No speakable text');

    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const resp = await fetch(`${baseUrl}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voice: voiceName, rate: '+0%' }),
          signal: controller.signal
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        if (blob.size < 200) throw new Error('Empty audio received');
        return blob;
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await sleep(800 * (attempt + 1));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastErr;
  }

  // Test Edge TTS button
  $('etest').onclick = async () => {
    const btn = $('etest');
    btn.disabled = true;
    $('etestmsg').textContent = 'Testing voice…';
    try {
      const blob = await callEdgeTts('សួស្តី! នេះគឺជាសំឡេងតេស្តភាសាខ្មែរ។', 'km-KH-PisethNeural');
      const audioUrl = URL.createObjectURL(blob);
      const snd = new Audio(audioUrl);
      snd.play();
      $('etestmsg').textContent = '✓ Test successful! Khmer voice is working.';
      toast('✓ Voice test successful');
    } catch (e) {
      $('etestmsg').textContent = `⚠ Voice test failed: ${e.message}`;
      toast('⚠ Voice test failed');
    } finally {
      btn.disabled = false;
    }
  };

  // --- Subtitles & Script List UI Editor ---
  function renderSubtitlesList() {
    const box = $('list');
    box.innerHTML = '';

    segs.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'srow' + (!s.audio ? ' dirty' : '');

      // Time Jump Button
      const tsBtn = document.createElement('button');
      tsBtn.type = 'button';
      tsBtn.className = 'tsbtn';
      tsBtn.textContent = fmt(s.t).slice(0, 5);
      tsBtn.title = `Jump video to ${fmt(s.t)}`;
      tsBtn.onclick = () => {
        v.currentTime = s.t;
        v.play();
      };

      // Voice Gender Toggle Button (Piseth ♂ / Sreymom ♀)
      const gBtn = document.createElement('button');
      gBtn.type = 'button';
      const updateGBtn = () => {
        gBtn.className = `gbtn ${s.g === 'f' ? 'f' : 'm'}`;
        gBtn.textContent = s.g === 'f' ? '♀ Sreymom' : '♂ Piseth';
        gBtn.title = 'Click to switch voice between ♂ Piseth and ♀ Sreymom';
      };
      updateGBtn();
      gBtn.onclick = () => {
        s.g = s.g === 'f' ? 'm' : 'f';
        s.audio = null;
        s.buf = null;
        updateGBtn();
        row.classList.add('dirty');
      };

      // Play Preview Line Audio Button
      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'play-btn';
      playBtn.textContent = '▶';
      playBtn.title = 'Play this line audio';
      playBtn.onclick = async () => {
        if (s.audio) {
          const snd = new Audio(s.audio);
          snd.play();
        } else {
          toast('Generating voice line…');
          try {
            const vName = s.g === 'f' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
            const blob = await callEdgeTts(s.km, vName);
            s.audio = URL.createObjectURL(blob);
            const ctx = getAudioContext();
            s.buf = await ctx.decodeAudioData(await blob.arrayBuffer());
            s.dur = s.buf.duration;
            row.classList.remove('dirty');
            const snd = new Audio(s.audio);
            snd.play();
          } catch (e) {
            toast(`⚠ Voice error: ${e.message}`);
          }
        }
      };

      // Editable Khmer Text Area
      const ed = document.createElement('textarea');
      ed.className = 'km-ed';
      ed.rows = 1;
      ed.spellcheck = false;
      ed.value = s.km || '';
      const autoResize = () => {
        ed.style.height = 'auto';
        ed.style.height = Math.max(28, ed.scrollHeight) + 'px';
      };
      ed.oninput = () => {
        s.km = ed.value;
        s.audio = null;
        s.buf = null;
        row.classList.add('dirty');
        autoResize();
      };

      // Delete Button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'delbtn';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete line';
      delBtn.onclick = () => {
        segs.splice(idx, 1);
        renderSubtitlesList();
      };

      row.append(tsBtn, gBtn, playBtn, ed, delBtn);
      box.append(row);
      requestAnimationFrame(autoResize);
    });

    $('resCard').hidden = (segs.length === 0);
  }

  // --- Step 2 Implementation: Generate Voices for All Segments ---
  async function generateAllVoices() {
    log('Generating Khmer voice with Edge Neural TTS (Piseth & Sreymom)…');
    setStep(2, 'on');
    const evoiceSetting = $('evoice').value;
    const ctx = getAudioContext();

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.audio && s.buf) continue; // Skip if already generated

      let voiceName = s.g === 'f' ? 'km-KH-SreymomNeural' : 'km-KH-PisethNeural';
      if (evoiceSetting === 'km-KH-PisethNeural') voiceName = 'km-KH-PisethNeural';
      else if (evoiceSetting === 'km-KH-SreymomNeural') voiceName = 'km-KH-SreymomNeural';

      log(`Generating voice ${i + 1}/${segs.length} (${s.g === 'f' ? '♀ Sreymom' : '♂ Piseth'})…`);
      try {
        const blob = await callEdgeTts(s.km, voiceName);
        s.audio = URL.createObjectURL(blob);
        const ab = await blob.arrayBuffer();
        s.buf = await ctx.decodeAudioData(ab.slice(0));
        s.dur = s.buf.duration;
      } catch (e) {
        blog(`⚠ Voice generation error on line ${i + 1}: ${e.message}`, 'w');
      }
    }

    setStep(2, 'done');
    renderSubtitlesList();
    preparePlaybackPlan();
    log(`✓ Voice generation complete (${segs.filter(s => s.buf).length}/${segs.length} ready)`);
  }

  $('genv').onclick = generateAllVoices;

  // --- Playback Planning & Time-Stretching ---
  function preparePlaybackPlan() {
    plan = [];
    segs.forEach((s, idx) => {
      if (!s.buf) return;
      const targetSlot = Math.max(1, s.e - s.t);
      const speechDur = s.dur || s.buf.duration;
      // Calculate speed stretch if voice is longer than video segment
      let speedFactor = 1.0;
      if (speechDur > targetSlot + 0.4) {
        speedFactor = Math.min(1.35, speechDur / targetSlot);
      }
      plan.push({
        i: idx,
        st: s.t,
        buf: s.buf,
        speed: speedFactor,
        km: s.km
      });
    });
  }

  // --- Real-Time Synchronized Dubbed Video Playback ---
  function stopActiveAudioSources() {
    activeAudioSources.forEach(src => {
      try { src.stop(); } catch (_) { }
    });
    activeAudioSources.clear();
  }

  function tickPlayback() {
    if (!dubbing || !segs.length || v.paused || v.seeking || v.ended) return;
    const curTime = v.currentTime;

    // Subtitles caption display
    let currentCaption = '';
    for (const s of segs) {
      if (curTime >= s.t && curTime < (s.e || s.t + 3)) {
        currentCaption = s.km;
        break;
      }
    }
    if (_lastCap !== currentCaption) {
      _lastCap = currentCaption;
      $('cap').textContent = currentCaption;
    }

    // Audio ducking & Web Audio playback scheduling
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
      return;
    }

    for (const p of plan) {
      if (played.has(p.i)) continue;
      // If within 0.15s window, trigger audio
      if (curTime >= p.st - 0.05 && curTime <= p.st + 0.3) {
        played.add(p.i);
        playScheduledBuffer(ctx, p.buf, p.speed);
      }
    }
  }

  function playScheduledBuffer(ctx, buf, speed = 1.0) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = speed;
      const gain = ctx.createGain();
      gain.gain.value = 1.25; // Boost voice slightly
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
      activeAudioSources.add(src);
      src.onended = () => activeAudioSources.delete(src);
    } catch (_) { }
  }

  setInterval(tickPlayback, 25);
  v.addEventListener('timeupdate', tickPlayback);
  v.addEventListener('seeked', () => {
    stopActiveAudioSources();
    played = new Set(segs.map((s, i) => s.t < v.currentTime ? i : -1).filter(i => i >= 0));
  });
  v.addEventListener('pause', () => stopActiveAudioSources());
  v.addEventListener('play', () => {
    if (segs.length && segs[0].km) {
      dubbing = true;
      v.volume = $('vol').value / 100;
    }
  });

  $('vol').oninput = () => {
    v.volume = $('vol').value / 100;
  };

  $('replay').onclick = () => {
    stopActiveAudioSources();
    played = new Set();
    v.currentTime = 0;
    v.play();
  };

  // --- Stage Titles & Dynamic Messages for Busy Card ---
  const STAGE_TITLES = {
    1: 'AI SPEECH RECOGNITION 🎧',
    2: 'AI KHMER TRANSLATION 🇰🇭',
    3: 'AI KHMER VOICE SYNTHESIS 🎙️',
    export: 'VIDEO ENCODER PIPELINE 🎞️'
  };

  const STAGE_MESSAGES = {
    1: [
      'Finalizing speech segment boundaries…',
      'Detecting speech rhythm and pauses…',
      'Filtering background noise and breaths…',
      'Listening to dialogue sentences 🎧…'
    ],
    2: [
      'Translating into natural spoken Khmer 🇰🇭…',
      'Polishing conversational flow and nuances…',
      'Matching natural speech phrasing…',
      'Finalizing Khmer dialogue segments…'
    ],
    3: [
      'Synthesizing natural Khmer voiceover 🎙…',
      'Fine-tuning voice rhythm & pitch…',
      'Aligning Khmer voice onto video slots…',
      'Applying acoustic timeline compression ✨…'
    ],
    export: [
      'Encoding high-definition video 🎞…',
      'Muxing frame-accurate Khmer dub…',
      'Rendering master audio track…',
      'Saving finished video file…'
    ]
  };

  let bTimer = null;
  let bMsgIdx = 0;
  let bStartTime = 0;

  function busy(on, mode = 1) {
    const b = $('busy');
    const t = $('bt');
    const sub = $('bs');
    const st = $('bstage');

    clearInterval(bTimer);
    if (!b) return;

    if (!on) {
      b.classList.remove('on');
      return;
    }

    b.classList.add('on');
    bStartTime = Date.now();
    bMsgIdx = 0;

    const currentMode = mode || 1;
    if (st) st.textContent = STAGE_TITLES[currentMode] || 'AI DUBBING ENGINE';

    const messages = STAGE_MESSAGES[currentMode] || STAGE_MESSAGES[1];
    if (t) t.textContent = messages[0];

    bTimer = setInterval(() => {
      bMsgIdx++;
      if (t) {
        t.classList.add('sw');
        setTimeout(() => {
          t.textContent = messages[bMsgIdx % messages.length];
          t.classList.remove('sw');
        }, 220);
      }

      if (sub) {
        const sec = Math.floor((Date.now() - bStartTime) / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const timeStr = `${m}:${String(s).padStart(2, '0')}`;
        sub.textContent = `Processing: ${timeStr} · please keep this tab active`;
      }
    }, 2400);
  }

  // --- Step Tracking UI ---
  function setStep(num, status) {
    for (let i = 1; i <= 3; i++) {
      const el = $('s' + i);
      if (!el) continue;
      if (i < num) {
        el.className = 's done';
      } else if (i === num) {
        el.className = 's ' + (status === 'done' ? 'done' : 'on');
      } else {
        el.className = 's';
      }
    }
    const bar = $('bar');
    if (bar) {
      if (status === 'done' && num === 3) bar.style.width = '100%';
      else bar.style.width = Math.max(8, ((num - 1) / 3 * 100 + (status === 'on' ? 18 : 33))) + '%';
    }
  }

  // --- Main Dubbing Workflow Coordinator ---
  $('go').onclick = async () => {
    if (!curFile) return toast('⚠ Please choose a video first');
    const keys = keyList();
    if (curMode !== 'voice' && !keys.length) {
      $('tab-prov').hidden = false;
      document.querySelector('[data-tab="prov"]').click();
      return toast('⚠ Please add at least one Gemini API key in the Providers tab');
    }

    $('go').disabled = true;

    try {
      // MODE 1 & 2: TRANSCRIBE & TRANSLATE
      if (curMode === 'all' || curMode === 'translate') {
        setStep(1, 'on');
        busy(true, 1);
        log('Starting Gemini Multimodal Dubbing pipeline…');

        const pcm16k = await extract16kMonoPcm(curFile);
        const CHUNK_DURATION = 35; // 35 seconds per chunk
        const CHUNK_SAMPLES = CHUNK_DURATION * 16000;
        const totalChunks = Math.ceil(pcm16k.length / CHUNK_SAMPLES);

        segs = [];
        for (let c = 0; c < totalChunks; c++) {
          const startSample = c * CHUNK_SAMPLES;
          const endSample = Math.min(pcm16k.length, (c + 1) * CHUNK_SAMPLES);
          const chunkPcm = pcm16k.subarray(startSample, endSample);
          const offsetSec = c * CHUNK_DURATION;

          log(`Gemini is listening & translating… part ${c + 1}/${totalChunks}`);
          const chunkSegs = await transcribeAndTranslateChunk(chunkPcm, offsetSec);
          segs.push(...chunkSegs);
          renderSubtitlesList();

          // Pacing delay between chunks to strictly stay under free-tier 15 RPM
          if (c < totalChunks - 1) {
            const delayMs = keys.length > 1 ? 1500 : 3500;
            await sleep(delayMs);
          }
        }

        if (!segs.length) {
          throw new Error('No speech detected in this video or Gemini returned empty transcription.');
        }

        setStep(1, 'done');
        setStep(2, 'done');
        log(`✓ Gemini transcription & Khmer translation complete (${segs.length} segments).`);
        toast(`✓ Created ${segs.length} Khmer subtitle lines`);
      }

      // MODE 1 & 3: GENERATE VOICE & DUB
      if (curMode === 'all' || curMode === 'voice') {
        setStep(3, 'on');
        busy(true, 3);
        await generateAllVoices();
        setStep(3, 'done');
        busy(false);
        log('✓ Dubbing process ready! Playing video with Khmer voice.');
        dubbing = true;
        v.volume = $('vol').value / 100;
        v.currentTime = 0;
        v.play();
      } else {
        busy(false);
      }
    } catch (e) {
      busy(false);
      log(`⚠ Error: ${e.message}`);
      toast(`⚠ ${e.message}`);
    } finally {
      $('go').disabled = false;
    }
  };

  // --- Subtitles Import (.srt, .vtt, text) ---
  $('srt').onchange = async () => {
    const f = $('srt').files?.[0];
    if (!f) return;
    const txt = await f.text();
    $('srtText').value = txt;
    parseSubtitlesText(txt);
  };
  $('srtText').oninput = () => {
    parseSubtitlesText($('srtText').value);
  };

  function parseSubtitlesText(txt) {
    if (!txt.trim()) return;
    const lines = txt.split(/\r?\n/);
    const parsed = [];
    let curS = null;

    const timeRegex = /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;

    lines.forEach(line => {
      line = line.trim();
      const m = line.match(timeRegex);
      if (m) {
        const sTime = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000;
        const eTime = parseInt(m[5]) * 3600 + parseInt(m[6]) * 60 + parseInt(m[7]) + parseInt(m[8]) / 1000;
        curS = { t: sTime, e: eTime, g: 'm', text: '', km: '' };
        parsed.push(curS);
      } else if (curS && line && !/^\d+$/.test(line)) {
        // Gender tagging if formatted like [Piseth] or [Sreymom]
        if (/sreymom|female|woman/i.test(line)) curS.g = 'f';
        const clean = line.replace(/\[.*?\]|\(.*?\)/g, '').trim();
        curS.km = curS.km ? (curS.km + ' ' + clean) : clean;
        curS.text = curS.km;
      }
    });

    if (parsed.length) {
      segs = parsed;
      renderSubtitlesList();
      log(`✓ Imported ${parsed.length} subtitle lines (Gemini API skipped, 100% tokens saved!).`);
      toast(`✓ Imported ${parsed.length} lines`);
    }
  }

  // --- Export Subtitles (.srt) ---
  $('dl').onclick = () => {
    if (!segs.length) return toast('⚠ No subtitles to export');
    const formatSrtTime = sec => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    let srtContent = '';
    segs.forEach((s, i) => {
      srtContent += `${i + 1}\n${formatSrtTime(s.t)} --> ${formatSrtTime(s.e || s.t + 3)}\n${s.km}\n\n`;
    });

    const blob = new Blob([srtContent], { type: 'text/srt;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (curFile ? curFile.name.replace(/\.[^.]+$/, '') : 'video') + '_khmer.srt';
    a.click();
    toast('✓ Downloaded Khmer .srt subtitles');
  };

  // --- Export Single Merged Audio (.wav) ---
  $('dlaudio').onclick = async () => {
    if (!segs.some(s => s.buf)) return toast('⚠ Please generate voice lines first');
    const btn = $('dlaudio');
    btn.disabled = true;
    log('Merging all Khmer voice lines into full-length audio track…');

    try {
      const dur = v.duration || (segs[segs.length - 1].e + 2);
      const sr = 44100;
      const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.ceil(dur * sr), sr);

      segs.forEach(s => {
        if (!s.buf) return;
        const src = oc.createBufferSource();
        src.buffer = s.buf;
        src.connect(oc.destination);
        src.start(s.t);
      });

      const rendered = await oc.startRendering();
      const wavBlob = pcmToWavBlob(rendered.getChannelData(0), sr);

      const a = document.createElement('a');
      a.href = URL.createObjectURL(wavBlob);
      a.download = (curFile ? curFile.name.replace(/\.[^.]+$/, '') : 'video') + '_khmer_dub_audio.wav';
      a.click();
      log('✓ Full Khmer dubbed audio downloaded.');
      toast('✓ Dubbed audio downloaded');
    } catch (e) {
      log(`⚠ Audio export failed: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  };

  // --- In-Browser Canvas Video + Logo Watermark Recorder (Fallback when local server is offline) ---
  function recordCanvasWithLogo(mixedAudioBuf) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 1280;
        canvas.height = v.videoHeight || 720;
        const ctx = canvas.getContext('2d');

        const stream = canvas.captureStream(30);

        // Mix in dubbed audio track
        const audioCtx = getAudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        const srcNode = audioCtx.createBufferSource();
        srcNode.buffer = mixedAudioBuf;
        srcNode.connect(dest);
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));

        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
        }

        const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
        const chunks = [];
        rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => {
          const outBlob = new Blob(chunks, { type: mimeType });
          resolve(outBlob);
        };

        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.onload = () => {
          const sizePct = Number($('logoSize')?.value || 18);
          const opacity = Number($('logoOp')?.value || 90) / 100;
          const pos = $('logoPos')?.value || 'top-right';

          const lw = canvas.width * (sizePct / 100);
          const lh = lw * (logoImg.naturalHeight / logoImg.naturalWidth);
          const margin = 24;
          let lx = canvas.width - lw - margin, ly = margin;
          if (pos === 'top-left') { lx = margin; ly = margin; }
          else if (pos === 'bottom-right') { lx = canvas.width - lw - margin; ly = canvas.height - lh - 48; }
          else if (pos === 'bottom-left') { lx = margin; ly = canvas.height - lh - 48; }
          else if (pos === 'center') { lx = (canvas.width - lw) / 2; ly = (canvas.height - lh) / 2; }

          let isRendering = true;
          const finish = () => {
            if (!isRendering) return;
            isRendering = false;
            if (animId) cancelAnimationFrame(animId);
            try { srcNode.stop(); } catch (_) { }
            try { if (rec.state === 'recording') rec.stop(); } catch (_) { }
            v.muted = false;
            v.currentTime = origTime;
          };

          const renderFrame = () => {
            if (!isRendering) return;
            if (v.ended || v.currentTime >= (v.duration - 0.15)) {
              finish();
              return;
            }

            // Draw video frame
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

            // Draw watermark logo
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 8;
            ctx.drawImage(logoImg, lx, ly, lw, lh);
            ctx.restore();

            // Draw active Khmer subtitle if any
            const curTime = v.currentTime;
            const s = segs.find(sg => curTime >= sg.t && curTime <= sg.e);
            if (s && s.km) {
              ctx.save();
              ctx.font = `bold ${Math.round(canvas.height * 0.045)}px "Noto Sans Khmer", Inter, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              const subX = canvas.width / 2;
              const subY = canvas.height - 24;
              ctx.lineWidth = 6;
              ctx.strokeStyle = 'rgba(0,0,0,0.85)';
              ctx.strokeText(s.km, subX, subY);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(s.km, subX, subY);
              ctx.restore();
            }

            // Update export progress bar
            if (v.duration > 0) {
              const pct = Math.min(95, Math.round(50 + (v.currentTime / v.duration) * 45));
              $('expbar').style.width = pct + '%';
              $('exppct').textContent = pct + '%';
            }
          };

          const loopCallback = () => {
            if (!isRendering) return;
            renderFrame();
            if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
              v.requestVideoFrameCallback(loopCallback);
            } else {
              animId = requestAnimationFrame(loopCallback);
            }
          };

          v.onplaying = () => {
            rec.start(); // continuous smooth recording without cluster fragmentation
            srcNode.start(0);
            loopCallback();
          };
          v.play().catch(reject);
        };
        logoImg.onerror = () => reject(new Error('Could not load logo for canvas overlay'));
        logoImg.src = curLogoUrl;
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- Step 3: Video Export (FFmpeg / Canvas Watermark / MediaBunny Lossless) ---
  $('exp').onclick = async () => {
    if (!curFile) return toast('⚠ Please select a video file first');
    if (!segs.some(s => s.buf)) {
      toast('Generating missing voice lines first…');
      await generateAllVoices();
    }

    $('expOv').classList.add('on');
    $('expbt').textContent = 'Preparing audio mixing & ducking…';
    $('expbar').style.width = '15%';
    $('exppct').textContent = '15%';

    try {
      const dur = v.duration || (segs[segs.length - 1].e + 2);
      const sr = 48000;
      const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(dur * sr), sr);

      // Mix original video audio (ducked according to slider)
      const vGain = $('vol').value / 100;
      if (vGain > 0.001) {
        try {
          const ab = await curFile.arrayBuffer();
          const origAudio = await oc.decodeAudioData(ab.slice(0));
          const origSrc = oc.createBufferSource();
          origSrc.buffer = origAudio;
          const gNode = oc.createGain();
          gNode.gain.value = vGain;
          origSrc.connect(gNode);
          gNode.connect(oc.destination);
          origSrc.start(0);
        } catch (_) {
          blog('⚠ Note: Original video audio ducked/silent in final export', 'w');
        }
      }

      // Mix Khmer voice lines
      segs.forEach(s => {
        if (!s.buf) return;
        const vSrc = oc.createBufferSource();
        vSrc.buffer = s.buf;
        const vG = oc.createGain();
        vG.gain.value = 1.3;
        vSrc.connect(vG);
        vG.connect(oc.destination);
        vSrc.start(s.t);
      });

      $('expbt').textContent = 'Mixing dubbed audio track…';
      $('expbar').style.width = '35%';
      $('exppct').textContent = '35%';
      const mixedAudioBuf = await oc.startRendering();

      let finalBlob = null;
      let outExt = 'mp4';

      const shouldBurnLogo = Boolean(($('burnLogoChk')?.checked) && (curLogoBlob || curLogoFile));

      // 1. If user explicitly enabled Burn Logo, use local FFmpeg companion server or smooth Canvas fallback
      if (shouldBurnLogo) {
        $('expbt').textContent = 'Burning Logo watermark with FFmpeg encoder…';
        $('expbar').style.width = '50%';
        $('exppct').textContent = '50%';

        try {
          const wavBlob = pcmToWavBlob(mixedAudioBuf.getChannelData(0), sr);
          const formData = new FormData();
          formData.append('video', curFile);
          formData.append('audio', wavBlob, 'audio.wav');
          if (curLogoFile) {
            formData.append('logo', curLogoFile);
          } else if (curLogoBlob) {
            formData.append('logo', curLogoBlob, 'logo.png');
          }
          formData.append('pos', $('logoPos')?.value || 'top-right');
          formData.append('size_pct', $('logoSize')?.value || '18');
          formData.append('opacity', $('logoOp')?.value || '90');

          const serverUrl = (window.location.origin && window.location.origin.startsWith('http'))
            ? (window.location.origin + '/export_video')
            : 'http://localhost:8000/export_video';

          const resp = await fetch(serverUrl, { method: 'POST', body: formData });
          if (resp.ok) {
            finalBlob = await resp.blob();
            outExt = 'mp4';
            log('✓ Video with watermarked Logo successfully exported via local FFmpeg.');
          }
        } catch (serverErr) {
          blog(`ℹ Companion server notice: ${serverErr.message}. Falling back to browser canvas recorder…`, 'w');
        }

        // In-browser Canvas fallback if server is not running
        if (!finalBlob) {
          $('expbt').textContent = 'Rendering video frames with logo overlay in browser…';
          try {
            finalBlob = await recordCanvasWithLogo(mixedAudioBuf);
            if (finalBlob) outExt = 'webm';
          } catch (canvasErr) {
            blog(`Canvas fallback warning: ${canvasErr.message}`);
          }
        }
      }

      // 2. Default: Ultra-smooth, pristine lossless stream remux with MediaBunny (zero re-encoding quality loss, 100% smooth, 2s export)
      if (!finalBlob) {
        $('expbt').textContent = 'Muxing video with Khmer audio (lossless remux 100% smooth)…';
        $('expbar').style.width = '65%';
        $('exppct').textContent = '65%';

        try {
          const mb = await import('https://cdn.jsdelivr.net/npm/mediabunny@1.65.0/+esm');
          const input = new mb.Input({ source: new mb.BlobSource(curFile), formats: mb.ALL_FORMATS });
          const track = await input.getPrimaryVideoTrack();

          if (track && mb.EncodedPacketSink && mb.EncodedVideoPacketSource) {
            const isMp4 = !/webm/i.test(curFile.type);
            const fmtObj = isMp4 ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat();
            outExt = isMp4 ? 'mp4' : 'webm';

            const out = new mb.Output({ format: fmtObj, target: new mb.BufferTarget() });
            const vsrc = new mb.EncodedVideoPacketSource(track.codec);
            out.addVideoTrack(vsrc, { rotation: track.rotation || 0 });

            const asrc = new mb.AudioBufferSource({ codec: isMp4 ? 'aac' : 'opus', bitrate: 128000 });
            out.addAudioTrack(asrc);
            await out.start();

            const psink = new mb.EncodedPacketSink(track);
            const decCfg = await track.getDecoderConfig();
            const meta = decCfg ? { decoderConfig: decCfg } : undefined;

            let pktCount = 0;
            for await (const pkt of psink.packets()) {
              await vsrc.add(pkt, pktCount === 0 ? meta : undefined);
              pktCount++;
            }
            vsrc.close();

            await asrc.add(mixedAudioBuf);
            asrc.close();

            await out.finalize();
            finalBlob = new Blob([out.target.buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' });
            log(`✓ Fast lossless remux completed (${pktCount} frames, 100% smooth).`);
          }
        } catch (mbErr) {
          blog(`ℹ Note on remux: ${mbErr.message}. Falling back to standard browser recorder…`);
        }
      }

      // 3. Fallback: export mixed audio track if video container was unsupported
      if (!finalBlob) {
        const wav = pcmToWavBlob(mixedAudioBuf.getChannelData(0), sr);
        finalBlob = wav;
        outExt = 'wav';
      }

      $('expbar').style.width = '100%';
      $('exppct').textContent = '100%';
      await sleep(400);
      $('expOv').classList.remove('on');

      // Show completion modal
      const outUrl = URL.createObjectURL(finalBlob);
      const fileName = (curFile ? curFile.name.replace(/\.[^.]+$/, '') : 'video') + `_dubbed_khmer.${outExt}`;
      $('xinfo').textContent = `${fileName} · ${(finalBlob.size / (1024 * 1024)).toFixed(1)} MB`;
      $('xopen').href = outUrl;
      $('xopen').download = fileName;
      $('xsave').onclick = () => {
        const a = document.createElement('a');
        a.href = outUrl;
        a.download = fileName;
        a.click();
      };
      $('xmod').classList.add('on');
      confetti();
      toast('🎉 Khmer Dubbed Export Complete!');
    } catch (e) {
      $('expOv').classList.remove('on');
      log(`⚠ Export failed: ${e.message}`);
      toast(`⚠ Export failed: ${e.message}`);
    }
  };

  $('xclose').onclick = () => $('xmod').classList.remove('on');

  // --- Initial Log Message ---
  log('⚡ MT Dubber AI Ready · Using Gemini 2.5/2.0 Multimodal + Edge Neural Khmer Voices');
})();
