"""Construye src/data/gf.json a partir de la entrega de Guardián Forestal (consulta pública 30-sep-2026).
Simplifica geometrías, agrega las alertas en celdas, rasteriza el bosque detectado y omite identificadores sensibles
(número de expediente PROFEPA, expediente y NUC de denuncias ante la Fiscalía)."""
import sqlite3, json, csv, math, base64, io, collections, unicodedata, hashlib
from shapely import wkb
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from PIL import Image, ImageDraw

GF = '/home/claude/gf/guardianforestal'
OUT = '/home/claude/platform/src/data/gf.json'

def geoms(db, table, cols):
    c = sqlite3.connect(db)
    for row in c.execute(f'select geom,{",".join(chr(34)+x+chr(34) for x in cols)} from "{table}"'):
        b = row[0]
        if b is None: continue
        flags = b[3]; env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
        g = wkb.loads(bytes(b[8 + env:]))
        yield g, dict(zip(cols, row[1:]))

def rnd(coords, d=5):
    if isinstance(coords[0], (int, float)): return [round(coords[0], d), round(coords[1], d)]
    return [rnd(c, d) for c in coords]

def poly_feats(g, tol):
    g = g.simplify(tol, preserve_topology=True)
    if g.is_empty: return None
    m = mapping(g)
    if m['type'] == 'Polygon': return {'type': 'Polygon', 'coordinates': rnd(m['coordinates'])}
    if m['type'] == 'MultiPolygon': return {'type': 'MultiPolygon', 'coordinates': rnd(m['coordinates'])}
    return None

O = {'meta': {'fuente': 'Guardián Forestal — consulta pública', 'sitio': 'https://guardianforestal.org/publicConsultation', 'fecha_consulta': '2026-09-30',
              'tesela_muestra': {'z': 8, 'x': 55, 'y': 114, 'bbox': [-102.65625, 17.97873, -101.25, 19.31114]},
              'nota': 'Muestras de teselas de visualización (MVT): geometría simplificada y recortada; no sustituye a la fuente original.'}}

# ---------- Estadísticas municipales (113) y de subcuencas (64): datos completos de la API pública ----------
norm = lambda s: unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower().replace('.', '').strip()
geo = json.load(open('/home/claude/platform/src/data/geo.json'))
ids = {norm(f['properties']['name']): f['properties']['id'] for f in geo['municipios']['features']}
f = lambda v: round(float(v), 1) if v not in (None, '') else 0
mun = {}
for r in csv.DictReader(open(f'{GF}/data/public_api/municipalities_mich_statistics.csv', encoding='utf-8-sig')):
    mun[ids[norm(r['description_native'])]] = {'cve': r['region_id'].split('MX')[-1], 'n': r['description_native'], 'orch': int(f(r['total_orchards'])), 'orchHa': f(r['total_orchards_area']), 'exp': int(f(r['export_orchards'])), 'expHa': f(r['export_orchards_area']), 'forest': f(r['remnant_forest_area']), 'ollas': int(f(r['water_holes'])), 'ollasHa': f(r['water_holes_area']), 'rep': f(r['total_reports_area'])}
O['mun'] = mun
sub = {}
for r in csv.DictReader(open(f'{GF}/data/public_api/subcuencas_mich_statistics.csv', encoding='utf-8-sig')):
    sub[r['cve_subcue']] = {'n': r['subcuenca'], 'orchHa': f(r['total_orchards_area']), 'expHa': f(r['export_orchards_area']), 'forest': f(r['remnant_forest_area']), 'ollas': int(f(r['water_holes']))}
O['subStats'] = sub

OTH = f'{GF}/data/guardianforestal_mvt_other_samples.gpkg'
def fc(feats): return {'type': 'FeatureCollection', 'features': feats}

# subcuencas (geometría de muestra, disuelta por clave)
by = collections.defaultdict(list); nm = {}
for g, p in geoms(OTH, 'subcuencas_mich__subcuencas_mich', ['cve_subcue', 'subcuenca', 'cuenca']): by[p['cve_subcue']].append(g); nm[p['cve_subcue']] = p
O['subcuencas'] = fc([{'type': 'Feature', 'properties': {'id': k, 'name': nm[k]['subcuenca'], 'cuenca': nm[k]['cuenca'], **sub.get(k, {})}, 'geometry': poly_feats(unary_union(v).buffer(0), .002)} for k, v in by.items()])

# ANP (disueltas por nombre)
by = collections.defaultdict(list); nm = {}
for g, p in geoms(OTH, 'anp_tiles_mich__anp_tiles_mich', ['type', 'name', 'category']): by[p['name'].rstrip('0123456789')].append(g.buffer(0)); nm[p['name'].rstrip('0123456789')] = p
O['anp'] = fc([{'type': 'Feature', 'properties': {'id': 'ANP-' + str(i + 1), 'name': k, 'tipo': nm[k]['type'], 'cat': nm[k]['category'].replace('  ', ' ')}, 'geometry': poly_feats(unary_union(v), .0008)} for i, (k, v) in enumerate(by.items())])

