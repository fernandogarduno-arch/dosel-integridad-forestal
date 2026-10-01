// Arbolín: ícono original (árbol amable con brote dorado), sólo con la paleta institucional.
export function arbolinSvg(size = 40, { bg = true, cls = '' } = {}) {
  return `<svg class="arb-svg ${cls}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
${bg ? '<circle cx="32" cy="32" r="31" fill="#F2F4F0" stroke="#BC955C" stroke-width="2"/>' : ''}
<path d="M28.6 42h6.8l.9 13.2c.1 1.6-1.7 2.8-4.3 2.8s-4.4-1.2-4.3-2.8z" fill="#8A6A35"/>
<path d="M35.2 50.5l5.6-3.6" stroke="#8A6A35" stroke-width="2.6" stroke-linecap="round"/>
<g fill="#235B4E"><circle cx="20.5" cy="31" r="11"/><circle cx="43.5" cy="31" r="11"/><circle cx="32" cy="21.5" r="13.5"/><ellipse cx="32" cy="35.5" rx="18" ry="10.5"/></g>
<g fill="#2E7D32"><circle cx="25.5" cy="16.5" r="4.6"/><circle cx="14.6" cy="27.2" r="3.4"/></g>
<path d="M32 9.2c-.2-2.8-1.3-4.6-3.2-5.6" stroke="#8A6A35" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M32.4 8.6c.6-4.2 3.8-6.4 8.4-6.2-.6 4.3-3.9 6.6-8.4 6.2z" fill="#BC955C"/>
<g class="arb-eyes"><ellipse cx="25.6" cy="28.4" rx="3.6" ry="4.2" fill="#F2F4F0"/><ellipse cx="38.4" cy="28.4" rx="3.6" ry="4.2" fill="#F2F4F0"/><circle cx="26.3" cy="29.3" r="2" fill="#0F2A24"/><circle cx="39.1" cy="29.3" r="2" fill="#0F2A24"/><circle cx="27" cy="28.4" r=".7" fill="#F2F4F0"/><circle cx="39.8" cy="28.4" r=".7" fill="#F2F4F0"/></g>
<circle cx="20.8" cy="34.6" r="2.6" fill="#9F2241" opacity=".35"/><circle cx="43.2" cy="34.6" r="2.6" fill="#9F2241" opacity=".35"/>
<path d="M27.4 35.6c2.7 2.9 6.5 2.9 9.2 0" stroke="#0F2A24" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>`;
}
