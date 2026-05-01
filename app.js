'use strict';

// ─── SVG / Insert constants ────────────────────────────────────────────────────
// Standard width: 5.946 in × 72 = 428.16 pt
// Woodland Hills: 6.1875 in × 72 = 445.5 pt
const SVG_W_STD = 428.16;
const SVG_W_WH  = 445.5;
const SVG_H     = 167.37;

const FILL_BG   = '#edeae1';
const FILL_TEXT = '#001952';
const FONT_FAM  = "'FMReview-Regular', 'FM Review', sans-serif";

const NAME_SIZE    = 48;
const NAME_SIZE_XL = 27;    // drops to 27pt when name doesn't fit on one 48pt line
const TITLE_SIZE    = 21.34;
const TITLE_SIZE_XL = 19;    // reduced when paired with a 27pt name + 2-line title

const TITLE_LINE_H    = 27;
const TITLE_LINE_H_XL = 23;

const LEFT_X       = 41.09;
const RIGHT_MARGIN = 41.09;

// ─── Layouts ───────────────────────────────────────────────────────────────────
// No-title layouts — positions derived from FM template files
const NT_S  = { nameY: 101.69, nameSize: NAME_SIZE,    nameLineH: 0  };  // 1-line 48pt
const NT_L  = { nameY:  76.69, nameSize: NAME_SIZE,    nameLineH: 50 };  // 2-line 48pt
const NT_XL = { nameY:  73.0,  nameSize: NAME_SIZE_XL, nameLineH: 33 };  // 2-line 27pt

// With-title layouts — nameLines × titleLines
// WT_11 / WT_12: positions from "Default Name w Job Title" and "Long Name w Job Title" templates
const WT_11 = { nameY: 82.3,  nameSize: NAME_SIZE,    nameLineH: 0,  titleY: 122.16, titleSize: TITLE_SIZE,    titleLineH: TITLE_LINE_H    };
const WT_12 = { nameY: 70.25, nameSize: NAME_SIZE,    nameLineH: 0,  titleY: 110.12, titleSize: TITLE_SIZE,    titleLineH: TITLE_LINE_H    };
// WT_21 / WT_22: 2-line name (48pt) + title
const WT_21 = { nameY: 63.0,  nameSize: NAME_SIZE,    nameLineH: 47, titleY: 135.0,  titleSize: TITLE_SIZE,    titleLineH: TITLE_LINE_H    };
const WT_22 = { nameY: 53.0,  nameSize: NAME_SIZE,    nameLineH: 44, titleY: 119.0,  titleSize: TITLE_SIZE,    titleLineH: TITLE_LINE_H - 2 };
// WT_X1 / WT_X2: 2-line name (27pt) + title — positions from "Extra Long Name w Job Title" template
const WT_X1 = { nameY: 62.0,  nameSize: NAME_SIZE_XL, nameLineH: 39, titleY: 131.81, titleSize: TITLE_SIZE_XL, titleLineH: TITLE_LINE_H_XL };
const WT_X2 = { nameY: 52.0,  nameSize: NAME_SIZE_XL, nameLineH: 38, titleY: 118.0,  titleSize: TITLE_SIZE_XL, titleLineH: TITLE_LINE_H_XL };

// ─── PDF layout (all in points) ───────────────────────────────────────────────
const PAGE_W   = 612;   // 8.5"
const PAGE_H   = 792;   // 11"
const PER_PAGE = 4;
const ROW_GAP  = 7.2;   // 0.1" between rows
const CUT_LEN  = 10;
const CUT_GAP  = 3;
const IMG_SCALE = 3;    // canvas pixels per SVG user unit

// ─── State ────────────────────────────────────────────────────────────────────
let tags         = [{ name: '', title: '' }];
let fontDataURI  = null;
let fontLoadPromise = null;
let woodlandHills = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await document.fonts.ready;

  renderTable();
  renderPreview();

  fontLoadPromise = loadFontBinary();

  document.getElementById('add-row')     .addEventListener('click', addRow);
  document.getElementById('generate-pdf').addEventListener('click', generatePDF);
  document.getElementById('toggle-bulk') .addEventListener('click', toggleBulk);
  document.getElementById('cancel-bulk') .addEventListener('click', toggleBulk);
  document.getElementById('import-bulk') .addEventListener('click', importBulk);
  document.getElementById('wh-toggle')   .addEventListener('click', toggleWoodlandHills);
});