# Núcleos agrarios (RAN)
by = collections.defaultdict(list); nm = {}
for g, p in geoms(OTH, 'ran_nacional__ran_nacional', ['clave_unica', 'nombre', 'tipo', 'programa']): by[p['clave_unica']].append(g.buffer(0)); nm[p['clave_unica']] = p
O['ran'] = fc([{'type': 'Feature', 'properties': {'id': k, 'name': nm[k]['nombre'], 'tipo': nm[k]['tipo'], 'prog': nm[k]['programa']}, 'geometry': poly_feats(unary_union(v), .0015)} for k, v in by.items()])

# Eventos de deforestación 2026 (alertas anuales)
ev = []
for i, (g, p) in enumerate(geoms(OTH, 'mich_events_2026__mich_events_2026', ['area', 'origin_type'])):
    gg = poly_feats(g.buffer(0), .00015)
    if gg: ev.append({'type': 'Feature', 'properties': {'id': f'GF-EV26-{i + 1:04d}', 'ha': round(float(p['area'] or 0), 2), 'tipo': p['origin_type']}, 'geometry': gg})
O['ev2026'] = fc(ev)

# Incendios CONAFOR 2012-2024
fi = []
for i, (g, p) in enumerate(geoms(OTH, 'fires_2012_2024__fires_2012_2024', ['origin', 'event_class', 'impact', 'start_date', 'end_date'])):
    gg = poly_feats(g.buffer(0), .0006)
    if gg: fi.append({'type': 'Feature', 'properties': {'id': f'GF-INC-{i + 1:04d}', 'causa': p['origin'], 'tipo': p['event_class'], 'impacto': (p['impact'] or '').capitalize(), 'ini': (p['start_date'] or '')[:10], 'fin': (p['end_date'] or '')[:10]}, 'geometry': gg})
O['fires'] = fc(fi)

# Envolventes de cambio por origen (puntos)
O['hulls'] = [[round(g.centroid.x, 5), round(g.centroid.y, 5), p['origin_types'] or '—', round(float(p['area'] or 0), 1)] for g, p in geoms(OTH, 'convex_hulls_new__convex_hulls_new', ['origin_types', 'area'])]
# Ollas / reservorios detectados (centroides, sin duplicados)
seen = set(); ol = []
for g, p in geoms(OTH, 'ollas_estado__ollas_estado', ['mvt_id']):
    c = g.centroid; k = (round(c.x, 4), round(c.y, 4))
    if k in seen: continue
    seen.add(k); ol.append([round(c.x, 5), round(c.y, 5)])
O['ollas'] = ol
# Denuncias canalizadas (sin expediente ni NUC)
O['denuncias'] = [[round(g.centroid.x, 4), round(g.centroid.y, 4), round(float(p['area'] or 0), 1), p['authorities']] for g, p in geoms(OTH, 'complaints__complaints', ['area', 'authorities'])]
# Puntos de calor sept-2026
O['calor'] = [[round(g.x, 4), round(g.y, 4), p['fecha'], p['satelite'], p['frp']] for g, p in geoms(OTH, 'heat_points_range__fires_alerts', ['fecha', 'satelite', 'frp'])]

# ---------- Alertas Guardián (248,096 fragmentos) → celdas de 0.01° ----------
AL = f'{GF}/data/guardianforestal_mvt_guardian_alerts.gpkg'
cells = {}
c = sqlite3.connect(AL)
for b, yr, cf in c.execute('select geom,year,confianza from alerts_guardian__alerts_guardian'):
    flags = b[3]; env = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    if env: minx, maxx, miny, maxy = __import__('struct').unpack('<4d', b[8:40]); x, y = (minx + maxx) / 2, (miny + maxy) / 2
    else: g = wkb.loads(bytes(b[8:])); x, y = g.centroid.x, g.centroid.y
    k = (int(math.floor(x / .01)), int(math.floor(y / .01)))
    e = cells.setdefault(k, [0] * 8)
    yi = int(yr) - 2018
    if 0 <= yi < 7: e[yi] += 1
    if cf in ('high', 'highest'): e[7] += 1
O['alertCells'] = {'size': .01, 'years': list(range(2018, 2025)), 'cells': [[k[0], k[1], *v] for k, v in cells.items()]}

