import geo from './data/geo.json';
import demo from './data/demo.json';
import { prepPolys, prepLines, prepPts } from './map.js';
import { TODAY } from './util.js';

export const G = geo, DEMO = demo;
export const munName = {}; geo.municipios.features.forEach(f => munName[f.properties.id] = f.properties.name);
export const munByName = {}; geo.municipios.features.forEach(f => munByName[f.properties.name] = f.properties);
export const S = {
  portal: 'ciudadano', view: 'inicio', sel: null, selAlert: null, selStudy: null,
  predios: demo.predios, alertas: demo.alertas, estudios: demo.estudios, proyectos: demo.proyectos, ledger: demo.ledger.map(e => ({ ...e })),
  userLayers: [], ingestLog: [], datasets: [], uploads: [],
  actions: [], // acciones administrativas del usuario en esta sesión
};
export const P = {}; // geometría preparada
P.mun = prepPolys(geo.municipios); P.state = prepPolys({ features: [geo.state] }); P.rivers = prepLines(geo.rivers); P.lakes = prepPolys(geo.lakes);
P.predios = prepPolys(demo.predios); P.alertas = prepPts(demo.alertas); P.estudios = prepPts(demo.estudios); P.proyectos = prepPts(demo.proyectos);
P.places = prepPts(geo.places.features.map(f => ({ name: f.properties.name, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })));
export const prediosById = {}; demo.predios.features.forEach(f => prediosById[f.properties.id] = f);
export const alertaById = {}; demo.alertas.forEach(a => alertaById[a.id] = a);
export const estudioById = {}; demo.estudios.forEach(a => estudioById[a.id] = a);

// Estadísticas
export function stats() {
  const pr = demo.predios.features.map(f => f.properties); const by = c => pr.filter(p => p.cls === c);
  const cnt = {}, ha = {}; ['verde', 'amarillo', 'naranja', 'rojo', 'gris'].forEach(c => { cnt[c] = by(c).length; ha[c] = by(c).reduce((a, p) => a + p.ha, 0); });
  const tot = pr.length, totHa = pr.reduce((a, p) => a + p.ha, 0);
  const affHa = pr.filter(p => p.cls === 'naranja' || p.cls === 'rojo').reduce((a, p) => a + (p.aff || 0), 0);
  const days = n => S.alertas.filter(a => (TODAY - new Date(a.d)) / 864e5 <= n);
  const perMun = {};
  pr.forEach(p => { const m = perMun[p.mun] ||= { id: p.mun, n: 0, ha: 0, verde: 0, amarillo: 0, naranja: 0, rojo: 0, gris: 0, aff: 0, alerts: 0 }; m.n++; m.ha += p.ha; m[p.cls]++; m.aff += p.aff || 0; });
  S.alertas.forEach(a => { const m = perMun[a.mun] ||= { id: a.mun, n: 0, ha: 0, verde: 0, amarillo: 0, naranja: 0, rojo: 0, gris: 0, aff: 0, alerts: 0 }; m.alerts++; });
  const resHa = S.proyectos.reduce((a, p) => a + p.ha, 0), plantados = S.proyectos.reduce((a, p) => a + p.plant, 0);
  const validated = (tot - cnt.gris) / tot;
  return { tot, totHa, cnt, ha, affHa, a30: days(30).length, a7: days(7).length, a90: days(90).length, perMun, resHa, plantados, validated, open: S.alertas.filter(a => ['Detectada', 'En validación'].includes(a.st)).length };
}
export let ST = stats(); export const refresh = () => (ST = stats());
export const fmtMun = id => munName[id] || id;
export const monthly = () => { const m = {}; S.alertas.forEach(a => { const k = a.d.slice(0, 7); m[k] = (m[k] || 0) + 1; }); return Object.keys(m).sort().map(k => [k, m[k]]); };
