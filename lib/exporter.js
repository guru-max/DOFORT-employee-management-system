'use strict';
const F = require('../public/fields.js');
const { buildXlsx } = require('./xlsx');
const { docxProfile, docxList } = require('./docx');
const { pdfProfile, pdfList, jpegInfo } = require('./pdf');

const IST = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
  if (isNaN(d)) return iso;
  const p = new Date(d.getTime() + 5.5 * 3600000).toISOString();
  return p.slice(8, 10) + '/' + p.slice(5, 7) + '/' + p.slice(0, 4) + ' ' + p.slice(11, 16);
};

function val(e, f) {
  const v = e[f.key] || '';
  if (f.type === 'date') return F.dmy(v);
  if (f.type === 'aadhaar') return e.aadhaar_masked ? F.maskAadhaar(v) : F.fmtAadhaar(v);
  return v;
}

function profileRows(e) {
  const g = (k) => val(e, F.FIELDS.find((f) => f.key === k));
  return [
    ['Company Name', g('company_name')], ['Interview Date', g('interview_date')], ['Name of Applicant', g('name')],
    ["Father's Name", g('father_name')], ['Date of Birth', g('dob')], ['Aadhaar Card No', g('aadhaar')],
    ['Gender', g('gender')], ['Marital Status', g('marital_status')],
    { heading: 'Present Address' },
    ['House No', g('house_no')], ['Village / Building', g('village')], ['Post Office', g('post_office')], ['District', g('district')], ['State', g('state')],
    { heading: 'Contact' },
    ['Contact Number', [g('contact1'), g('contact2')].filter(Boolean).join('  /  ')],
    { heading: 'Employment and Bank' },
    ['Date of Joining (DOJ)', g('doj')], ['Designation', g('designation')], ['PF No', g('pf_no')], ['ESIC No', g('esic_no')],
    ['Bank Account No', g('account_no')], ['IFSC Code', g('ifsc')]
  ];
}
function footerText(e) { return `Ref ${e.code}  |  Status: ${e.status}  |  Submitted ${IST(e.created_at)}  |  Last updated ${IST(e.updated_at)}`; }

function profile(format, e, photo) {
  const rows = profileRows(e);
  if (format === 'pdf') return { buf: pdfProfile(rows, photo, footerText(e)), type: 'application/pdf', ext: 'pdf' };
  if (format === 'docx') {
    const dims = photo ? jpegInfo(photo) : null;
    return { buf: docxProfile(rows, photo, dims, footerText(e)), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
  }
  throw new Error('Unknown format');
}

const LIST_COLS = [
  { label: 'Ref No', w: 62, get: (e) => e.code },
  { label: 'Name', w: 120, get: (e) => e.name },
  { label: "Father's Name", w: 110, get: (e) => e.father_name },
  { label: 'DOB', w: 60, get: (e) => F.dmy(e.dob) },
  { label: 'Gender', w: 46, get: (e) => e.gender },
  { label: 'Contact', w: 78, get: (e) => e.contact1 },
  { label: 'Designation', w: 100, get: (e) => e.designation },
  { label: 'DOJ', w: 60, get: (e) => F.dmy(e.doj) },
  { label: 'District', w: 80, get: (e) => e.district },
  { label: 'Status', w: 74, get: (e) => e.status }
];

function list(format, emps, meta) {
  const stamp = IST(new Date().toISOString().slice(0, 19));
  const subtitle = `${emps.length} record${emps.length === 1 ? '' : 's'}  |  Exported ${stamp}${meta.filter ? '  |  ' + meta.filter : ''}`;
  if (format === 'xlsx') {
    const header = ['Ref No', 'Status', 'Submitted On', 'Last Updated'].concat(F.FIELDS.map((f) => f.label), ['Admin Note']);
    const rows = emps.map((e) => [e.code, e.status, IST(e.created_at), IST(e.updated_at)].concat(F.FIELDS.map((f) => val(e, f)), [e.admin_note || '']));
    return { buf: buildXlsx(header, rows, { sheet: 'Employees' }), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
  }
  if (format === 'csv') {
    const header = ['Ref No', 'Status', 'Submitted On', 'Last Updated'].concat(F.FIELDS.map((f) => f.label), ['Admin Note']);
    const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const lines = [header.map(q).join(',')].concat(emps.map((e) => [e.code, e.status, IST(e.created_at), IST(e.updated_at)].concat(F.FIELDS.map((f) => val(e, f)), [e.admin_note || '']).map((c) => q(/^\d{9,}$/.test(c) ? '\t' + c : c)).join(',')));
    return { buf: Buffer.from('﻿' + lines.join('\r\n'), 'utf8'), type: 'text/csv; charset=utf-8', ext: 'csv' };
  }
  const data = emps.map((e) => LIST_COLS.map((c) => c.get(e) || ''));
  if (format === 'pdf') return { buf: pdfList('Employee Joining Details', subtitle, LIST_COLS, data), type: 'application/pdf', ext: 'pdf' };
  if (format === 'docx') {
    const total = LIST_COLS.reduce((a, c) => a + c.w, 0), cols = LIST_COLS.map((c) => ({ label: c.label, w: Math.round(c.w / total * 15600) }));
    return { buf: docxList('Employee Joining Details', subtitle, cols, data), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
  }
  throw new Error('Unknown format');
}
module.exports = { profile, list, IST };
