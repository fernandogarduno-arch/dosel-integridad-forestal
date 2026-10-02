// PDF mínimo sin dependencias: texto (Helvetica / Helvetica-Bold, WinAnsi), rectángulos, líneas y QR.
// Suficiente para constancias y paquetes de evidencia imprimibles; la firma es simulada en la demostración.
import qrcode from 'qrcode-generator';

const W = 612, Hh = 792; // carta, puntos
const MAPW = { '€': 128, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '™': 153, '…': 133, '→': 187, '≈': 126, '≥': 62, '≤': 60, '×': 215, '−': 45, '·': 183, '°': 176 };
const esc = s => { let o = ''; for (const ch of String(s)) { let c = ch.charCodeAt(0); if (c > 255) c = MAPW[ch] ?? 63; const x = String.fromCharCode(c); o += x === '(' || x === ')' || x === '\\' ? '\\' + x : x; } return o; };
const col = c => c.map(v => (v / 255).toFixed(3)).join(' ');
export const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function wrap(txt, size, maxW) { const cw = size * .5; const max = Math.max(10, Math.floor(maxW / cw)); const out = []; String(txt).split('\n').forEach(par => { let line = ''; par.split(' ').forEach(w => { if ((line + ' ' + w).trim().length > max) { if (line) out.push(line); line = w; } else line = (line + ' ' + w).trim(); }); out.push(line); }); return out; }
export function qrMatrix(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(); return { n, dark: (r, c) => q.isDark(r, c) }; }
export function qrSVG(text, size = 120, fg = '#0F2A24') { const m = qrMatrix(text); const s = size / (m.n + 8); let d = ''; for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) d += `M${(c + 4) * s} ${(r + 4) * s}h${s}v${s}h-${s}z`; return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Código QR"><rect width="${size}" height="${size}" fill="#FFFFFF"/><path d="${d}" fill="${fg}"/></svg>`; }

// Documento: lista de páginas; cada página es una lista de operaciones
export class Doc {
  constructor() { this.pages = []; this.np(); }
  np() { this.ops = []; this.pages.push(this.ops); this.y = Hh - 56; return this; }
  text(x, y, txt, size = 10, bold = false, c = [27, 42, 38]) { this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${col(c)} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(txt)}) Tj ET`); return this; }
  rect(x, y, w, h, c) { this.ops.push(`${col(c)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); return this; }
  line(x1, y1, x2, y2, c = [188, 149, 92], w = 1) { this.ops.push(`${col(c)} RG ${w} w ${x1} ${y1} m ${x2} ${y2} l S`); return this; }
  qr(x, y, size, text) { const m = qrMatrix(text); const s = size / m.n; this.rect(x - 4, y - 4, size + 8, size + 8, [255, 255, 255]); for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) this.rect(x + c * s, y + size - (r + 1) * s, s + .02, s + .02, [15, 42, 36]); return this; }
  // flujo: párrafo con salto de página
  para(txt, { size = 10, bold = false, x = 56, w = 500, gap = 4, c } = {}) { for (const l of wrap(txt, size, w)) { if (this.y < 60) this.np(); this.text(x, this.y, l, size, bold, c); this.y -= size + gap; } this.y -= 2; return this; }
  kv(k, v, { x = 56, kw = 170, w = 500, size = 9.5 } = {}) { const lines = wrap(v, size, w - kw); if (this.y - lines.length * (size + 3) < 60) this.np(); this.text(x, this.y, k, size, true, [69, 84, 79]); lines.forEach((l, i) => this.text(x + kw, this.y - i * (size + 3), l, size)); this.y -= lines.length * (size + 3) + 4; return this; }
  h(txt) { if (this.y < 100) this.np(); this.y -= 6; this.text(56, this.y, txt, 12.5, true, [35, 91, 78]); this.line(56, this.y - 4, 556, this.y - 4); this.y -= 20; return this; }
  bytes() {
    const objs = []; const add = s => { objs.push(s); return objs.length; };
    const cat = add(''), pagesId = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = this.pages.map((ops, i) => { const foot = `BT /F1 7.5 Tf 0.435 0.486 0.467 rg 56 30 Td (${esc(`Documento de demostración · datos y firma simulados · página ${i + 1} de ${this.pages.length}`)}) Tj ET`; const stream = ops.concat(foot).join('\n'); const c = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`); return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${Hh}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`); });
    objs[cat - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`; objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = []; objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255; return u;
  }
}
export const VERIFY_BASE = 'https://dosel-integridad-forestal.vercel.app/#/verificar/';
