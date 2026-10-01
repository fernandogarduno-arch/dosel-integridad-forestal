// Proveedores de lenguaje para Arbolín, en orden:
//  1. Claude dentro de claude.ai (capacidad `sample` del artefacto; consumo a cargo de quien lo ve, con su consentimiento).
//  2. Función del servidor /api/arbolin (Vercel) con ANTHROPIC_API_KEY configurada en el proyecto.
//  3. Motor local determinista (siempre disponible; sin conexión ni costo).
let P = null, detecting = null;
const PERM = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired']);
export function proveedor() { return P || { kind: 'local' }; }
export function detectar() {
  if (P) return Promise.resolve(P); if (detecting) return detecting;
  detecting = (async () => {
    try { if (window.claude && typeof window.claude.use === 'function') { const s = await window.claude.use('sample'); if (s) return (P = { kind: 'sample', s }); } } catch (e) { /* sin capacidad */ }
    try { if (/^https?:$/.test(location.protocol) && !/claude\.ai$|claudeusercontent/.test(location.hostname)) { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000); const r = await fetch('/api/arbolin', { signal: ctl.signal, headers: { accept: 'application/json' } }); clearTimeout(tm); if (r.ok) { const j = await r.json(); if (j && j.llm) return (P = { kind: 'api', model: j.model }); } } } catch (e) { /* sin servidor */ }
    return (P = { kind: 'local' });
  })(); return detecting;
}
// turns: [{role, content}] (historial, termina en usuario). ctx: contexto largo. Devuelve el texto completo.
export async function preguntar(ctx, turns, { onText, signal } = {}) {
  const p = await detectar(); if (p.kind === 'local') throw { code: 'local' };
  if (p.kind === 'sample') {
    const input = [{ role: 'user', content: ctx + '\n\n# Inicio de la conversación\nLa interfaz ya saludó y presentó a Arbolín; no vuelvas a presentarte salvo que te lo pidan.' }, { role: 'assistant', content: 'Entendido. Respondo como Arbolín con esos datos y reglas.' }, ...turns];
    try { const r = await p.s(input, { onText, signal, cache: false, modelTier: 'default' }); return r.text; }
    catch (e) { if (e && PERM.has(e.code)) P = { kind: 'local', motivo: e.code }; throw e || { code: 'upstream_error' }; }
  }
  const r = await fetch('/api/arbolin', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contexto: ctx, messages: turns }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.text) { if (r.status === 503) P = { kind: 'local', motivo: 'sin_llave' }; throw { code: r.status === 429 ? 'rate_limited' : 'upstream_error', message: j.error || r.status }; }
  if (onText) onText({ text: j.text, delta: j.text });
  return j.text;
}