// ─── Font loading ──────────────────────────────────────────────────────────────
async function loadFontBinary() {
  const statusEl = document.getElementById('font-status');
  try {
    const res = await fetch('./FMReview-Regular.otf');
    if (!res.ok) throw new Error('not found');
    const buf = await res.arrayBuffer();
    fontDataURI = 'data:font/otf;base64,' + toBase64(buf);
    statusEl.textContent = 'Font ready';
    statusEl.classList.add('ready');
  } catch (_) {
    statusEl.textContent = 'Font unavailable — open via http:// for full PDF fidelity';
    statusEl.classList.add('error');
  }
  document.getElementById('generate-pdf').disabled = false;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let out = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

// ─── Woodland Hills toggle ────────────────────────────────────────────────────
function toggleWoodlandHills() {
  woodlandHills = !woodlandHills;
  document.getElementById('wh-toggle').classList.toggle('active', woodlandHills);
  renderPreview();
}

// ─── Dimension helpers ────────────────────────────────────────────────────────
function getSvgW() { return woodlandHills ? SVG_W_WH : SVG_W_STD; }
function getMaxW() { return getSvgW() - LEFT_X - RIGHT_MARGIN; }

// ─── Text measurement ─────────────────────────────────────────────────────────
function measureW(text, size) {
  const el = document.getElementById('measure-text');
  el.setAttribute('font-size', size);
  el.textContent = text;
  return el.getComputedTextLength();
}

// ─── Name splitting ───────────────────────────────────────────────────────────
// Character-count thresholds derived from FM template examples:
//   "Sofia LoBiondo"          = 14 chars → Default (single line, 48pt)
//   "Shannon Roberson"         = 16 chars → Long Name (2-line, 48pt)
//   "Jessica McLoughlin Clayton"= 26 chars → Extra Long (2-line, 27pt)
const NAME_CHAR_LONG = 15;   // > 15 chars → 2-line name
const NAME_CHAR_XL   = 25;   // > 25 chars → 27pt name

// Returns { lines: string[], size: number }
function getNameInfo(name) {
  const n = name.trim();
  if (!n) return { lines: [''], size: NAME_SIZE };

  if (n.length <= NAME_CHAR_LONG) return { lines: [n], size: NAME_SIZE };

  const split = splitNameAtMidpoint(n);
  if (n.length <= NAME_CHAR_XL) return { lines: split, size: NAME_SIZE };

  return { lines: split, size: NAME_SIZE_XL };
}

// Splits a name at the word boundary whose character lengths are most balanced.
function splitNameAtMidpoint(name) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return [name.trim()];

  let bestBreak = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ').length;
    const l2 = words.slice(i).join(' ').length;
    const diff = Math.abs(l1 - l2);
    if (diff < bestDiff) { bestDiff = diff; bestBreak = i; }
  }
  return [words.slice(0, bestBreak).join(' '), words.slice(bestBreak).join(' ')];
}

// ─── Title line resolution ────────────────────────────────────────────────────
function greedyWrap(text, mw) {
  const words = text.trim().split(/\s+/);
  let line1 = '', breakAt = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line1 ? line1 + ' ' + words[i] : words[i];
    if (measureW(test, TITLE_SIZE) <= mw) { line1 = test; breakAt = i + 1; }
    else break;
  }
  if (!line1 && words.length) { line1 = words[0]; breakAt = 1; }
  const line2 = words.slice(breakAt).join(' ');
  return line2 ? [line1, line2] : [line1];
}

function balancedWrap(text, mw) {
  const words = text.trim().split(/\s+/);
  if (words.length === 1) return [text.trim()];

  let bestBreak = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    const w1 = measureW(l1, TITLE_SIZE);
    if (w1 > mw) break;
    const w2 = measureW(l2, TITLE_SIZE);
    if (w2 > mw) continue;
    const diff = Math.abs(w1 - w2);
    if (diff < bestDiff) { bestDiff = diff; bestBreak = i; }
  }

  const line1 = words.slice(0, bestBreak).join(' ');
  const line2 = words.slice(bestBreak).join(' ');
  return line2 ? [line1, line2] : [line1];
}

function getTitleLines(title) {
  if (!title.trim()) return [];
  const mw = getMaxW();

  if (title.includes('\n')) {
    const lines = [];
    for (const seg of title.split('\n').map(s => s.trim()).filter(Boolean)) {
      lines.push(...(measureW(seg, TITLE_SIZE) > mw ? greedyWrap(seg, mw) : [seg]));
      if (lines.length >= 2) break;
    }
    return lines;
  }

  const t = title.trim();
  if (measureW(t, TITLE_SIZE) <= mw) return [t];
  return balancedWrap(t, mw);
}

