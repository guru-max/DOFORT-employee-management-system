'use strict';
// Dependency-free PDF writer: text, lines, boxes and JPEG images on A4 pages.
const zlib = require('zlib');
const COMPANY = require('./company');

// Helvetica glyph widths for ASCII 32..126 (per 1000 units)
const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
function cleanText(s) {
  return String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}
function textWidth(s, size, bold) {
  let w = 0; for (const ch of cleanText(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? W[c - 32] : 556; }
  return (w / 1000) * size * (bold ? 1.06 : 1);
}
function wrap(s, size, maxW, bold) {
  const words = cleanText(s).split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (let word of words) {
    while (textWidth(word, size, bold) > maxW) { // break very long words
      let n = word.length; while (n > 1 && textWidth(word.slice(0, n), size, bold) > maxW) n--;
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(word.slice(0, n)); word = word.slice(n);
    }
    const t = cur ? cur + ' ' + word : word;
    if (textWidth(t, size, bold) <= maxW) cur = t; else { lines.push(cur); cur = word; }
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}
function jpegInfo(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('Not a valid JPEG');
}

class PDF {
  constructor(w = 595.28, h = 841.89) { this.w = w; this.h = h; this.pages = []; this.images = []; this.cur = null; this.addPage(); }
  addPage() { this.cur = { ops: [], imgs: [] }; this.pages.push(this.cur); }
  _y(y) { return this.h - y; } // top-down coordinates
  color(c, stroke) {
    const m = /^#?([0-9a-f]{6})$/i.exec(c || '#000000'); const v = m ? m[1] : '000000';
    const r = [0, 2, 4].map((i) => (parseInt(v.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
    return r + (stroke ? ' RG' : ' rg');
  }
  text(x, y, s, size = 10, o = {}) {
    let t = cleanText(s); if (o.align) { const tw = textWidth(t, size, o.bold); x = o.align === 'center' ? x - tw / 2 : x - tw; }
    t = t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    this.cur.ops.push(`BT ${this.color(o.color)} /${o.bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${this._y(y).toFixed(2)} Td (${t}) Tj ET`);
  }
  line(x1, y1, x2, y2, c = '#8A97A8', w = 0.6) { this.cur.ops.push(`${this.color(c, true)} ${w} w ${x1.toFixed(2)} ${this._y(y1).toFixed(2)} m ${x2.toFixed(2)} ${this._y(y2).toFixed(2)} l S`); }
  rect(x, y, w, h, o = {}) {
    const p = `${x.toFixed(2)} ${this._y(y + h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`;
    if (o.fill && o.stroke) this.cur.ops.push(`${this.color(o.fill)} ${this.color(o.stroke, true)} ${o.lw || 0.6} w ${p} B`);
    else if (o.fill) this.cur.ops.push(`${this.color(o.fill)} ${p} f`);
    else this.cur.ops.push(`${this.color(o.stroke || '#8A97A8', true)} ${o.lw || 0.6} w ${p} S`);
  }
  image(buf, x, y, w, h) {
    const info = jpegInfo(buf); let idx = this.images.findIndex((im) => im.buf === buf);
    if (idx < 0) { this.images.push({ buf, info }); idx = this.images.length - 1; }
    if (!this.cur.imgs.includes(idx)) this.cur.imgs.push(idx);
    this.cur.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${this._y(y + h).toFixed(2)} cm /Im${idx} Do Q`);
  }
  build() {
    const objs = []; // each: Buffer
    const add = (b) => { objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1')); return objs.length; };
    const catalog = add('<< /Type /Catalog /Pages 2 0 R >>'); // 1
    add(''); // 2 pages placeholder
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgIds = this.images.map((im) => {
      const cs = im.info.comps === 1 ? '/DeviceGray' : im.info.comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      const head = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${im.info.w} /Height ${im.info.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.buf.length} >>\nstream\n`, 'latin1');
      return add(Buffer.concat([head, im.buf, Buffer.from('\nendstream', 'latin1')]));
    });
    const pageIds = [];
    const total = this.pages.length;
    this.pages.forEach((pg, n) => {
      const content = zlib.deflateSync(Buffer.from(pg.ops.join('\n'), 'latin1'));
      const cid = add(Buffer.concat([Buffer.from(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]));
      const xo = pg.imgs.map((i) => `/Im${i} ${imgIds[i]} 0 R`).join(' ');
      pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.w.toFixed(2)} ${this.h.toFixed(2)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${xo} >> >> /Contents ${cid} 0 R >>`));
    });
    objs[1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((i) => i + ' 0 R').join(' ')}] /Count ${total} >>`, 'latin1');
    const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')]; const offs = []; let pos = parts[0].length;
    objs.forEach((o, i) => { offs.push(pos); const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')]); parts.push(b); pos += b.length; });
    let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`; offs.forEach((o) => { xref += String(o).padStart(10, '0') + ' 00000 n \n'; });
    parts.push(Buffer.from(xref + `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF`, 'latin1'));
    return Buffer.concat(parts);
  }
}

// One person's BIO-DATA form. rows: [{heading}|[label,value]]
function pdfProfile(rows, photo, footer) {
  const d = new PDF(), L = 48, R = 595.28 - 48, NAVY = '#14284B';
  d.text(297.64, 56, COMPANY.name, 17, { bold: true, align: 'center', color: NAVY });
  COMPANY.lines.forEach((l, i) => d.text(297.64, 72 + i * 12, l, 9, { align: 'center', color: '#4A5A6E' }));
  d.line(L, 110, R, 110, NAVY, 1.4);
  d.text(297.64, 134, 'BIO - DATA', 14, { bold: true, align: 'center' });
  let y = 152; const photoW = 96, photoH = 124, px = R - photoW, py = 150;
  if (photo) {
    d.rect(px, py, photoW, photoH, { stroke: '#8A97A8' });
    const info = jpegInfo(photo), k = Math.min((photoW - 4) / info.w, (photoH - 4) / info.h), iw = info.w * k, ih = info.h * k;
    d.image(photo, px + (photoW - iw) / 2, py + (photoH - ih) / 2, iw, ih);
  } else { d.rect(px, py, photoW, photoH, { stroke: '#8A97A8' }); d.text(px + photoW / 2, py + photoH / 2, 'PHOTO', 9, { align: 'center', color: '#8A97A8' }); }
  rows.forEach((r) => {
    if (r.heading) { y += 6; d.rect(L, y - 10, R - L, 17, { fill: '#E6ECF5' }); d.text(L + 6, y + 2, r.heading, 10, { bold: true, color: NAVY }); y += 22; return; }
    const maxX = y < py + photoH + 6 ? px - 14 : R, vx = L + 150, lines = wrap(r[1] || '-', 10.5, maxX - vx - 2);
    d.text(L, y, r[0], 10, { bold: true, color: '#26364A' });
    lines.forEach((ln, i) => d.text(vx, y + i * 13, ln, 10.5));
    const bottom = y + (lines.length - 1) * 13 + 5;
    d.line(L, bottom, maxX, bottom, '#C9D1DC', 0.5);
    y = bottom + 17;
  });
  const sy = Math.max(y + 50, 740);
  d.line(L, sy, L + 170, sy, '#26364A', 0.7); d.text(L, sy + 13, 'Signature of Employee', 9);
  d.line(R - 170, sy, R, sy, '#26364A', 0.7); d.text(R, sy + 13, 'Authorised Signatory', 9, { align: 'right' });
  if (footer) d.text(L, 815, footer, 8, { color: '#6B7A8C' });
  return d.build();
}

// Landscape table. columns: [{label, w}], data: string[][]
function pdfList(title, subtitle, columns, data) {
  const d = new PDF(841.89, 595.28), L = 28, R = 841.89 - 28, NAVY = '#14284B';
  const scale = (R - L) / columns.reduce((a, c) => a + c.w, 0), cols = columns.map((c) => ({ ...c, w: c.w * scale }));
  const fs = 8, lh = 10, pad = 4;
  let pageNo = 0;
  const header = () => {
    pageNo++;
    d.text(L, 36, COMPANY.name, 13, { bold: true, color: NAVY });
    d.text(L, 50, title, 10, { bold: true }); d.text(R, 50, subtitle, 8, { align: 'right', color: '#6B7A8C' });
    let x = L; d.rect(L, 58, R - L, 18, { fill: NAVY });
    cols.forEach((c) => { d.text(x + pad, 70, c.label, fs, { bold: true, color: '#FFFFFF' }); x += c.w; });
    return 76;
  };
  const footer = () => d.text(R, 580, 'Page ' + pageNo, 8, { align: 'right', color: '#6B7A8C' });
  let y = header();
  data.forEach((row, ri) => {
    const cells = row.map((v, i) => wrap(v || '', fs, cols[i].w - pad * 2).slice(0, 3));
    const hgt = Math.max(...cells.map((c) => c.length)) * lh + pad * 2;
    if (y + hgt > 565) { footer(); d.addPage(); y = header(); }
    if (ri % 2) d.rect(L, y, R - L, hgt, { fill: '#F2F5F9' });
    let x = L; cells.forEach((c, i) => { c.forEach((ln, k) => d.text(x + pad, y + pad + 7 + k * lh, ln, fs)); x += cols[i].w; });
    d.line(L, y + hgt, R, y + hgt, '#D5DCE6', 0.4); y += hgt;
  });
  if (!data.length) d.text(L, y + 24, 'No records match the selected filters.', 10, { color: '#6B7A8C' });
  footer();
  return d.build();
}
module.exports = { pdfProfile, pdfList, jpegInfo };
