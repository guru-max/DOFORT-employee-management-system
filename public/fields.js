/* Shared field definitions and validation. Used by the browser and by the server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DFW = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'];
  var STATUSES = ['Submitted', 'Under Review', 'Approved', 'Needs Correction', 'Rejected', 'Resubmitted'];

  // Every field of the BIO-DATA joining form, in form order.
  var FIELDS = [
    { key: 'company_name',  label: 'Company Name',          section: 'Personal details', type: 'text',   required: true,  max: 120, hint: 'Company where you are joining' },
    { key: 'interview_date',label: 'Interview Date',        section: 'Personal details', type: 'date',   required: true,  hint: 'DD/MM/YYYY' },
    { key: 'name',          label: 'Name of Applicant',     section: 'Personal details', type: 'text',   required: true,  max: 80,  hint: 'As on Aadhaar card' },
    { key: 'father_name',   label: "Father's Name",         section: 'Personal details', type: 'text',   required: true,  max: 80 },
    { key: 'dob',           label: 'Date of Birth',         section: 'Personal details', type: 'date',   required: true,  hint: 'DD/MM/YYYY' },
    { key: 'gender',        label: 'Gender',                section: 'Personal details', type: 'select', required: true,  options: ['Male', 'Female', 'Other'] },
    { key: 'marital_status',label: 'Marital Status',        section: 'Personal details', type: 'select', required: true,  options: ['Single', 'Married', 'Divorced', 'Widowed'] },
    { key: 'aadhaar',       label: 'Aadhaar Card No',       section: 'Identity',         type: 'aadhaar',required: true,  hint: '12 digit number', sensitive: true },
    { key: 'house_no',      label: 'House No',              section: 'Present address',  type: 'text',   required: true,  max: 60 },
    { key: 'village',       label: 'Village / Building',    section: 'Present address',  type: 'text',   required: true,  max: 100 },
    { key: 'post_office',   label: 'Post Office',           section: 'Present address',  type: 'text',   required: true,  max: 80 },
    { key: 'district',      label: 'District',              section: 'Present address',  type: 'text',   required: true,  max: 60 },
    { key: 'state',         label: 'State',                 section: 'Present address',  type: 'select', required: true,  options: STATES },
    { key: 'contact1',      label: 'Contact Number',        section: 'Contact',          type: 'mobile', required: true,  hint: '10 digit mobile number' },
    { key: 'contact2',      label: 'Alternate Contact Number', section: 'Contact',       type: 'mobile', required: false, hint: 'Optional' },
    { key: 'doj',           label: 'Date of Joining (DOJ)', section: 'Employment',       type: 'date',   required: true,  hint: 'DD/MM/YYYY' },
    { key: 'designation',   label: 'Designation',           section: 'Employment',       type: 'text',   required: true,  max: 80 },
    { key: 'pf_no',         label: 'PF No',                 section: 'Employment',       type: 'text',   required: false, max: 40, hint: 'If you have one' },
    { key: 'esic_no',       label: 'ESIC No',               section: 'Employment',       type: 'text',   required: false, max: 40, hint: 'If you have one' },
    { key: 'account_no',    label: 'Bank Account No',       section: 'Bank details',     type: 'account',required: true,  hint: '9 to 18 digits', sensitive: true },
    { key: 'ifsc',          label: 'IFSC Code',             section: 'Bank details',     type: 'ifsc',   required: true,  hint: 'Example: SBIN0001234' }
  ];

  // Verhoeff checksum, used by Aadhaar numbers.
  var D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  var P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  function verhoeff(num) {
    var c = 0, a = String(num).split('').reverse();
    for (var i = 0; i < a.length; i++) c = D[c][P[i % 8][+a[i]]];
    return c === 0;
  }

  function digits(v) { return String(v == null ? '' : v).replace(/[\s-]/g, ''); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function parseDateParts(s) {
    if (!s || typeof s !== 'string') return null;
    s = s.trim();
    var m;
    if ((m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s))) {
      return { day: +m[1], month: +m[2], year: +m[3] };
    }
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
      return { day: +m[3], month: +m[2], year: +m[1] };
    }
    return null;
  }

  function toIsoDate(s) {
    var p = parseDateParts(s);
    if (!p) return '';
    if (p.year < 1900 || p.year > 2100 || p.month < 1 || p.month > 12 || p.day < 1 || p.day > 31) return '';
    var dt = new Date(Date.UTC(p.year, p.month - 1, p.day));
    if (isNaN(dt.getTime())) return '';
    if (dt.getUTCFullYear() !== p.year || (dt.getUTCMonth() + 1) !== p.month || dt.getUTCDate() !== p.day) return '';
    return p.year + '-' + pad2(p.month) + '-' + pad2(p.day);
  }

  function validDate(s) {
    return toIsoDate(s) !== '';
  }

  function dmy(s) {
    var p = parseDateParts(s);
    if (!p) return s || '';
    if (p.year < 1900 || p.year > 2100 || p.month < 1 || p.month > 12 || p.day < 1 || p.day > 31) return s || '';
    var dt = new Date(Date.UTC(p.year, p.month - 1, p.day));
    if (isNaN(dt.getTime())) return s || '';
    if (dt.getUTCFullYear() !== p.year || (dt.getUTCMonth() + 1) !== p.month || dt.getUTCDate() !== p.day) return s || '';
    return pad2(p.day) + '/' + pad2(p.month) + '/' + p.year;
  }

  function normalize(data) {
    var out = {};
    FIELDS.forEach(function (f) {
      var v = data[f.key]; v = v == null ? '' : String(v).trim();
      if (f.type === 'aadhaar' || f.type === 'account' || f.type === 'mobile') v = digits(v);
      if (f.type === 'ifsc') v = v.toUpperCase().replace(/\s/g, '');
      if (f.type === 'text') v = v.replace(/\s+/g, ' ');
      if (f.type === 'date') {
        var iso = toIsoDate(v);
        if (iso) v = iso;
      }
      out[f.key] = v;
    });
    return out;
  }

  // Returns { key: message } for every invalid field. Empty object means valid.
  function validate(raw) {
    var d = normalize(raw), e = {}, today = new Date().toISOString().slice(0, 10);
    FIELDS.forEach(function (f) {
      var v = d[f.key], orig = raw[f.key];
      orig = orig == null ? '' : String(orig).trim();
      if (!orig) { if (f.required) e[f.key] = f.label + ' is required'; return; }
      if (f.max && orig.length > f.max) e[f.key] = 'Too long (maximum ' + f.max + ' characters)';
      else if (f.type === 'select' && f.options.indexOf(orig) < 0) e[f.key] = 'Choose one of the options';
      else if (f.type === 'date' && !validDate(orig)) e[f.key] = 'Enter a valid date (DD/MM/YYYY)';
      else if (f.type === 'aadhaar' && !(/^[2-9]\d{11}$/.test(v) && verhoeff(v))) e[f.key] = 'Enter a valid 12 digit Aadhaar number';
      else if (f.type === 'mobile' && !/^[6-9]\d{9}$/.test(v)) e[f.key] = 'Enter a valid 10 digit mobile number';
      else if (f.type === 'account' && !/^\d{9,18}$/.test(v)) e[f.key] = 'Account number must be 9 to 18 digits';
      else if (f.type === 'ifsc' && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) e[f.key] = 'Enter a valid IFSC (11 characters, for example SBIN0001234)';
    });
    if (!e.dob && d.dob) {
      var age = (Date.parse(today) - Date.parse(d.dob)) / 31557600000;
      if (age < 14 || age > 80) e.dob = 'Check the date of birth';
    }
    if (!e.interview_date && d.interview_date && d.interview_date > today) e.interview_date = 'Interview date cannot be in the future';
    if (!e.doj && d.doj && !e.dob && d.dob && d.doj < d.dob) e.doj = 'Date of joining is before date of birth';
    if (d.contact2 && d.contact2 === d.contact1 && !e.contact2) e.contact2 = 'Alternate number is the same as the first number';
    return e;
  }

  function maskAadhaar(a) { a = digits(a); return a.length === 12 ? 'XXXX XXXX ' + a.slice(8) : a; }
  function fmtAadhaar(a) { a = digits(a); return a.length === 12 ? a.slice(0, 4) + ' ' + a.slice(4, 8) + ' ' + a.slice(8) : a; }
  function maskAccount(a) { a = digits(a); return a.length > 4 ? new Array(a.length - 3).join('X') + a.slice(-4) : a; }

  return { FIELDS: FIELDS, STATES: STATES, STATUSES: STATUSES, validate: validate, normalize: normalize, verhoeff: verhoeff, dmy: dmy, toIsoDate: toIsoDate, parseDateParts: parseDateParts, maskAadhaar: maskAadhaar, fmtAadhaar: fmtAadhaar, maskAccount: maskAccount, digits: digits };
});
