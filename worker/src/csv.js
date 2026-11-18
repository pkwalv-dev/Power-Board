// CSV / TSV reading and writing for roster pastes and Google Sheets exports.

// Parses CSV (or TSV, when the first line has a tab) into rows of strings.
// Handles a byte-order mark, quoted fields with commas, quotes ("") and line breaks, and CRLF line ends.
export function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r|\n|$/));
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], field = '', quoted = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === sep) { row.push(field); field = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Column lookup by header name (trimmed, case-insensitive). Returns get(row, name) -> string ('' if absent).
export function columns(header) {
  const at = new Map();
  header.forEach((h, i) => { const k = String(h).trim().toLowerCase(); if (!at.has(k)) at.set(k, i); });
  const has = name => at.has(name.toLowerCase());
  const get = (row, name) => { const i = at.get(name.toLowerCase()); return i === undefined ? '' : (row[i] ?? ''); };
  return { has, get };
}

export const isBlankRow = row => row.every(c => String(c).trim() === '');

// One CSV line per row, quoting only when needed; CRLF line ends like a Sheets download.
export function toCsv(rows) {
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