// ─── Layout selection ─────────────────────────────────────────────────────────
function pickLayout(nameInfo, titleLines) {
  const nameLg   = nameInfo.lines.length > 1;
  const nameSize = nameInfo.size;
  const hasTitle = titleLines.length > 0;
  const titleLg  = titleLines.length > 1;

  if (!hasTitle) {
    if (nameSize === NAME_SIZE_XL) return NT_XL;
    if (nameLg) return NT_L;
    return NT_S;
  }
  if (nameSize === NAME_SIZE_XL || nameLg) return titleLg ? WT_X2 : WT_X1;
  return titleLg ? WT_12 : WT_11;
}

function layoutLabel(nameInfo, titleLines) {
  const nameLg   = nameInfo.lines.length > 1;
  const nameSize = nameInfo.size;
  const hasTitle = titleLines.length > 0;
  const titleLg  = titleLines.length > 1;

  if (!hasTitle) {
    if (nameSize === NAME_SIZE_XL) return 'Long name (27pt) · no title';
    if (nameLg) return 'Long name (48pt) · no title';
    return 'Default · no title';
  }
  if (nameSize === NAME_SIZE_XL || nameLg) return titleLg ? 'Long name (27pt) · 2-line title' : 'Long name (27pt) · title';
  return titleLg ? '2-line title' : 'Default · title';
}

// ─── SVG generation ───────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSVG(name, title, embedFont = false) {
  const w          = getSvgW();
  const titleLines = getTitleLines(title);
  const nameInfo   = getNameInfo(name);
  const L          = pickLayout(nameInfo, titleLines);

  const fontDefs = (embedFont && fontDataURI)
    ? `<defs><style>@font-face{font-family:'FMReview-Regular';src:url('${fontDataURI}')format('opentype');font-weight:normal;font-style:normal;}</style></defs>`
    : '';

  const nameTspans = nameInfo.lines.length > 1
    ? nameInfo.lines.map((ln, i) => `<tspan x="0" y="${i === 0 ? 0 : L.nameLineH}">${esc(ln)}</tspan>`).join('')
    : `<tspan x="0" y="0">${esc(name.trim())}</tspan>`;

  const nameEl = `<text transform="translate(${LEFT_X} ${L.nameY})" fill="${FILL_TEXT}" font-family="${FONT_FAM}" font-size="${L.nameSize}">${nameTspans}</text>`;

  const titleEl = titleLines.length
    ? `<text transform="translate(${LEFT_X} ${L.titleY})" fill="${FILL_TEXT}" font-family="${FONT_FAM}" font-size="${L.titleSize}">` +
        titleLines.map((ln, i) => `<tspan x="0" y="${i === 0 ? 0 : L.titleLineH}">${esc(ln)}</tspan>`).join('') +
      `</text>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${SVG_H}" viewBox="0 0 ${w} ${SVG_H}">` +
      fontDefs +
      `<rect width="${w}" height="${SVG_H}" fill="${FILL_BG}"/>` +
      nameEl +
      titleEl +
    `</svg>`
  );
}

