// Motor del Semáforo Forestal v0.3-demo — reglas conforme al diseño del Programa (documento v0.1, cap. 8)
export const VARS = [
  { k: 'V1', name: 'Uso actual y consolidación', max: 20, hint: '0 = huerta consolidada con infraestructura · 20 = claro sin uso o con vegetación en recuperación' },
  { k: 'V2', name: 'Modificación física del terreno', max: 15, hint: 'Terrazas, caminos, movimiento de tierra medidos en el MDT LiDAR (0 = intensa · 15 = sin modificación)' },
  { k: 'V3', name: 'Condición del suelo', max: 15, hint: 'Horizonte orgánico, compactación, erosión (0 = suelo removido · 15 = suelo íntegro)' },
  { k: 'V4', name: 'Fuente de regeneración', max: 15, hint: 'Distancia a bosque semillero y densidad de bosque vecino (0 = aislado · 15 = contiguo)' },
  { k: 'V5', name: 'Tiempo y persistencia', max: 10, hint: 'Años desde la perturbación y trayectoria temporal (0 = conversión persistente · 10 = reciente)' },
  { k: 'V6', name: 'Fuego', max: 10, hint: 'Severidad y recurrencia (0 = severo/recurrente · 10 = sin fuego)' },
  { k: 'V7', name: 'Regeneración observada', max: 10, hint: 'Rebrote y plántulas medidos por LiDAR/campo (0 = nula · 10 = abundante)' },
  { k: 'V8', name: 'Integridad y valor del ecosistema', max: 5, hint: 'Tipo de bosque de recuperación lenta, ANP, conectividad (0 = alto valor y lento · 5 = bajo)' },
];
export const CAUSALES = ['Infraestructura permanente / reservorio (olla)', 'Remoción del horizonte del suelo', 'Pérdida de bosque maduro de recuperación lenta', 'Nueva pérdida en área en restauración'];
export const VERSION = 'SF-v0.3-demo';
export function evaluate(i) {
  const route = [];
  if (!i.poligono) { route.push('Sin polígono validado → información insuficiente'); return { cls: 'gris', route, efectos: 'Ninguno. Se solicita validar el polígono o completar información.', nivel: null }; }
  route.push('Polígono validado');
  if (!i.perdida) { route.push('Sin ruptura detectada posterior a la fecha de referencia (1-ene-2018) — resultado no concluyente en huertas < 1 ha si la exactitud de detección es < 90 %'); return { cls: 'verde', route, efectos: 'Constancia elegible. Vigilancia continua.', nivel: null }; }
  route.push('Pérdida de cobertura detectada');
  if (!i.validada) { route.push('Validación humana pendiente → indicio (sin efectos jurídicos)'); return { cls: 'amarillo', route, efectos: 'Sin efectos hasta validar (máx. 10 días hábiles). No se publica.', nivel: null }; }
  route.push('Validación humana con imagen de alta resolución: confirmada');
  const idx = i.v.reduce((a, b) => a + b, 0);
  if (i.causales.length) { route.push('Causal determinante: ' + i.causales.join('; ')); return { cls: 'rojo', route, idx, efectos: 'Daño irreversible: vista a autoridad competente, compensación y restricción de constancia; sin retorno a verde.', nivel: null }; }
  route.push('Índice de Reversibilidad = ' + idx + ' / 100');
  if (idx < 50) { route.push('Índice < 50 → irreversible o de recuperación incierta'); return { cls: 'rojo', route, idx, efectos: 'Daño irreversible: compensación y vista a autoridad competente.', nivel: null }; }
  if (idx < 75) { route.push('50 ≤ índice < 75 → reversible con restauración asistida (N2)'); return { cls: 'naranja', route, idx, nivel: 'N2', efectos: 'Restauración asistida con proyecto aprobado y verificación con LiDAR; constancia condicionada. No retorna a verde.' }; }
  route.push('Índice ≥ 75 → reversible con regeneración natural (N1)'); return { cls: 'naranja', route, idx, nivel: 'N1', efectos: 'Regeneración natural protegida (exclusión de uso) con verificación; constancia condicionada. No retorna a verde.' };
}
