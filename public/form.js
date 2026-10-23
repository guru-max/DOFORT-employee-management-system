/* Employee-facing joining form: new submission, edit, find, success screen. */
(function () {
  'use strict';
  var F = window.DFW, app = document.getElementById('app');
  var state = { token: null, emp: null, photo: null, photoChanged: false, config: { open: true, notice: '', company: '' } };
  var DRAFT_KEY = 'dfw_draft', TOKEN_KEY = 'dfw_token';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ls(fn) { try { return fn(); } catch (e) { return null; } }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3200); }
  function api(method, url, body, token) {
    var h = { 'Content-Type': 'application/json' }; if (token) h['X-Edit-Token'] = token;
    return fetch(url, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || j.error || 'Request failed'); e.status = r.status; e.data = j; throw e; } return j; });
    });
  }
  function today() { return new Date(Date.now() + 19800000).toISOString().slice(0, 10); }

  /* ---------- field markup ---------- */
  function fieldHtml(f) {
    var id = 'f_' + f.key, label = esc(f.label) + (f.required ? ' <span class="req" aria-hidden="true">*</span>' : '');
    var input, wide = (f.key === 'company_name' || f.key === 'village' || f.key === 'name') ? ' wide' : '';
    var common = 'id="' + id + '" name="' + f.key + '"' + (f.required ? ' required' : '');
    if (f.type === 'select') {
      input = '<select ' + common + '><option value="">Select</option>' + f.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
    } else if (f.type === 'date') {
      var max = (f.key === 'dob' || f.key === 'interview_date') ? ' max="' + today() + '"' : '';
      input = '<div class="date-input-wrap">' +
        '<input type="text" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10" autocomplete="off" ' + common + '>' +
        '<button type="button" class="date-picker-btn" tabindex="-1" title="Choose date" aria-label="Choose date">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' +
        '</button>' +
        '<input type="date" tabindex="-1" class="date-picker-native" aria-hidden="true"' + max + '>' +
      '</div>';
    } else if (f.type === 'mobile') {
      input = '<div class="input-pre"><span>+91</span><input type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" ' + common + '></div>';
    } else if (f.type === 'aadhaar') {
      input = '<input type="text" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="XXXX XXXX XXXX" ' + common + '>';
    } else if (f.type === 'account') {
      input = '<input type="text" inputmode="numeric" maxlength="18" autocomplete="off" ' + common + '>';
    } else if (f.type === 'ifsc') {
      input = '<input type="text" maxlength="11" autocomplete="off" autocapitalize="characters" placeholder="SBIN0001234" ' + common + '>';
    } else {
      input = '<input type="text" maxlength="' + (f.max || 100) + '" autocomplete="off" ' + (/name/.test(f.key) ? 'autocapitalize="words" ' : '') + common + '>';
    }
    return '<div class="field' + wide + '" data-key="' + f.key + '"><label for="' + id + '">' + label + '</label>' + input + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '<div class="err" role="alert" hidden></div></div>';
  }
  function confirmAccountHtml() {
    return '<div class="field" data-key="account_confirm"><label for="f_account_confirm">Re-enter Bank Account No <span class="req" aria-hidden="true">*</span></label><input type="text" inputmode="numeric" maxlength="18" autocomplete="off" id="f_account_confirm"><div class="hint">Type it again to avoid mistakes</div><div class="err" role="alert" hidden></div></div>';
  }

  function formHtml(editing) {
    var sections = [], map = {};
    F.FIELDS.forEach(function (f) { if (!map[f.section]) { map[f.section] = []; sections.push(f.section); } map[f.section].push(f); });
    var html = '';
    if (editing) {
      html += '<div class="alert ' + (state.emp.status === 'Needs Correction' ? 'warn' : 'info') + '"><div><strong>Editing form ' + esc(state.emp.code) + '</strong> &nbsp;<span class="chip ' + state.emp.status.replace(/\s+/g, '-') + '">' + esc(state.emp.status) + '</span></div>' +
        (state.emp.admin_note ? '<div style="margin-top:6px"><strong>Message from the company:</strong> ' + esc(state.emp.admin_note) + '</div>' : '') +
        '<div style="margin-top:6px">After you save, the company will review your form again.</div></div>';
    } else {
      html += '<div class="card"><h1 style="font-size:22px;color:var(--navy)">Employee Joining Form</h1><p class="sub" style="margin:6px 0 0">Please fill in all details carefully, as on your original documents. Write in English. Fields marked <span style="color:var(--bad)">*</span> are required. Your progress is saved on this phone while you fill the form.</p></div>';
      if (state.config.notice) html += '<div class="alert info">' + esc(state.config.notice) + '</div>';
    }
    html += '<form id="form" novalidate autocomplete="off">';
    html += '<div class="card" data-key="photo"><div class="sec-title"><span class="n">1</span><h2>Your photo <span class="req" style="color:var(--bad)">*</span></h2></div><div class="photo-row"><div class="photo-box" id="photoBox">No photo<br>added</div><div class="photo-tips"><ul><li>Recent passport size photo, face clearly visible</li><li>Plain background, no cap or sunglasses</li><li>Keep your phone upright</li></ul><div class="actions"><button type="button" class="btn" id="btnCam">Take photo</button><button type="button" class="btn secondary" id="btnPick">Choose from gallery</button></div><input type="file" id="fileCam" accept="image/*" capture="user" hidden><input type="file" id="filePick" accept="image/*" hidden><div class="err" id="photoErr" role="alert" style="color:var(--bad);font-size:12.5px;font-weight:500;margin-top:6px" hidden></div></div></div></div>';
    sections.forEach(function (s, i) {
      html += '<div class="card"><div class="sec-title"><span class="n">' + (i + 2) + '</span><h2>' + esc(s) + '</h2></div><div class="grid">';
      map[s].forEach(function (f) { html += fieldHtml(f); if (f.key === 'account_no') html += confirmAccountHtml(); });
      html += '</div></div>';
    });
    if (!editing) html += '<div class="card" data-key="consent"><label class="check"><input type="checkbox" id="f_consent"><span>I declare that the details and documents given here are true and correct. I allow DOFORT WORLD MK PVT LTD to keep and use my personal data, including Aadhaar and bank details, only for employment, salary, PF and ESIC purposes.</span></label><div class="err" role="alert" style="color:var(--bad);font-size:12.5px;font-weight:500;margin-top:6px" hidden></div></div>';
    html += '<div id="formErr"></div><div class="sticky-submit"><button type="submit" class="btn block" id="btnSubmit" style="height:50px;font-size:16px">' + (editing ? 'Save changes' : 'Submit form') + '</button></div></form>';
    if (!editing) html += '<p style="text-align:center;margin-top:14px"><button class="btn ghost" id="btnFind">Already submitted? Find and edit my form</button></p>';
    return html;
  }

  /* ---------- helpers on the form ---------- */
  function fieldEl(key) { return $('[data-key="' + key + '"]'); }
  function setError(key, msg) {
    var el = fieldEl(key); if (!el) return;
    var err = $('.err', el); if (!err) return;
    if (msg) { err.textContent = msg; err.hidden = false; el.classList.add('invalid'); } else { err.hidden = true; el.classList.remove('invalid'); }
    if (key === 'photo') { $('#photoBox').classList.toggle('invalid', !!msg); }
  }
  function getValues() {
    var d = {}; F.FIELDS.forEach(function (f) { var el = $('#f_' + f.key); d[f.key] = el ? el.value : ''; }); return d;
  }
  function setValues(d) {
    F.FIELDS.forEach(function (f) {
      var el = $('#f_' + f.key);
      if (el && d[f.key] != null) {
        if (f.type === 'aadhaar') el.value = F.fmtAadhaar(d[f.key]);
        else if (f.type === 'date') {
          el.value = F.dmy(d[f.key]);
          var wrap = el.closest ? el.closest('.date-input-wrap') : el.parentNode;
          var np = wrap ? $('.date-picker-native', wrap) : null;
          if (np) np.value = F.toIsoDate(d[f.key]) || '';
        } else {
          el.value = d[f.key];
        }
      }
    });
    var ac = $('#f_account_confirm'); if (ac && d.account_no) ac.value = d.account_no;
  }
  function validateAll() {
    var vals = getValues(), errs = F.validate(vals);
    var ac = $('#f_account_confirm');
    if (!errs.account_no && ac && F.digits(ac.value) !== F.digits(vals.account_no)) errs.account_confirm = 'Account numbers do not match';
    if (!state.photo && !(state.emp && state.emp.has_photo)) errs.photo = 'Please add your photo';
    if (!state.emp && !$('#f_consent').checked) errs.consent = 'Please tick the declaration to continue';
    return errs;
  }
  function showErrors(errs) {
    ['photo', 'consent', 'account_confirm'].concat(F.FIELDS.map(function (f) { return f.key; })).forEach(function (k) { setError(k, errs[k]); });
    var photoErr = $('#photoErr'); if (photoErr) { photoErr.hidden = !errs.photo; photoErr.textContent = errs.photo || ''; }
    var first = Object.keys(errs)[0];
    if (first) { var el = fieldEl(first); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); var inp = $('input,select', el); if (inp && first !== 'photo') setTimeout(function () { inp.focus({ preventScroll: true }); }, 350); } }
  }

  /* ---------- photo ---------- */
  function showPhoto(src) {
    var box = $('#photoBox'); box.classList.add('has'); box.innerHTML = '<img alt="Your photo" src="' + src + '">';
  }
  function loadImage(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return fallbackImg(file); });
    return fallbackImg(file);
  }
  function fallbackImg(file) {
    return new Promise(function (res, rej) { var u = URL.createObjectURL(file), i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = u; });
  }
  function processPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) { setError('photo', 'Please choose an image file'); return; }
    loadImage(file).then(function (img) {
      var w = img.width, h = img.height; if (w < 200 || h < 200) { showErrors({ photo: 'This photo is too small. Please use a clearer photo.' }); return; }
      var tw = 450, th = 600, ratio = tw / th, sw = w, sh = h, sx = 0, sy = 0;
      if (w / h > ratio) { sw = h * ratio; sx = (w - sw) / 2; } else { sh = w / ratio; sy = (h - sh) * 0.25; }
      var c = document.createElement('canvas'); c.width = tw; c.height = th;
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, tw, th); g.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
      state.photo = c.toDataURL('image/jpeg', 0.88); state.photoChanged = true;
      showPhoto(state.photo); setError('photo', ''); var pe = $('#photoErr'); if (pe) pe.hidden = true; saveDraft();
    }).catch(function () { showErrors({ photo: 'This photo could not be opened. Please choose another one (JPG or PNG).' }); });
  }

  /* ---------- draft (new form only) ---------- */
  var draftTimer = null;
  function saveDraft() {
    if (state.emp) return; clearTimeout(draftTimer);
    draftTimer = setTimeout(function () { ls(function () { localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: getValues(), photo: state.photo })); }); }, 400);
  }
  function loadDraft() {
    var raw = ls(function () { return localStorage.getItem(DRAFT_KEY); }); if (!raw) return;
    try { var d = JSON.parse(raw); setValues(d.v || {}); if (d.photo) { state.photo = d.photo; state.photoChanged = true; showPhoto(d.photo); } } catch (e) { /* ignore */ }
  }

  /* ---------- date inputs (DD/MM/YYYY) ---------- */
  function setupDateInput(textInput, pickerBtn, nativePicker) {
    if (!textInput) return;
    textInput.addEventListener('input', function () {
      var v = textInput.value;
      var digits = v.replace(/\D/g, '').slice(0, 8);
      var formatted = '';
      if (digits.length <= 2) formatted = digits;
      else if (digits.length <= 4) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
      else formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
      if (v.length === 3 && v[2] === '/' && digits.length === 2) formatted = digits + '/';
      if (v.length === 6 && v[5] === '/' && digits.length === 4) formatted = digits.slice(0, 2) + '/' + digits.slice(2) + '/';
      textInput.value = formatted;
      if (nativePicker) {
        var iso = F.toIsoDate(formatted);
        if (iso) nativePicker.value = iso;
      }
    });
    textInput.addEventListener('blur', function () {
      if (textInput.value) {
        var f = F.dmy(textInput.value);
        if (f && F.toIsoDate(f)) {
          textInput.value = f;
          if (nativePicker) nativePicker.value = F.toIsoDate(f);
        }
      }
    });
    if (pickerBtn && nativePicker) {
      pickerBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var curIso = F.toIsoDate(textInput.value);
        if (curIso) nativePicker.value = curIso;
        if (typeof nativePicker.showPicker === 'function') {
          try { nativePicker.showPicker(); } catch (err) { nativePicker.focus(); nativePicker.click(); }
        } else {
          nativePicker.focus();
          nativePicker.click();
        }
      });
      nativePicker.addEventListener('change', function () {
        if (nativePicker.value) {
          textInput.value = F.dmy(nativePicker.value);
          textInput.dispatchEvent(new Event('input', { bubbles: true }));
          textInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  }

  /* ---------- views ---------- */
  function renderForm(editing) {
    app.innerHTML = formHtml(editing);
    var form = $('#form');
    $('#btnCam').onclick = function () { $('#fileCam').click(); };
    $('#btnPick').onclick = function () { $('#filePick').click(); };
    $('#fileCam').onchange = function (e) { processPhoto(e.target.files[0]); e.target.value = ''; };
    $('#filePick').onchange = function (e) { processPhoto(e.target.files[0]); e.target.value = ''; };
    var aad = $('#f_aadhaar');
    aad.addEventListener('input', function () { var d = F.digits(aad.value.replace(/\D/g, '')).slice(0, 12); aad.value = F.fmtAadhaar(d); });
    ['f_contact1', 'f_contact2', 'f_account_no', 'f_account_confirm'].forEach(function (id) { var el = $('#' + id); if (el) el.addEventListener('input', function () { el.value = el.value.replace(/\D/g, ''); }); });
    var ifsc = $('#f_ifsc'); ifsc.addEventListener('input', function () { ifsc.value = ifsc.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    F.FIELDS.filter(function (f) { return f.type === 'date'; }).forEach(function (f) {
      var inp = $('#f_' + f.key);
      if (inp) {
        var wrap = inp.closest ? inp.closest('.date-input-wrap') : inp.parentNode;
        setupDateInput(inp, wrap ? $('.date-picker-btn', wrap) : null, wrap ? $('.date-picker-native', wrap) : null);
      }
    });
    // Validate a field when the user leaves it. If a finger or mouse is still down, wait until it is lifted so the
    // error text cannot shift the page under the tap and make the user miss a button or checkbox.
    var pointerDown = false, pending = {};
    function checkField(key) {
      var t = $('#f_' + key); if (!t) return;
      var def = F.FIELDS.filter(function (f) { return f.key === key; })[0], errs = F.validate(getValues());
      if (key === 'account_confirm') setError(key, F.digits(t.value) !== F.digits($('#f_account_no').value) ? 'Account numbers do not match' : '');
      else if (def && !def.required && !t.value) setError(key, '');
      else setError(key, errs[key]);
    }
    function flush() { var k = Object.keys(pending); pending = {}; k.forEach(checkField); }
    document.addEventListener('pointerdown', function () { pointerDown = true; }, true);
    ['pointerup', 'pointercancel'].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(function () { pointerDown = false; flush(); }, 0); }, true); });
    form.addEventListener('focusout', function (e) {
      var t = e.target; if (!t.id || t.id.indexOf('f_') !== 0) return;
      var key = t.id.slice(2); if (key === 'consent') return;
      if (pointerDown) pending[key] = 1; else checkField(key);
    });
    form.addEventListener('input', function () { saveDraft(); });
    form.addEventListener('change', function () { saveDraft(); });
    form.addEventListener('submit', onSubmit);
    var f = $('#btnFind'); if (f) f.onclick = openFind;
    if (editing) {
      setValues(state.emp);
      if (state.emp.has_photo) showPhoto('/api/photo/' + state.emp.id + '?token=' + encodeURIComponent(state.token) + '&v=' + encodeURIComponent(state.emp.photo_v));
    } else {
      var c = $('#f_company_name'); if (c && state.config.company) c.value = state.config.company;
      loadDraft();
    }
    window.scrollTo(0, 0);
  }

  function onSubmit(e) {
    e.preventDefault();
    var errs = validateAll(); showErrors(errs);
    if (Object.keys(errs).length) { $('#formErr').innerHTML = '<div class="alert bad">Please correct the highlighted fields.</div>'; return; }
    $('#formErr').innerHTML = '';
    var btn = $('#btnSubmit'); btn.disabled = true; btn.textContent = 'Saving...';
    var body = getValues(); if (state.photoChanged) body.photo = state.photo;
    var editing = !!state.emp, p;
    if (editing) p = api('PUT', '/api/employee/me', body, state.token);
    else { body.consent = true; p = api('POST', '/api/employee', body); }
    p.then(function (r) {
      if (!editing) { state.token = r.token; ls(function () { localStorage.setItem(TOKEN_KEY, r.token); localStorage.removeItem(DRAFT_KEY); }); }
      renderDone(editing ? state.emp.code : r.code, editing);
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = editing ? 'Save changes' : 'Submit form';
      if (err.data && err.data.errors) { showErrors(err.data.errors); $('#formErr').innerHTML = '<div class="alert bad">Please correct the highlighted fields.</div>'; }
      else $('#formErr').innerHTML = '<div class="alert bad">' + esc(err.message) + '</div>';
    });
  }

  function renderDone(code, edited) {
    var link = location.origin + '/?edit=' + encodeURIComponent(state.token);
    app.innerHTML = '<div class="card done"><div class="tick"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
      '<h1 style="font-size:22px;color:var(--navy)">' + (edited ? 'Your changes are saved' : 'Form submitted successfully') + '</h1>' +
      '<p class="muted" style="margin:8px 0 0">Your reference number</p><div class="refcode">' + esc(code) + '</div>' +
      '<p class="muted" style="margin:0 0 16px">The company will review your details. Keep this number for any enquiry.</p>' +
      '<div class="actions" style="justify-content:center;margin-bottom:18px"><a class="btn" href="/api/employee/me/export?format=pdf&token=' + encodeURIComponent(state.token) + '">Download my copy (PDF)</a><button class="btn secondary" id="btnEdit">Edit my details</button></div>' +
      '<div class="alert info" style="text-align:left;margin:0"><strong>To edit later,</strong> open this private link on any phone. Do not share it with anyone.<div class="linkbox"><input type="text" readonly id="editLink" value="' + esc(link) + '"><button class="btn secondary" id="btnCopy">Copy</button></div>You can also use "Find my form" on the first page with your mobile number and date of birth.</div></div>' +
      '<p style="text-align:center"><button class="btn ghost" id="btnNew">Submit a form for another person</button></p>';
    $('#btnEdit').onclick = function () { loadEdit(); };
    $('#btnCopy').onclick = function () {
      var i = $('#editLink'); i.select();
      (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { toast('Link copied'); }, function () { try { document.execCommand('copy'); toast('Link copied'); } catch (e) { toast('Press and hold to copy the link'); } });
    };
    $('#btnNew').onclick = function () { ls(function () { localStorage.removeItem(TOKEN_KEY); }); state.token = null; state.emp = null; state.photo = null; state.photoChanged = false; history.replaceState(null, '', '/'); renderForm(false); };
    window.scrollTo(0, 0);
  }

  function renderClosed() {
    app.innerHTML = '<div class="card done"><h1 style="font-size:20px;color:var(--navy)">This form is not accepting new entries</h1><p class="muted">Please contact DOFORT WORLD MK PVT LTD at 044 - 2959 2916.</p><p><button class="btn secondary" id="btnFind">Already submitted? Find and edit my form</button></p></div>';
    $('#btnFind').onclick = openFind;
  }

  function renderWelcomeBack(emp) {
    app.innerHTML = '<div class="card"><h1 style="font-size:20px;color:var(--navy)">Welcome back, ' + esc(emp.name.split(' ')[0]) + '</h1><p class="sub" style="margin-top:6px">You have already submitted your joining form.</p>' +
      '<div class="kv" style="margin-bottom:16px"><div><dt>Reference</dt><dd>' + esc(emp.code) + '</dd></div><div><dt>Status</dt><dd><span class="chip ' + emp.status.replace(/\s+/g, '-') + '">' + esc(emp.status) + '</span></dd></div></div>' +
      (emp.admin_note ? '<div class="alert warn"><strong>Message from the company:</strong> ' + esc(emp.admin_note) + '</div>' : '') +
      '<div class="actions"><button class="btn" id="btnEdit">Edit my details</button><a class="btn secondary" href="/api/employee/me/export?format=pdf&token=' + encodeURIComponent(state.token) + '">Download my copy (PDF)</a></div></div>' +
      '<p style="text-align:center"><button class="btn ghost" id="btnNew">Submit a form for another person</button></p>';
    $('#btnEdit').onclick = function () { renderForm(true); };
    $('#btnNew').onclick = function () { ls(function () { localStorage.removeItem(TOKEN_KEY); }); state.token = null; state.emp = null; history.replaceState(null, '', '/'); renderForm(false); };
  }

  function loadEdit(direct) {
    app.innerHTML = '<div class="spinner"></div>';
    return api('GET', '/api/employee/me', null, state.token).then(function (r) {
      state.emp = r.employee; state.photo = null; state.photoChanged = false;
      if (direct) renderWelcomeBack(state.emp); else renderForm(true);
    }).catch(function () {
      ls(function () { localStorage.removeItem(TOKEN_KEY); }); state.token = null; state.emp = null;
      history.replaceState(null, '', '/'); start(true);
    });
  }

  function openFind() {
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h2>Find my form</h2><p class="muted" style="margin-top:0">Enter the mobile number and date of birth you used in the form.</p><div class="grid" style="grid-template-columns:1fr"><div class="field"><label for="fd_c">Mobile number</label><div class="input-pre"><span>+91</span><input type="tel" inputmode="numeric" maxlength="10" id="fd_c"></div></div><div class="field"><label for="fd_d">Date of birth</label><div class="date-input-wrap"><input type="text" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10" autocomplete="off" id="fd_d"><button type="button" class="date-picker-btn" tabindex="-1" title="Choose date" aria-label="Choose date"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></button><input type="date" tabindex="-1" class="date-picker-native" aria-hidden="true" max="' + today() + '"></div><div class="hint">DD/MM/YYYY</div></div></div><div id="fd_err" class="alert bad" style="margin-top:12px" hidden></div><div class="actions" style="margin-top:16px;justify-content:flex-end"><button class="btn secondary" id="fd_x">Cancel</button><button class="btn" id="fd_go">Find my form</button></div></div>';
    document.body.appendChild(bg);
    $('#fd_c', bg).oninput = function (e) { e.target.value = e.target.value.replace(/\D/g, ''); };
    setupDateInput($('#fd_d', bg), $('.date-picker-btn', bg), $('.date-picker-native', bg));
    $('#fd_x', bg).onclick = function () { bg.remove(); };
    $('#fd_go', bg).onclick = function () {
      var b = $('#fd_go', bg); b.disabled = true;
      api('POST', '/api/employee/find', { contact: $('#fd_c', bg).value, dob: $('#fd_d', bg).value }).then(function (r) {
        state.token = r.token; ls(function () { localStorage.setItem(TOKEN_KEY, r.token); }); bg.remove(); loadEdit();
      }).catch(function (err) { b.disabled = false; var e = $('#fd_err', bg); e.textContent = err.message; e.hidden = false; });
    };
    $('#fd_c', bg).focus();
  }

  function start(skipToken) {
    var qs = new URLSearchParams(location.search), t = qs.get('edit') || (!skipToken && ls(function () { return localStorage.getItem(TOKEN_KEY); }));
    api('GET', '/api/config').then(function (cfg) {
      state.config = cfg;
      if (t) { state.token = t; ls(function () { localStorage.setItem(TOKEN_KEY, t); }); if (qs.get('edit')) history.replaceState(null, '', '/'); loadEdit(true); }
      else if (!cfg.open) renderClosed();
      else renderForm(false);
    }).catch(function () { app.innerHTML = '<div class="alert bad">Could not connect. Please check your internet connection and refresh the page.</div>'; });
  }
  start();
})();