// ─── Table rendering ──────────────────────────────────────────────────────────
function escAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function renderTable() {
  const tbody = document.getElementById('tags-body');
  tbody.innerHTML = tags.map((t, i) => `
    <tr data-i="${i}">
      <td>${i + 1}</td>
      <td><input type="text" class="tag-name" value="${escAttr(t.name)}" placeholder="First Last" autocomplete="off"></td>
      <td><textarea class="tag-title" rows="1" placeholder="Job Title (optional)" data-i="${i}"></textarea></td>
      <td><button class="btn btn-remove" data-i="${i}" title="Remove row">✕</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('.tag-title').forEach((el, i) => {
    el.value = tags[i].title;
    autoResize(el);
    el.addEventListener('input', () => {
      tags[i].title = el.value;
      autoResize(el);
      schedulePreview();
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const all = [...document.querySelectorAll('.tag-name, .tag-title')];
        all[all.indexOf(el) + 1]?.focus();
      }
    });
  });

  tbody.querySelectorAll('.tag-name').forEach((el, i) => {
    el.addEventListener('input', () => { tags[i].name = el.value; schedulePreview(); });
    el.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const all = [...document.querySelectorAll('.tag-name, .tag-title')];
        all[all.indexOf(el) + 1]?.focus();
      }
    });
  });

  tbody.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      tags.splice(parseInt(btn.dataset.i, 10), 1);
      if (!tags.length) tags.push({ name: '', title: '' });
      renderTable();
      renderPreview();
    });
  });

  updateCount();
}

function addRow() {
  tags.push({ name: '', title: '' });
  renderTable();
  document.querySelectorAll('.tag-name')[tags.length - 1]?.focus();
}

function updateCount() {
  const n = tags.filter(t => t.name.trim()).length;
  document.getElementById('tag-count').textContent = n ? `${n} tag${n !== 1 ? 's' : ''}` : '';
}

// ─── Preview ──────────────────────────────────────────────────────────────────
let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 80);
}

function renderPreview() {
  const container = document.getElementById('preview-container');
  const valid = tags.filter(t => t.name.trim());

  if (!valid.length) {
    container.innerHTML = '<div class="empty-state"><p>Add names to see a preview</p></div>';
    return;
  }

  container.innerHTML = valid.map(t => {
    const name  = t.name.trim();
    const title = t.title.trim();
    const titleLines = getTitleLines(title);
    const nameInfo   = getNameInfo(name);
    const badge = layoutLabel(nameInfo, titleLines);
    return `<div class="preview-tag">${buildSVG(name, title)}<div class="preview-badge">${badge}</div></div>`;
  }).join('');

  updateCount();
}

// ─── Bulk import ──────────────────────────────────────────────────────────────
function toggleBulk() {
  const el = document.getElementById('bulk-area');
  el.hidden = !el.hidden;
}

function importBulk() {
  const raw = document.getElementById('bulk-input').value;
  const newTags = raw.split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(line => {
      const tab = line.indexOf('\t');
      const idx = tab !== -1 ? tab : line.indexOf(',');
      if (idx === -1) return { name: line, title: '' };
      return { name: line.slice(0, idx).trim(), title: line.slice(idx + 1).trim() };
    })
    .filter(t => t.name || t.title);

  if (!newTags.length) return;

  tags = [...tags.filter(t => t.name.trim() || t.title.trim()), ...newTags];
  document.getElementById('bulk-input').value = '';
  document.getElementById('bulk-area').hidden = true;
  renderTable();
  renderPreview();
}

// ─── PDF generation ───────────────────────────────────────────────────────────
async function generatePDF() {
  const valid = tags.filter(t => t.name.trim());
  if (!valid.length) { alert('Add at least one name before generating a PDF.'); return; }

  const btn = document.getElementById('generate-pdf');
  btn.disabled = true;
  btn.textContent = 'Rendering…';

  try {
    await fontLoadPromise;

    const { jsPDF } = window.jspdf;
    const W   = getSvgW();
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });

    const marginX = (PAGE_W - W) / 2;
    const groupH  = PER_PAGE * SVG_H + (PER_PAGE - 1) * ROW_GAP;
    const marginY = (PAGE_H - groupH) / 2;

    const images = [];
    for (let i = 0; i < valid.length; i++) {
      btn.textContent = `Rendering ${i + 1} / ${valid.length}…`;
      const { name, title } = valid[i];
      images.push(await svgToImage(buildSVG(name, title, true), W));
    }

    const totalPages = Math.ceil(images.length / PER_PAGE);
    for (let p = 0; p < totalPages; p++) {
      if (p > 0) doc.addPage();
      const pageImgs = images.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
      for (let s = 0; s < pageImgs.length; s++) {
        doc.addImage(pageImgs[s], 'PNG', marginX, marginY + s * (SVG_H + ROW_GAP), W, SVG_H);
      }
      drawPageCutMarks(doc, marginX, marginY, W, SVG_H, ROW_GAP, pageImgs.length);
    }

    doc.save('FM-Name-Tags.pdf');
  } catch (err) {
    console.error('PDF error:', err);
    alert('PDF generation failed:\n' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '↓ Download PDF';
  }
}

function drawPageCutMarks(doc, x, firstY, w, h, rowGap, count) {
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  const L = CUT_LEN, G = CUT_GAP;
  const x2 = x + w;

  for (let i = 0; i <= count; i++) {
    let cy;
    if (i === 0)          cy = firstY;
    else if (i === count) cy = firstY + (count - 1) * (h + rowGap) + h;
    else                  cy = firstY + (i - 1) * (h + rowGap) + h + rowGap * 0.5;

    doc.line(x  - G - L, cy, x  - G, cy);
    doc.line(x2 + G, cy, x2 + G + L, cy);

    if (i === 0) {
      doc.line(x,  cy - G - L, x,  cy - G);
      doc.line(x2, cy - G - L, x2, cy - G);
    } else if (i === count) {
      doc.line(x,  cy + G, x,  cy + G + L);
      doc.line(x2, cy + G, x2, cy + G + L);
    }
  }
}

function svgToImage(svgStr, w) {
  return new Promise((resolve, reject) => {
    const canvas  = document.createElement('canvas');
    canvas.width  = Math.round(w * IMG_SCALE);
    canvas.height = Math.round(SVG_H * IMG_SCALE);
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      ctx.scale(IMG_SCALE, IMG_SCALE);
      ctx.drawImage(img, 0, 0, w, SVG_H);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')); };
    img.src = url;
  });
}