# ---------- Bosque detectado 2023 → imagen (Web Mercator) ----------
bb = O['meta']['tesela_muestra']['bbox']; W = H = 1400
mx = lambda lon: (lon + 180) / 360; my = lambda lat: (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2
X0, X1, Y0, Y1 = mx(bb[0]), mx(bb[2]), my(bb[3]), my(bb[1])
img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
def px(lon, lat): return ((mx(lon) - X0) / (X1 - X0) * W, (my(lat) - Y0) / (Y1 - Y0) * H)
nf = 0
for g, p in geoms(OTH, 'forest_inventory_mich__forest_inventory_mich', ['class']):
    for poly in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
        if poly.geom_type != 'Polygon': continue
        dr.polygon([px(*xy) for xy in poly.exterior.coords], fill=255)
        for h in poly.interiors: dr.polygon([px(*xy) for xy in h.coords], fill=0)
        nf += 1
rgba = Image.new('RGBA', (W, H), (0, 0, 0, 0)); rgba.putalpha(img); green = Image.new('RGBA', (W, H), (22, 163, 74, 255)); green.putalpha(img)
buf = io.BytesIO(); green.save(buf, 'PNG', optimize=True)
O['bosque'] = {'bbox': bb, 'png': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), 'n': nf, 'ha_px': None}

# ---------- Fuentes estáticas completas ----------
ST = f'{GF}/data/guardianforestal_static_full_sources.gpkg'
O['profepa'] = [[round(g.x, 5), round(g.y, 5), (p['TIPO'] or '').strip(), (p['OBRAS O ACTIVIDAD'] or '').strip()] for g, p in geoms(ST, 'puntos_profepa', ['TIPO', 'OBRAS O ACTIVIDAD'])]
O['estaciones'] = [[round(g.x, 5), round(g.y, 5), p['station_name'], p['elevation'], p['active']] for g, p in geoms(ST, 'puntos_estaciones', ['station_name', 'elevation', 'active'])]
cu = list(geoms(ST, 'cuenca', ['TOPONIMO', 'AREA_M']))
O['cuenca'] = fc([{'type': 'Feature', 'properties': {'name': p['TOPONIMO'], 'km2': round(float(p['AREA_M'] or 0) / 1e6, 1)}, 'geometry': poly_feats(shape(mapping(g)).buffer(0), .0005)} for g, p in cu])

# ---------- Catálogo de imágenes históricas WMTS (Michoacán) ----------
SV = {'mapcache': 'Color verdadero', 'falsecolor': 'Falso color', 'ndvi': 'NDVI', 'ndwi': 'NDWI', 'scl': 'Calidad (SCL)'}
wm = []
for e in json.load(open(f'{GF}/catalog/wmts_layer_estimates.json')):
    b = e['bbox']
    if b[2] < -103.8 or b[0] > -100 or b[3] < 17.9 or b[1] > 20.4: continue
    import re
    m1 = re.match(r'^(\d{8})', e['id']); m2 = re.match(r'^(\d{4})_(\d{2})_\d{4}_\d{2}', e['id'])
    d = m1.group(1) if m1 else (m2.group(1) + m2.group(2) + '01') if m2 else None
    if not d: continue
    wm.append([list(SV).index(e['service']) if e['service'] in SV else -1, d, [round(v, 2) for v in b]])
O['wmts'] = {'services': list(SV.values()), 'entries': wm}

# ---------- Catálogo de capas ----------
L = json.load(open(f'{GF}/catalog/live_project_layers.json'))
O['catalogo'] = [{'sec': l['section'], 'name': l['name'].strip(), 'type': l['type']} for l in L if l['state_name'] in ('Michoacán', 'Imágenes satelitales WMTS')]
O['conteos'] = {'capas': len(L), 'wmts': len(json.load(open(f'{GF}/catalog/wmts_layer_estimates.json'))), 'estados': 6, 'servicios_vector': 194, 'servicios_ok': 167}

# ---------- Muestras ráster ----------
rs = []
for m in json.load(open(f'{GF}/data/raster_samples/manifest.json')):
    im = Image.open(f"{GF}/{m['original'].replace('.tif', '.png') if m['original'].endswith('.tif') else m['original']}").convert('RGB')
    bf = io.BytesIO(); im.save(bf, 'JPEG', quality=72)
    z, x, y = m['z'], m['x'], m['y']; n = 2 ** z
    lon0, lon1 = x / n * 360 - 180, (x + 1) / n * 360 - 180
    lat = lambda yy: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))
    rs.append({'svc': m['service'], 'layer': m['layer'], 'fecha': m['layer'][:8], 'bbox': [round(lon0, 4), round(lat(y + 1), 4), round(lon1, 4), round(lat(y), 4)], 'img': 'data:image/jpeg;base64,' + base64.b64encode(bf.getvalue()).decode()})
O['raster'] = rs

s = json.dumps(O, ensure_ascii=False, separators=(',', ':'))
open(OUT, 'w').write(s)
print('gf.json', round(len(s) / 1024), 'KB', {k: (len(v['features']) if isinstance(v, dict) and 'features' in v else len(v) if isinstance(v, (list, dict)) else '') for k, v in O.items()}, 'cells', len(cells), 'bosque polys', nf)
