/* Admin panel: dashboard, employee list, detail and edit, share link and QR, activity, settings. */
(function () {
  'use strict';
  var F = window.DFW, root = document.getElementById('root');
  var S = { view: 'employees', q: '', status: '', from: '', to: '', sort: 'created_at', dir: 'desc', page: 1, size: 25, rows: [], total: 0, sel: {}, stats: null, defaultPw: false };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3000); }
  function chip(s) { return '<span class="chip ' + s.replace(/\s+/g, '-') + '">' + esc(s) + '</span>'; }
  function ist(iso) {
    if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return iso; var p = new Date(d.getTime() + 19800000).toISOString();
    return p.slice(8, 10) + '/' + p.slice(5, 7) + '/' + p.slice(0, 4) + ' ' + p.slice(11, 16);
  }
  function setupDateInput(textInput, pickerBtn, nativePicker, onChange) {
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
      if (onChange) onChange(formatted);
    });
    textInput.addEventListener('blur', function () {
      if (textInput.value) {
        var f = F.dmy(textInput.value);
        if (f && F.toIsoDate(f)) {
          textInput.value = f;
          if (nativePicker) nativePicker.value = F.toIsoDate(f);
          if (onChange) onChange(f);
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
          if (onChange) onChange(textInput.value);
        }
      });
    }
  }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url.indexOf('/login') < 0) { showLogin(); throw new Error('Signed out'); }
        if (!r.ok) { var e = new Error(j.message || j.error || 'Request failed'); e.data = j; e.status = r.status; throw e; } return j;
      });
    });
  }
  function qs(o) { return Object.keys(o).filter(function (k) { return o[k] !== '' && o[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function filterParams() { return { q: S.q, status: S.status, from: S.from, to: S.to }; }

  /* ================= login ================= */
  function showLogin() {
    root.innerHTML = '<div class="login-wrap"><div class="card login-card"><div class="brand" style="margin-bottom:16px"><div class="logo" style="background:var(--navy);color:#fff">DW</div><div><strong style="color:var(--navy)">DOFORT WORLD MK PVT LTD</strong><span style="color:var(--muted)">Admin panel</span></div></div><form id="lf"><div class="field"><label for="pw">Admin password</label><input type="password" id="pw" autocomplete="current-password" autofocus></div><div id="le" class="alert bad" style="margin-top:12px" hidden></div><button class="btn block" style="margin-top:14px" id="lb">Sign in</button></form></div></div>';
    $('#lf').onsubmit = function (e) {
      e.preventDefault(); var b = $('#lb'); b.disabled = true;
      api('POST', '/api/admin/login', { password: $('#pw').value }).then(function (r) { S.defaultPw = r.defaultPassword; boot(); }).catch(function (err) { b.disabled = false; var el = $('#le'); el.textContent = err.message; el.hidden = false; });
    };
  }

  /* ================= shell ================= */
  function shell() {
    root.innerHTML = '<div class="admin-shell"><div class="admin-top"><div class="in"><div class="brand"><div class="logo">DW</div><div><strong>DOFORT WORLD</strong><span>Employee data admin</span></div></div><nav id="nav"></nav><button class="btn sm secondary" id="logout">Sign out</button></div></div><main class="admin-main" id="main"></main></div>';
    $('#logout').onclick = function () { api('POST', '/api/admin/logout').then(showLogin); };
    renderNav();
  }
  function renderNav() {
    var items = [['employees', 'Employees'], ['share', 'Share link and QR'], ['activity', 'Activity log'], ['settings', 'Settings']];
    $('#nav').innerHTML = items.map(function (i) { return '<button data-v="' + i[0] + '" class="' + (S.view === i[0] ? 'on' : '') + '">' + i[1] + '</button>'; }).join('');
    $$('#nav button').forEach(function (b) { b.onclick = function () { S.view = b.dataset.v; renderNav(); render(); }; });
  }
  function render() {
    var main = $('#main');
    var warn = S.defaultPw ? '<div class="alert warn">You are using the default password. <a href="#" id="goSet">Change it now in Settings</a> before sharing the form.</div>' : '';
    main.innerHTML = warn + '<div id="view"></div>';
    var g = $('#goSet'); if (g) g.onclick = function (e) { e.preventDefault(); S.view = 'settings'; renderNav(); render(); };
    ({ employees: viewEmployees, share: viewShare, activity: viewActivity, settings: viewSettings })[S.view]();
  }

  /* ================= employees ================= */
  function viewEmployees() {
    $('#view').innerHTML =
      '<div class="stats" id="stats"></div>' +
      '<div class="toolbar"><input type="search" class="grow" id="q" placeholder="Search name, ref no, mobile, Aadhaar" value="' + esc(S.q) + '"><select id="fstatus"><option value="">All statuses</option>' + F.STATUSES.map(function (s) { return '<option' + (S.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<label class="muted" style="font-size:13px">From <div class="date-input-wrap" style="display:inline-flex;width:145px;vertical-align:middle"><input type="text" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10" id="ffrom" value="' + esc(F.dmy(S.from)) + '"><button type="button" class="date-picker-btn" tabindex="-1" title="Choose date"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button><input type="date" tabindex="-1" class="date-picker-native" aria-hidden="true"></div></label>' +
      '<label class="muted" style="font-size:13px">To <div class="date-input-wrap" style="display:inline-flex;width:145px;vertical-align:middle"><input type="text" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10" id="fto" value="' + esc(F.dmy(S.to)) + '"><button type="button" class="date-picker-btn" tabindex="-1" title="Choose date"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button><input type="date" tabindex="-1" class="date-picker-native" aria-hidden="true"></div></label>' +
      '<div class="menu"><button class="btn secondary" id="btnExport">Download data</button></div><button class="btn" id="btnAdd">Add employee</button></div>' +
      '<div id="bulk"></div><div class="table-wrap" id="tw"></div><div class="pager" id="pager"></div>';
    var t; $('#q').oninput = function (e) { clearTimeout(t); t = setTimeout(function () { S.q = e.target.value; S.page = 1; load(); }, 300); };
    $('#fstatus').onchange = function (e) { S.status = e.target.value; S.page = 1; load(); loadStats(); };
    var wFrom = $('#ffrom').closest ? $('#ffrom').closest('.date-input-wrap') : $('#ffrom').parentNode;
    setupDateInput($('#ffrom'), $('.date-picker-btn', wFrom), $('.date-picker-native', wFrom), function (val) {
      var iso = F.toIsoDate(val);
      if (val === '' || iso) { S.from = iso || ''; S.page = 1; load(); }
    });
    var wTo = $('#fto').closest ? $('#fto').closest('.date-input-wrap') : $('#fto').parentNode;
    setupDateInput($('#fto'), $('.date-picker-btn', wTo), $('.date-picker-native', wTo), function (val) {
      var iso = F.toIsoDate(val);
      if (val === '' || iso) { S.to = iso || ''; S.page = 1; load(); }
    });
    $('#btnAdd').onclick = function () { openDrawer(null, true); };
    $('#btnExport').onclick = function (e) { e.stopPropagation(); exportMenu(e.target.parentNode, false); };
    loadStats(); load();
  }
  function loadStats() {
    api('GET', '/api/admin/stats').then(function (s) {
      S.stats = s; var b = s.byStatus || {};
      var pending = (b['Submitted'] || 0) + (b['Resubmitted'] || 0) + (b['Under Review'] || 0);
      var cards = [['', 'All employees', s.total], ['', 'Submitted today', s.today], ['__pending', 'Waiting for review', pending], ['Approved', 'Approved', b['Approved'] || 0], ['Needs Correction', 'Needs correction', b['Needs Correction'] || 0], ['Rejected', 'Rejected', b['Rejected'] || 0]];
      var days = []; for (var i = 13; i >= 0; i--) { var d = new Date(Date.parse(s.date + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10); var f = s.days.filter(function (x) { return x.d === d; })[0]; days.push({ d: d, n: f ? f.n : 0 }); }
      var mx = Math.max(1, Math.max.apply(null, days.map(function (x) { return x.n; })));
      var el = $('#stats'); if (!el) return;
      el.innerHTML = cards.map(function (c, i) { return '<button class="stat' + (c[0] && c[0] === S.status ? ' on' : '') + '" data-s="' + c[0] + '" data-i="' + i + '"><div class="v">' + c[2] + '</div><div class="l">' + c[1] + '</div></button>'; }).join('') +
        '<div class="stat" style="cursor:default;grid-column:span 2"><div class="l" style="margin:0 0 6px">Submissions, last 14 days</div><div class="bars">' + days.map(function (x) { return '<i class="' + (x.n ? '' : 'zero') + '" style="height:' + Math.round(x.n / mx * 100) + '%" title="' + F.dmy(x.d) + ': ' + x.n + '"></i>'; }).join('') + '</div></div>';
      $$('.stat[data-i]', el).forEach(function (b) { b.onclick = function () { var v = b.dataset.s; if (v === '__pending') return; S.status = v === S.status ? '' : v; $('#fstatus').value = S.status; S.page = 1; load(); loadStats(); }; });
    }).catch(function () {});
  }
  function load() {
    var tw = $('#tw'); if (!tw) return;
    api('GET', '/api/admin/employees?' + qs(Object.assign(filterParams(), { sort: S.sort, dir: S.dir, page: S.page, size: S.size }))).then(function (r) {
      S.rows = r.rows; S.total = r.total; drawTable();
    });
  }
  function th(label, key) { return '<th class="sort" data-k="' + key + '">' + label + (S.sort === key ? (S.dir === 'asc' ? ' &#9650;' : ' &#9660;') : '') + '</th>'; }
  function drawTable() {
    var tw = $('#tw'); if (!tw) return;
    var allSel = S.rows.length && S.rows.every(function (r) { return S.sel[r.id]; });
    var head = '<thead><tr><th class="chk"><input type="checkbox" id="selAll" aria-label="Select all"' + (allSel ? ' checked' : '') + '></th>' + th('Employee', 'name') + th('Designation', 'designation') + '<th>Contact</th>' + th('District', 'district') + th('DOJ', 'doj') + th('Submitted', 'created_at') + th('Status', 'status') + '</tr></thead>';
    var body = S.rows.map(function (r) {
      return '<tr data-id="' + r.id + '"><td class="chk"><input type="checkbox" class="sel" data-id="' + r.id + '"' + (S.sel[r.id] ? ' checked' : '') + ' aria-label="Select ' + esc(r.name) + '"></td>' +
        '<td><div class="cellname">' + (r.has_photo ? '<img class="avatar" loading="lazy" alt="" src="/api/photo/' + r.id + '?v=' + encodeURIComponent(r.photo_v) + '">' : '<div class="avatar"></div>') + '<div><b>' + esc(r.name) + '</b><small>' + esc(r.code) + ' &middot; ' + esc(r.father_name) + '</small></div></div></td>' +
        '<td>' + esc(r.designation) + '</td><td>' + esc(r.contact1) + '</td><td>' + esc(r.district) + '</td><td>' + F.dmy(r.doj) + '</td><td>' + ist(r.created_at) + '</td><td>' + chip(r.status) + '</td></tr>';
    }).join('');
    tw.innerHTML = S.rows.length ? '<table class="t">' + head + '<tbody>' + body + '</tbody></table>' : '<div class="empty"><strong>No employees found</strong><br>' + (S.q || S.status || S.from || S.to ? 'Try clearing the search or filters.' : 'Share the link or QR code from the "Share link and QR" tab to start collecting forms.') + '</div>';
    $$('th.sort', tw).forEach(function (h) { h.onclick = function () { var k = h.dataset.k; if (S.sort === k) S.dir = S.dir === 'asc' ? 'desc' : 'asc'; else { S.sort = k; S.dir = 'asc'; } load(); }; });
    $$('tbody tr', tw).forEach(function (tr) { tr.onclick = function (e) { if (e.target.closest('.chk')) return; openDrawer(+tr.dataset.id); }; });
    $$('.sel', tw).forEach(function (c) { c.onchange = function () { if (c.checked) S.sel[c.dataset.id] = 1; else delete S.sel[c.dataset.id]; drawBulk(); var a = $('#selAll'); if (a) a.checked = S.rows.every(function (r) { return S.sel[r.id]; }); }; });
    var sa = $('#selAll'); if (sa) sa.onchange = function () { S.rows.forEach(function (r) { if (sa.checked) S.sel[r.id] = 1; else delete S.sel[r.id]; }); drawTable(); };
    var pages = Math.max(1, Math.ceil(S.total / S.size)), from = S.total ? (S.page - 1) * S.size + 1 : 0, to = Math.min(S.total, S.page * S.size);
    $('#pager').innerHTML = '<span>Showing ' + from + '-' + to + ' of ' + S.total + '</span><span class="actions"><select id="psize" style="width:auto;height:34px">' + [25, 50, 100].map(function (n) { return '<option' + (n === S.size ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select><button class="btn sm secondary" id="pp"' + (S.page <= 1 ? ' disabled' : '') + '>Previous</button><span style="align-self:center">Page ' + S.page + ' of ' + pages + '</span><button class="btn sm secondary" id="pn"' + (S.page >= pages ? ' disabled' : '') + '>Next</button></span>';
    $('#psize').onchange = function (e) { S.size = +e.target.value; S.page = 1; load(); };
    $('#pp').onclick = function () { S.page--; load(); }; $('#pn').onclick = function () { S.page++; load(); };
    drawBulk();
  }
  function selIds() { return Object.keys(S.sel); }
  function drawBulk() {
    var b = $('#bulk'); if (!b) return; var n = selIds().length;
    if (!n) { b.innerHTML = ''; return; }
    b.innerHTML = '<div class="bulkbar"><strong>' + n + ' selected</strong><select id="bst"><option value="">Change status to...</option>' + F.STATUSES.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select><div class="menu"><button class="btn sm secondary" id="bex">Download selected</button></div><button class="btn sm danger" id="bdel">Delete</button><button class="btn sm ghost" style="color:#fff" id="bclr">Clear</button></div>';
    $('#bst').onchange = function (e) { var v = e.target.value; if (!v) return; api('POST', '/api/admin/bulk', { action: 'status', ids: selIds().map(Number), status: v }).then(function (r) { toast(r.count + ' updated'); load(); loadStats(); }); };
    $('#bex').onclick = function (e) { e.stopPropagation(); exportMenu(e.target.parentNode, true); };
    $('#bclr').onclick = function () { S.sel = {}; drawTable(); };
    $('#bdel').onclick = function () {
      confirmBox('Delete ' + n + ' employee record' + (n > 1 ? 's' : '') + '?', 'This permanently removes the records and photos. Download a backup first if you may need them.', 'Delete', function () {
        api('POST', '/api/admin/bulk', { action: 'delete', ids: selIds().map(Number) }).then(function (r) { toast(r.count + ' deleted'); S.sel = {}; load(); loadStats(); });
      });
    };
  }
  function exportMenu(host, selected) {
    var old = $('.menu-list'); if (old) { old.remove(); return; }
    var base = selected ? { ids: selIds().join(',') } : filterParams();
    var m = document.createElement('div'); m.className = 'menu-list';
    var fmts = [['xlsx', 'Excel (.xlsx)'], ['pdf', 'PDF (.pdf)'], ['docx', 'Word (.docx)'], ['csv', 'CSV (.csv)']];
    m.innerHTML = fmts.map(function (f) { return '<a href="#" data-f="' + f[0] + '">' + f[1] + '</a>'; }).join('') + '<div class="sep"></div><label class="check" style="padding:8px 12px;font-size:13px"><input type="checkbox" id="xmask" style="width:16px;height:16px">Hide Aadhaar and bank numbers</label>' + (selected ? '' : '<div style="padding:4px 12px 8px;font-size:12px;color:var(--muted)">Downloads all records matching the current search and filters.</div>');
    host.appendChild(m);
    $$('a', m).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); location.href = '/api/admin/export?' + qs(Object.assign({}, base, { format: a.dataset.f, mask: $('#xmask').checked ? '1' : '' })); m.remove(); toast('Preparing download...'); }; });
    m.onclick = function (e) { e.stopPropagation(); };
    setTimeout(function () { document.addEventListener('click', function h() { m.remove(); document.removeEventListener('click', h); }); }, 0);
  }
  function confirmBox(title, text, okLabel, fn) {
    var bg = document.createElement('div'); bg.className = 'modal-bg'; bg.style.zIndex = 80;
    bg.innerHTML = '<div class="modal" role="alertdialog" aria-modal="true"><h2>' + esc(title) + '</h2><p class="muted" style="margin-top:0">' + esc(text) + '</p><div class="actions" style="justify-content:flex-end;margin-top:16px"><button class="btn secondary" id="cb_x">Cancel</button><button class="btn danger" id="cb_ok">' + esc(okLabel) + '</button></div></div>';
    document.body.appendChild(bg);
    $('#cb_x', bg).onclick = function () { bg.remove(); }; $('#cb_ok', bg).onclick = function () { bg.remove(); fn(); };
  }

  /* ================= drawer: view / edit ================= */
  var D = { emp: null, photo: null, changed: false };
  function closeDrawer() { $$('.drawer,.drawer-bg').forEach(function (e) { e.remove(); }); }
  function openDrawer(id, isNew) {
    closeDrawer();
    var bg = document.createElement('div'); bg.className = 'drawer-bg'; bg.onclick = closeDrawer;
    var dr = document.createElement('aside'); dr.className = 'drawer'; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true');
    dr.innerHTML = '<header><h2 id="dt">Loading...</h2><button class="btn sm secondary" id="dx">Close</button></header><div class="body" id="db"><div class="spinner"></div></div>';
    document.body.appendChild(bg); document.body.appendChild(dr); $('#dx').onclick = closeDrawer;
    if (isNew) { D.emp = null; D.photo = null; D.changed = false; drawEdit(null, []); return; }
    api('GET', '/api/admin/employees/' + id).then(function (r) { D.emp = r.employee; drawView(r.employee, r.history); });
  }
  function kv(label, val) { return '<div><dt>' + esc(label) + '</dt><dd>' + (val === '' || val == null ? '<span class="muted">-</span>' : esc(val)) + '</dd></div>'; }
  function drawView(e, hist) {
    $('#dt').innerHTML = esc(e.name) + ' <span class="muted" style="font-weight:400;font-size:14px">' + esc(e.code) + '</span>';
    var v = function (k) { var f = F.FIELDS.filter(function (x) { return x.key === k; })[0]; var x = e[k]; return f.type === 'date' ? F.dmy(x) : f.type === 'aadhaar' ? F.fmtAadhaar(x) : x; };
    var body = '<div class="card"><div class="profile-top">' + (e.has_photo ? '<img class="profile-photo" alt="Photo of ' + esc(e.name) + '" src="/api/photo/' + e.id + '?v=' + encodeURIComponent(e.photo_v) + '">' : '<div class="profile-photo"></div>') +
      '<div style="flex:1;min-width:220px"><div style="margin-bottom:8px">' + chip(e.status) + '</div><dl class="kv">' + kv('Company', e.company_name) + kv('Interview date', F.dmy(e.interview_date)) + kv("Father's name", e.father_name) + kv('Date of birth', F.dmy(e.dob)) + kv('Gender', e.gender) + kv('Marital status', e.marital_status) + '</dl></div></div></div>' +
      '<div class="card"><h2>Identity and bank</h2><dl class="kv" style="margin-top:8px"><div><dt>Aadhaar card no</dt><dd><span id="aadv">' + esc(F.maskAadhaar(e.aadhaar)) + '</span> <button class="btn sm ghost" id="aadt" type="button">Show</button></dd></div>' + kv('Bank account no', '') .replace('<span class="muted">-</span>', '<span id="accv">' + esc(F.maskAccount(e.account_no)) + '</span> <button class="btn sm ghost" id="acct" type="button">Show</button>') + kv('IFSC code', e.ifsc) + kv('PF no', e.pf_no) + kv('ESIC no', e.esic_no) + '</dl></div>' +
      '<div class="card"><h2>Address and contact</h2><dl class="kv" style="margin-top:8px">' + kv('House no', e.house_no) + kv('Village / building', e.village) + kv('Post office', e.post_office) + kv('District', e.district) + kv('State', e.state) + kv('Contact number', e.contact1) + kv('Alternate number', e.contact2) + '</dl></div>' +
      '<div class="card"><h2>Employment</h2><dl class="kv" style="margin-top:8px">' + kv('Designation', e.designation) + kv('Date of joining', F.dmy(e.doj)) + kv('Submitted', ist(e.created_at)) + kv('Last updated', ist(e.updated_at) + (e.updated_by ? ' by ' + e.updated_by.replace(/^employee:.*/, 'employee') : '')) + '</dl></div>' +
      '<div class="card"><h2>Review</h2><p class="sub">Set the status. The employee sees your note when they open their edit link.</p><div class="grid"><div class="field"><label for="rs">Status</label><select id="rs">' + F.STATUSES.map(function (s) { return '<option' + (s === e.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div><div class="field wide"><label for="rn">Note to employee (optional)</label><textarea id="rn" maxlength="500" placeholder="Example: Please upload a clearer photo.">' + esc(e.admin_note) + '</textarea></div></div><div class="actions" style="margin-top:12px"><button class="btn" id="rsave">Update status</button><button class="btn ok" id="rapp">Approve</button><button class="btn secondary" id="rcor">Ask for correction</button></div></div>' +
      '<div class="card"><h2>Actions</h2><div class="actions" style="margin-top:10px"><button class="btn" id="aedit">Edit details</button><a class="btn secondary" href="/api/admin/employees/' + e.id + '/export?format=pdf">Download PDF</a><a class="btn secondary" href="/api/admin/employees/' + e.id + '/export?format=docx">Download Word</a><button class="btn danger" id="adel" style="margin-left:auto">Delete</button></div></div>' +
      '<div class="card"><h2>History</h2><ul class="hist" style="margin-top:8px">' + (hist.length ? hist.map(function (h) { return '<li><span>' + esc(h.action) + (h.detail ? ': ' + esc(h.detail) : '') + ' <span class="muted">(' + esc(h.actor) + ')</span></span><time>' + ist(h.at) + '</time></li>'; }).join('') : '<li class="muted">No history yet</li>') + '</ul></div>';
    $('#db').innerHTML = body;
    var showA = false, showB = false;
    $('#aadt').onclick = function () { showA = !showA; $('#aadv').textContent = showA ? F.fmtAadhaar(e.aadhaar) : F.maskAadhaar(e.aadhaar); this.textContent = showA ? 'Hide' : 'Show'; };
    $('#acct').onclick = function () { showB = !showB; $('#accv').textContent = showB ? e.account_no : F.maskAccount(e.account_no); this.textContent = showB ? 'Hide' : 'Show'; };
    function setStatus(st) { api('POST', '/api/admin/employees/' + e.id + '/status', { status: st, note: $('#rn').value }).then(function () { toast('Status updated to ' + st); load(); loadStats(); openDrawer(e.id); }).catch(function (er) { toast(er.message); }); }
    $('#rsave').onclick = function () { setStatus($('#rs').value); };
    $('#rapp').onclick = function () { setStatus('Approved'); };
    $('#rcor').onclick = function () { if (!$('#rn').value.trim()) { toast('Write what needs to be corrected in the note'); $('#rn').focus(); return; } setStatus('Needs Correction'); };
    $('#aedit').onclick = function () { drawEdit(e, hist); };
    $('#adel').onclick = function () { confirmBox('Delete ' + e.name + '?', 'This permanently removes the record and photo.', 'Delete', function () { api('DELETE', '/api/admin/employees/' + e.id).then(function () { toast('Deleted'); closeDrawer(); load(); loadStats(); }); }); };
  }

  function drawEdit(e, hist) {
    var isNew = !e; D.photo = null; D.changed = false;
    $('#dt').textContent = isNew ? 'Add employee' : 'Edit ' + e.name;
    var sections = [], map = {};
    F.FIELDS.forEach(function (f) { if (!map[f.section]) { map[f.section] = []; sections.push(f.section); } map[f.section].push(f); });
    var h = '<form id="ef" novalidate autocomplete="off"><div class="card"><h2>Photo</h2><div class="photo-row" style="margin-top:10px"><div class="photo-box" id="pbox">No photo</div><div><div class="actions"><button type="button" class="btn secondary" id="pbtn">' + (isNew ? 'Choose photo' : 'Change photo') + '</button></div><input type="file" id="pfile" accept="image/*" hidden><div class="err" id="perr" style="color:var(--bad);font-size:12.5px;font-weight:500;margin-top:6px" hidden></div></div></div></div>';
    sections.forEach(function (s) {
      h += '<div class="card"><h2>' + esc(s) + '</h2><div class="grid" style="margin-top:10px">';
      map[s].forEach(function (f) {
        var id = 'e_' + f.key, input, c = 'id="' + id + '"';
        if (f.type === 'select') input = '<select ' + c + '><option value="">Select</option>' + f.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
        else if (f.type === 'date') {
          var max = (f.key === 'dob' || f.key === 'interview_date') ? ' max="' + new Date().toISOString().slice(0, 10) + '"' : '';
          input = '<div class="date-input-wrap">' +
            '<input type="text" inputmode="numeric" placeholder="DD/MM/YYYY" maxlength="10" autocomplete="off" ' + c + '>' +
            '<button type="button" class="date-picker-btn" tabindex="-1" title="Choose date" aria-label="Choose date">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' +
            '</button>' +
            '<input type="date" tabindex="-1" class="date-picker-native" aria-hidden="true"' + max + '>' +
          '</div>';
        }
        else input = '<input type="text" ' + c + ' maxlength="' + (f.type === 'aadhaar' ? 14 : f.type === 'mobile' ? 10 : f.type === 'ifsc' ? 11 : f.type === 'account' ? 18 : (f.max || 100)) + '"' + (f.type === 'mobile' || f.type === 'aadhaar' || f.type === 'account' ? ' inputmode="numeric"' : '') + '>';
        h += '<div class="field' + (f.key === 'company_name' || f.key === 'village' ? ' wide' : '') + '" data-key="' + f.key + '"><label for="' + id + '">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>' + input + '<div class="err" role="alert" hidden></div></div>';
      });
      h += '</div></div>';
    });
    if (!isNew) h += '<div class="card"><h2>Review</h2><div class="grid" style="margin-top:10px"><div class="field"><label for="e_status">Status</label><select id="e_status">' + F.STATUSES.map(function (s) { return '<option' + (s === e.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div><div class="field wide"><label for="e_note">Note to employee</label><textarea id="e_note" maxlength="500"></textarea></div></div></div>';
    h += '<div id="eerr"></div><div class="actions"><button class="btn" type="submit" id="esave">' + (isNew ? 'Add employee' : 'Save changes') + '</button><button type="button" class="btn secondary" id="ecancel">Cancel</button></div></form>';
    $('#db').innerHTML = h;
    F.FIELDS.filter(function (f) { return f.type === 'date'; }).forEach(function (f) {
      var inp = $('#e_' + f.key);
      if (inp) {
        var wrap = inp.closest ? inp.closest('.date-input-wrap') : inp.parentNode;
        setupDateInput(inp, wrap ? $('.date-picker-btn', wrap) : null, wrap ? $('.date-picker-native', wrap) : null);
      }
    });
    if (!isNew) {
      F.FIELDS.forEach(function (f) {
        var el = $('#e_' + f.key);
        if (el) {
          if (f.type === 'aadhaar') el.value = F.fmtAadhaar(e[f.key]);
          else if (f.type === 'date') {
            el.value = F.dmy(e[f.key]);
            var wrap = el.closest ? el.closest('.date-input-wrap') : el.parentNode;
            var np = wrap ? $('.date-picker-native', wrap) : null;
            if (np) np.value = F.toIsoDate(e[f.key]) || '';
          } else {
            el.value = (e[f.key] || '');
          }
        }
      });
      $('#e_note').value = e.admin_note || '';
      if (e.has_photo) $('#pbox').outerHTML = '<div class="photo-box has" id="pbox"><img alt="" src="/api/photo/' + e.id + '?v=' + encodeURIComponent(e.photo_v) + '"></div>';
    }
    var aad = $('#e_aadhaar'); aad.oninput = function () { aad.value = F.fmtAadhaar(aad.value.replace(/\D/g, '').slice(0, 12)); };
    ['e_contact1', 'e_contact2', 'e_account_no'].forEach(function (id) { var el = $('#' + id); el.oninput = function () { el.value = el.value.replace(/\D/g, ''); }; });
    var ifsc = $('#e_ifsc'); ifsc.oninput = function () { ifsc.value = ifsc.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
    $('#pbtn').onclick = function () { $('#pfile').click(); };
    $('#pfile').onchange = function (ev) { cropPhoto(ev.target.files[0]).then(function (url) { D.photo = url; D.changed = true; var b = $('#pbox'); b.className = 'photo-box has'; b.innerHTML = '<img alt="" src="' + url + '">'; $('#perr').hidden = true; }).catch(function (er) { var p = $('#perr'); p.textContent = er.message; p.hidden = false; }); ev.target.value = ''; };
    $('#ecancel').onclick = function () { if (isNew) closeDrawer(); else drawView(e, hist); };
    $('#ef').onsubmit = function (ev) {
      ev.preventDefault();
      var vals = {}; F.FIELDS.forEach(function (f) { vals[f.key] = $('#e_' + f.key).value; });
      var errs = F.validate(vals); if (isNew && !D.photo) errs.photo = 'Photo is required';
      $$('#ef .field').forEach(function (el) { var k = el.dataset.key, er = $('.err', el); if (!er) return; er.hidden = !errs[k]; er.textContent = errs[k] || ''; el.classList.toggle('invalid', !!errs[k]); });
      var pe = $('#perr'); pe.hidden = !errs.photo; pe.textContent = errs.photo || '';
      if (Object.keys(errs).length) { $('#eerr').innerHTML = '<div class="alert bad">Please correct the highlighted fields.</div>'; var first = $('#ef .invalid'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      $('#eerr').innerHTML = ''; var btn = $('#esave'); btn.disabled = true;
      var body = Object.assign({}, vals); if (D.changed) body.photo = D.photo;
      if (!isNew) { body.status = $('#e_status').value; body.admin_note = $('#e_note').value; }
      api(isNew ? 'POST' : 'PUT', isNew ? '/api/admin/employees' : '/api/admin/employees/' + e.id, body).then(function (r) {
        toast(isNew ? 'Employee added (' + r.code + ')' : 'Changes saved'); load(); loadStats(); openDrawer(isNew ? r.id : e.id);
      }).catch(function (er) {
        btn.disabled = false;
        if (er.data && er.data.errors) { Object.keys(er.data.errors).forEach(function (k) { var el = $('#ef [data-key="' + k + '"]'); if (el) { var x = $('.err', el); x.textContent = er.data.errors[k]; x.hidden = false; el.classList.add('invalid'); } }); }
        $('#eerr').innerHTML = '<div class="alert bad">' + esc(er.message === 'validation' ? 'Please correct the highlighted fields.' : er.message) + '</div>';
      });
    };
  }
  function cropPhoto(file) {
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error('No file chosen'));
      var make = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' }) : new Promise(function (ok, no) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = no; i.src = URL.createObjectURL(file); });
      make.then(function (img) {
        var w = img.width, h = img.height; if (w < 200 || h < 200) return rej(new Error('This photo is too small'));
        var tw = 450, th = 600, ratio = tw / th, sw = w, sh = h, sx = 0, sy = 0;
        if (w / h > ratio) { sw = h * ratio; sx = (w - sw) / 2; } else { sh = w / ratio; sy = (h - sh) * 0.25; }
        var c = document.createElement('canvas'); c.width = tw; c.height = th; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, tw, th); g.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
        res(c.toDataURL('image/jpeg', 0.88));
      }).catch(function () { rej(new Error('This photo could not be opened')); });
    });
  }

  /* ================= share ================= */
  function viewShare() {
    var link = location.origin + '/';
    $('#view').innerHTML = '<div class="card"><h2>Employee form link and QR code</h2><p class="sub">Send this link on WhatsApp, or print the QR code and put it at the office or site. Employees open it in Chrome on their phone. No app or login is needed.</p>' +
      '<div class="qr-panel"><img id="qrimg" alt="QR code for the employee form" src="' + QR.toDataURL(link, 600) + '"><div><label class="muted" style="font-size:13px;font-weight:600">Employee form link</label><div class="linkbox"><input type="text" readonly id="lk" value="' + esc(link) + '"><button class="btn" id="cp">Copy</button></div>' +
      '<div class="actions" style="margin-top:12px"><a class="btn secondary" id="dlqr" download="DOFORT-employee-form-QR.png" href="' + QR.toDataURL(link, 900) + '">Download QR (PNG)</a><button class="btn secondary" id="pr">Print poster</button><a class="btn secondary" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Please fill your DOFORT WORLD employee joining form here: ' + link) + '">Share on WhatsApp</a><a class="btn ghost" target="_blank" rel="noopener" href="' + esc(link) + '">Preview form</a></div>' +
      (/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) ? '<div class="alert warn" style="margin-top:14px">This is a local address. Employees cannot open it. Use this page on your public website address instead.</div>' : '') + '</div></div></div>' +
      '<div class="card"><h2>What employees do</h2><ol style="margin:8px 0 0;padding-left:20px;color:var(--muted)"><li>Scan the QR code or tap the link. The form opens in Chrome.</li><li>Take or choose a photo and fill in the details from the joining form.</li><li>Submit. They get a reference number and a private link to edit later.</li><li>You see the record here at once and can approve it or ask for a correction.</li></ol></div>' +
      '<div class="poster" id="poster" hidden></div>';
    $('#cp').onclick = function () { var i = $('#lk'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { toast('Link copied'); }, function () { document.execCommand('copy'); toast('Link copied'); }); };
    $('#pr').onclick = function () {
      var w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print the poster'); return; }
      w.document.write('<!doctype html><title>Poster</title><style>body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:50px 40px}h1{font-size:34px;margin:0;color:#14284b}p{font-size:18px;color:#333}img{width:420px;height:420px;margin:24px 0;image-rendering:pixelated}.l{font:600 18px monospace;word-break:break-all}.s{font-size:15px;color:#555;margin-top:30px}</style><h1>DOFORT WORLD MK PVT LTD</h1><p>9, NGO Colony, Bangalore High Road, Sriperumbudur - 602 105</p><h1 style="margin-top:36px;font-size:40px">Scan to fill your joining form</h1><img src="' + QR.toDataURL(link, 900) + '"><div class="l">' + esc(link) + '</div><p class="s">Keep your Aadhaar card, bank passbook and a passport size photo ready.</p>');
      w.document.close(); setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* ignore */ } }, 500);
    };
  }

  /* ================= activity ================= */
  function viewActivity() {
    $('#view').innerHTML = '<div class="card"><h2>Activity log</h2><p class="sub">Every login, change, view of full details, export and deletion is recorded here.</p><div class="table-wrap" id="al"><div class="spinner"></div></div></div>';
    api('GET', '/api/admin/audit?limit=300').then(function (r) {
      $('#al').innerHTML = '<table class="t" style="min-width:640px"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>' + r.rows.map(function (a) { return '<tr style="cursor:default"><td>' + ist(a.at) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.code || '') + '</td><td>' + esc(a.detail || '') + '</td></tr>'; }).join('') + '</tbody></table>';
    });
  }

  /* ================= settings ================= */
  function viewSettings() {
    $('#view').innerHTML = '<div class="spinner"></div>';
    api('GET', '/api/admin/settings').then(function (s) {
      $('#view').innerHTML = '<div class="card"><h2>Employee form</h2><p class="sub">Control what employees see when they open the link.</p><div class="grid"><div class="field wide"><label class="switch"><input type="checkbox" id="so"' + (s.form_open ? ' checked' : '') + '> Accept new submissions (employees can still edit their own form)</label></div><div class="field wide"><label for="sc">Pre-filled company name (optional)</label><input type="text" id="sc" maxlength="120" value="' + esc(s.default_company) + '" placeholder="Company where the employees will work"></div><div class="field wide"><label for="sn">Notice shown at the top of the form (optional)</label><input type="text" id="sn" maxlength="300" value="' + esc(s.form_notice) + '" placeholder="Example: Bring your original Aadhaar card on the joining day."></div></div><div class="actions" style="margin-top:14px"><button class="btn" id="ssave">Save settings</button></div></div>' +
        '<div class="card"><h2>Change admin password</h2><div class="grid"><div class="field"><label for="p0">Current password</label><input type="password" id="p0" autocomplete="current-password"></div><div class="field"><label for="p1">New password (at least 8 characters)</label><input type="password" id="p1" autocomplete="new-password"></div></div><div id="pe" class="alert bad" style="margin-top:12px" hidden></div><div class="actions" style="margin-top:14px"><button class="btn" id="psave">Change password</button></div></div>' +
        '<div class="card"><h2>Backup</h2><p class="sub">Download a full copy of the database (all records and photos). Keep it somewhere safe. Take a backup every week.</p><a class="btn secondary" href="/api/admin/backup">Download backup (.db)</a></div>';
      $('#ssave').onclick = function () { api('PUT', '/api/admin/settings', { form_open: $('#so').checked, default_company: $('#sc').value, form_notice: $('#sn').value }).then(function () { toast('Settings saved'); }); };
      $('#psave').onclick = function () {
        var e = $('#pe'); e.hidden = true;
        api('POST', '/api/admin/password', { current: $('#p0').value, next: $('#p1').value }).then(function () { S.defaultPw = false; toast('Password changed'); $('#p0').value = ''; $('#p1').value = ''; render(); }).catch(function (er) { e.textContent = er.message; e.hidden = false; });
      };
    });
  }

  /* ================= boot ================= */
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  function boot() {
    api('GET', '/api/admin/me').then(function (r) { S.defaultPw = r.defaultPassword; shell(); render(); }).catch(function () { showLogin(); });
  }
  boot();
})();
