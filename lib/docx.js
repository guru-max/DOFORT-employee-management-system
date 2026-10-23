'use strict';
// Builds real .docx files: a one-person BIO-DATA form (with photo) and a landscape list table.
const { zip } = require('./zip');
const COMPANY = require('./company');

const esc = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function run(text, o = {}) {
  const rpr = `<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.bold ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${(o.size || 10.5) * 2}"/></w:rPr>`;
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
function para(text, o = {}) {
  const ppr = `<w:pPr><w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 60 : o.after}"/><w:jc w:val="${o.align || 'left'}"/></w:pPr>`;
  return `<w:p>${ppr}${text === '' ? '' : run(text, o)}</w:p>`;
}
function cell(content, width, o = {}) {
  const tcpr = `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.vmerge ? (o.vmerge === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}<w:vAlign w:val="${o.valign || 'center'}"/></w:tcPr>`;
  return `<w:tc>${tcpr}${content || '<w:p/>'}</w:tc>`;
}
const BORDER = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="8A97A8"/><w:left w:val="single" w:sz="4" w:color="8A97A8"/><w:bottom w:val="single" w:sz="4" w:color="8A97A8"/><w:right w:val="single" w:sz="4" w:color="8A97A8"/><w:insideH w:val="single" w:sz="4" w:color="8A97A8"/><w:insideV w:val="single" w:sz="4" w:color="8A97A8"/></w:tblBorders>';
function table(grid, rows, extra = '') {
  return `<w:tbl><w:tblPr><w:tblW w:w="${grid.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${BORDER}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>${extra}</w:tblPr><w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

function package_(bodyXml, sect, photo) {
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${photo ? '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.jpg"/>' : ''}</Relationships>` },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${bodyXml}${sect}</w:body></w:document>` }
  ];
  if (photo) files.push({ name: 'word/media/photo.jpg', data: photo, store: true });
  return zip(files);
}

function imageXml(w, h) {
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="1" name="Photo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="photo.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

// rows: [[label, value], ...]; photo: Buffer|null; dims: {w,h}
function docxProfile(rows, photo, dims, footer) {
  let body = para(COMPANY.name, { bold: true, size: 16, align: 'center', after: 0, color: '14284B' });
  COMPANY.lines.forEach((l) => { body += para(l, { size: 9, align: 'center', after: 0, color: '4A5A6E' }); });
  body += para('BIO - DATA', { bold: true, size: 14, align: 'center', before: 200, after: 160 });
  const grid = [2600, 4300, 2000];
  const PH = 8; // photo spans this many rows
  const trs = rows.map((r, i) => {
    if (r.heading) return `<w:tr>${cell(para(r.heading, { bold: true, size: 10.5, after: 0, color: '14284B' }), 8900, { span: 3, fill: 'E6ECF5' })}</w:tr>`;
    const label = cell(para(r[0], { bold: true, after: 0 }), grid[0], { fill: 'F4F6F9' });
    if (photo && i < PH) {
      const maxW = 1080000, maxH = 1400000; const k = Math.min(maxW / dims.w, maxH / dims.h);
      const ph = i === 0 ? cell(imageXml(Math.round(dims.w * k), Math.round(dims.h * k)), grid[2], { vmerge: 'restart' }) : cell('<w:p/>', grid[2], { vmerge: true });
      return `<w:tr><w:trPr><w:trHeight w:val="430"/></w:trPr>${label}${cell(para(r[1], { after: 0 }), grid[1])}${ph}</w:tr>`;
    }
    return `<w:tr><w:trPr><w:trHeight w:val="430"/></w:trPr>${label}${cell(para(r[1], { after: 0 }), grid[1] + grid[2], { span: 2 })}</w:tr>`;
  });
  body += table(grid, trs);
  body += para('', { after: 500 });
  body += `<w:tbl><w:tblPr><w:tblW w:w="8900" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4450"/><w:gridCol w:w="4450"/></w:tblGrid><w:tr>${cell(para('Signature of Employee', { size: 10, align: 'left', after: 0 }), 4450)}${cell(para('Authorised Signatory', { size: 10, align: 'right', after: 0 }), 4450)}</w:tr></w:tbl>`;
  if (footer) body += para(footer, { size: 8.5, color: '6B7A8C', before: 300, after: 0 });
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="1000" w:bottom="900" w:left="1000" w:header="500" w:footer="500"/></w:sectPr>';
  return package_(body, sect, photo);
}

// columns: [{label, w}] (w in dxa, total 15000 for landscape A4)
function docxList(title, subtitle, columns, data) {
  const total = columns.reduce((a, c) => a + c.w, 0);
  let body = para(COMPANY.name, { bold: true, size: 15, after: 0, color: '14284B' });
  body += para(title, { bold: true, size: 12, after: 0 });
  body += para(subtitle, { size: 9, color: '6B7A8C', after: 160 });
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${columns.map((c) => cell(para(c.label, { bold: true, size: 9, color: 'FFFFFF', after: 0 }), c.w, { fill: '14284B' })).join('')}</w:tr>`;
  const rows = data.map((r, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${columns.map((c, j) => cell(para(r[j], { size: 9, after: 0 }), c.w, { fill: i % 2 ? 'F4F6F9' : undefined, valign: 'top' })).join('')}</w:tr>`);
  body += table(columns.map((c) => c.w), [head, ...rows]);
  const sect = `<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="700" w:right="600" w:bottom="700" w:left="600" w:header="400" w:footer="400"/></w:sectPr>`;
  return package_(body, sect, null);
}
module.exports = { docxProfile, docxList };
