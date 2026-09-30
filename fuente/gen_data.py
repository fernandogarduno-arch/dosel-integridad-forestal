#!/usr/bin/env python3
"""Genera datos para DOSEL: geografía REAL (geoBoundaries, Natural Earth) + datos de DEMOSTRACIÓN a nivel predio."""
import json, math, random, hashlib, datetime as dt
from shapely.geometry import shape, mapping, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely import affinity

random.seed(20260930)
D = '/home/claude/platform/data/'
OUT = '/home/claude/platform/src/data/'
import os; os.makedirs(OUT, exist_ok=True)

# ---------- GEOGRAFÍA REAL ----------
a1 = json.load(open(D + 'adm1.geojson'))
mich = [shape(f['geometry']) for f in a1['features'] if f['properties']['shapeName'].startswith('Michoac')][0]
a2 = json.load(open(D + 'adm2.geojson'))
muns = []
for f in a2['features']:
    g = shape(f['geometry'])
    if not g.is_valid: g = g.buffer(0)
    inter = g.intersection(mich).area
    if inter / g.area > 0.6:
        muns.append((f['properties']['shapeName'], g))
print('municipios', len(muns))

FRANJA = {'Uruapan', 'Tancítaro', 'Peribán', 'Salvador Escalante', 'Tacámbaro', 'Ario', 'Los Reyes', 'Tingüindín',
          'Nuevo Parangaricutiro', 'Ziracuaretiro', 'Taretan', 'Turicato', 'Tangancícuaro', 'Cotija', 'Tocumbo',
          'Charapan', 'Paracho', 'Zitácuaro', 'Hidalgo', 'Nahuatzen', 'Cherán', 'Pátzcuaro', 'Tzintzuntzan', 'Erongarícuaro',
          'Tingambato', 'Madero', 'Acuitzio', 'Jungapeo', 'Ocampo', 'Angangueo', 'Maravatío', 'Chilchota', 'Jacona', 'Zamora',
          'Tancítaro', 'Periban', 'Tuxpan', 'Zinapécuaro', 'Tlalpujahua', 'Contepec'}
mun_ids = {}
for n, g in muns:
    mun_ids[n] = 'M%03d' % (len(mun_ids) + 1)

# municipios simplificados
mun_feats = []
for n, g in sorted(muns, key=lambda x: x[0]):
    gs = g.simplify(0.0025, preserve_topology=True)
    c = g.representative_point()
    mun_feats.append({'type': 'Feature', 'properties': {'id': mun_ids[n], 'name': n, 'franja': n in FRANJA,
                      'cx': round(c.x, 4), 'cy': round(c.y, 4), 'km2': round(g.area * 111.32 * 111.32 * math.cos(math.radians(19.4)), 0)},
                      'geometry': mapping(gs)})

def rnd(g, nd=5):
    def r(c):
        if isinstance(c[0], (int, float)): return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    m = mapping(g); m['coordinates'] = r(m['coordinates']); return m
for f in mun_feats:
    f['geometry'] = json.loads(json.dumps(f['geometry']))
    def rr(c):
        if isinstance(c[0], (int, float)): return [round(c[0], 4), round(c[1], 4)]
        return [rr(x) for x in c]
    f['geometry']['coordinates'] = rr(f['geometry']['coordinates'])

state_geo = rnd(mich.simplify(0.004), 4)

# ríos, lagos, lugares (Natural Earth)
def clip_layer(fn, keep_props):
    d = json.load(open(D + fn)); out = []
    for f in d['features']:
        g = shape(f['geometry'])
        if g.intersects(mich):
            gc = g.intersection(mich.buffer(0.05)).simplify(0.002)
            if gc.is_empty: continue
            out.append({'type': 'Feature', 'properties': {k: f['properties'].get(k) for k in keep_props}, 'geometry': rnd(gc, 4)})
    return out
rivers = clip_layer('ne_10m_rivers_lake_centerlines.geojson', ['name'])
lakes = clip_layer('ne_10m_lakes.geojson', ['name'])
# localidades: conjunto de referencia (coordenadas aproximadas de cabeceras; sólo etiquetas)
PLACES = [('Morelia', 19.7060, -101.1950), ('Uruapan', 19.4170, -102.0630), ('Zamora', 19.9830, -102.2830),
          ('Apatzingán', 19.0850, -102.3500), ('Lázaro Cárdenas', 17.9580, -102.1960), ('Zitácuaro', 19.4340, -100.3570),
          ('Pátzcuaro', 19.5150, -101.6090), ('Tacámbaro', 19.2330, -101.4640), ('Los Reyes', 19.5900, -102.4670),
          ('Peribán', 19.5170, -102.4130), ('Tancítaro', 19.3390, -102.3690), ('Ario de Rosales', 19.2000, -101.7060),
          ('Santa Clara del Cobre', 19.4000, -101.6350), ('Paracho', 19.6520, -102.0810), ('La Piedad', 20.3450, -102.0320),
          ('Sahuayo', 20.0570, -102.7250), ('Maravatío', 19.8930, -100.4400), ('Huetamo', 18.6330, -100.9020),
          ('Tingüindín', 19.7670, -102.3320), ('Nuevo San Juan', 19.4180, -102.1330)]
places = [{'type': 'Feature', 'properties': {'name': n}, 'geometry': {'type': 'Point', 'coordinates': [lo, la]}} for n, la, lo in PLACES]
town_pts = [Point(lo, la) for n, la, lo in PLACES]
town_buf = unary_union([p.buffer(0.03) for p in town_pts])
water = unary_union([shape(f['geometry']) for f in lakes]) if lakes else Polygon()

geo = {'state': {'type': 'Feature', 'properties': {'name': 'Michoacán de Ocampo'}, 'geometry': state_geo},
       'municipios': {'type': 'FeatureCollection', 'features': mun_feats},
       'rivers': {'type': 'FeatureCollection', 'features': rivers},
       'lakes': {'type': 'FeatureCollection', 'features': lakes},
       'places': {'type': 'FeatureCollection', 'features': places}}
json.dump(geo, open(OUT + 'geo.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# ---------- PREDIOS (DEMO) ----------
W = {'Uruapan': 110, 'Tancítaro': 90, 'Peribán': 80, 'Salvador Escalante': 80, 'Tacámbaro': 75, 'Ario': 62,
     'Los Reyes': 60, 'Tingüindín': 38, 'Nuevo Parangaricutiro': 32, 'Ziracuaretiro': 32, 'Taretan': 28, 'Turicato': 26,
     'Tangancícuaro': 22, 'Cotija': 16, 'Tocumbo': 26, 'Charapan': 22, 'Paracho': 22, 'Zitácuaro': 36, 'Hidalgo': 22,
     'Nahuatzen': 14, 'Cherán': 10, 'Madero': 14, 'Acuitzio': 10, 'Ocampo': 14, 'Angangueo': 8, 'Maravatío': 14, 'Tuxpan': 10, 'Jungapeo': 10}
RISK = {'Tancítaro': 1.5, 'Peribán': 1.4, 'Salvador Escalante': 1.3, 'Tacámbaro': 1.6, 'Ario': 1.5, 'Uruapan': 1.1,
        'Los Reyes': 0.9, 'Zitácuaro': 1.2, 'Turicato': 1.4, 'Madero': 1.3, 'Ocampo': 1.2}
mun_by_name = {n: g for n, g in muns}
CODE = lambda n: ''.join(ch for ch in n.upper().replace('Á','A').replace('É','E').replace('Í','I').replace('Ó','O').replace('Ú','U') if ch.isalpha())[:3]
lat0 = 19.4; kx = 111320 * math.cos(math.radians(lat0)); ky = 110574

def parcel_poly(cx, cy, ha):
    area = ha * 10000
    n = random.randint(5, 9)
    ar = random.uniform(0.5, 1.0)
    rot = random.uniform(0, 180)
    r = math.sqrt(area / math.pi / ar)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + random.uniform(-0.18, 0.18)
        rr = r * random.uniform(0.85, 1.12)
        pts.append((rr * math.cos(a) * (1 / math.sqrt(ar)), rr * math.sin(a) * math.sqrt(ar)))
    p = Polygon(pts).buffer(0)
    p = affinity.rotate(p, rot, origin=(0, 0))
    # escala a área objetivo
    s = math.sqrt(area / p.area); p = affinity.scale(p, s, s, origin=(0, 0))
    return [(cx + x / kx, cy + y / ky) for x, y in p.exterior.coords]

placed = []; tree_geoms = []
predios = []
cultivo_w = [('Aguacate', .86), ('Berries', .05), ('Durazno', .03), ('Maíz', .03), ('Agave', .01), ('Otro', .02)]
def choice(pairs):
    x = random.random(); acc = 0
    for v, w in pairs:
        acc += w
        if x <= acc: return v
    return pairs[-1][0]
TENENCIA = [('Pequeña propiedad', .68), ('Ejidal', .22), ('Comunal', .10)]
seq = 0
for mname, count in W.items():
    if mname not in mun_by_name:
        continue
    mg = mun_by_name[mname]
    minx, miny, maxx, maxy = mg.bounds
    centers = []
    tries = 0
    while len(centers) < max(3, count // 14) and tries < 500:
        tries += 1
        p = Point(random.uniform(minx, maxx), random.uniform(miny, maxy))
        if mg.buffer(-0.01).contains(p) and not town_buf.contains(p) and not water.contains(p): centers.append(p)
    made = 0; guard = 0
    while made < count and guard < count * 60 and centers:
        guard += 1
        c = random.choice(centers)
        cx = c.x + random.gauss(0, 0.028); cy = c.y + random.gauss(0, 0.024)
        ha = min(140, max(0.6, math.exp(random.gauss(1.35, 0.85))))
        coords = parcel_poly(cx, cy, ha)
        poly = Polygon(coords)
        if not poly.is_valid or not mg.contains(poly) or town_buf.intersects(poly) or water.intersects(poly): continue
        if any(poly.intersects(q) for q in placed[-400:]) or any(poly.intersects(q) for q in placed if q.distance(poly) < 1e-9 and False):
            continue
        # chequeo global rápido
        clash = False
        for q in placed:
            if abs(q.centroid.x - poly.centroid.x) < 0.02 and abs(q.centroid.y - poly.centroid.y) < 0.02 and q.intersects(poly):
                clash = True; break
        if clash: continue
        placed.append(poly)
        seq += 1
        made += 1
        risk = RISK.get(mname, 1.0)
        pr, pn, pa, pg = min(.24, .07 * risk), min(.28, .13 * risk), .11, .17
        x = random.random()
        if x < pr: cls = 'rojo'
        elif x < pr + pn: cls = 'naranja'
        elif x < pr + pn + pa: cls = 'amarillo'
        elif x < pr + pn + pa + pg: cls = 'gris'
        else: cls = 'verde'
        cult = choice(cultivo_w)
        ten = choice(TENENCIA)
        folio = 'PF-%s-%05d' % (CODE(mname), seq)
        prop = {'id': folio, 'mun': mun_ids[mname], 'ha': round(poly.area * kx * ky, 1) if False else round(ha, 1), 'cul': cult, 'ten': ten, 'cls': cls,
                'prd': 'PRD-%04d' % (1 + (seq * 7) % 620)}
        # variables del índice de reversibilidad
        MAXV = [20, 15, 15, 15, 10, 10, 10, 5]
        if cls in ('naranja', 'rojo'):
            loss_year = random.choices(range(2013, 2026), weights=[1, 1, 1, 2, 2, 3, 4, 4, 4, 4, 3, 3, 2])[0]
            aff = round(ha * random.uniform(0.08, 0.75), 1)
            prop['ly'] = loss_year; prop['aff'] = aff
            causal = None
            if cls == 'naranja':
                tgt = random.randint(52, 93)
            else:
                if random.random() < 0.6:
                    causal = random.choice(['Infraestructura permanente / reservorio (olla)', 'Remoción del horizonte del suelo',
                                            'Pérdida de bosque maduro de recuperación lenta', 'Nueva pérdida en área en restauración'])
                    tgt = random.randint(20, 78)
                else:
                    tgt = random.randint(12, 48)
            # reparte tgt en variables
            fr = [random.uniform(.35, 1) for _ in MAXV]
            s = sum(f * m for f, m in zip(fr, MAXV))
            v = [min(m, round(f * m * tgt / s)) for f, m in zip(fr, MAXV)]
            # ajuste hasta suma
            diff = tgt - sum(v)
            k = 0
            while diff != 0 and k < 200:
                i = random.randrange(8)
                if diff > 0 and v[i] < MAXV[i]: v[i] += 1; diff -= 1
                elif diff < 0 and v[i] > 0: v[i] -= 1; diff += 1
                k += 1
            prop['v'] = v; prop['ir'] = sum(v)
            if causal: prop['cau'] = causal
            if cls == 'naranja': prop['niv'] = 'N1' if sum(v) >= 75 else 'N2'
            prop['det'] = random.choice(['Guardián Forestal', 'GLAD-S2', 'RADD', 'DIST-ALERT', 'Sentinel-2 (SECMA)', 'Denuncia ciudadana'])
            prop['est'] = random.choice(['Notificada', 'En audiencia', 'Firme', 'Firme', 'Firme', 'En restauración'])
        elif cls == 'amarillo':
            prop['ly'] = random.choice([2024, 2025, 2026, 2026]); prop['aff'] = round(ha * random.uniform(.03, .3), 1)
            prop['est'] = 'Indicio en validación'
        elif cls == 'gris':
            prop['est'] = random.choice(['Polígono sin validar', 'Cobertura de nubes', 'Información insuficiente', 'Traslape de tenencia'])
        else:
            prop['est'] = 'Sin pérdida posterior a fecha de referencia'
        # constancia
        if cls == 'verde':
            prop['con'] = random.choices(['Vigente', 'Por vencer', 'En trámite'], [.72, .12, .16])[0]
        elif cls in ('rojo',):
            prop['con'] = random.choice(['Suspendida', 'Negada', 'No emitida'])
        elif cls == 'naranja':
            prop['con'] = random.choice(['Condicionada', 'Condicionada', 'En trámite'])
        else:
            prop['con'] = 'No emitida' if cls == 'gris' else 'En trámite'
        prop['geom'] = coords
        predios.append(prop)

print('predios', len(predios))
# LiDAR: asigna estudios a ~46 predios (verdes y naranjas) — se define abajo; marca en predio
cand = [p for p in predios if p['cls'] in ('verde', 'naranja', 'rojo', 'amarillo') and p['ha'] >= 3]
random.shuffle(cand)

# ---------- ALERTAS (DEMO) ----------
today = dt.date(2026, 9, 29)
ALERT_STATES = ['Detectada', 'En validación', 'Confirmada', 'Notificada', 'En audiencia', 'Firme', 'Descartada']
FUENTES = ['GLAD-L', 'GLAD-S2', 'RADD', 'DIST-ALERT', 'Sentinel-2 (SECMA)', 'Guardián Forestal (API)', 'Denuncia ciudadana', 'Dron / LiDAR']
alertas = []
franja_muns = [n for n in W if n in mun_by_name]
for i in range(280):
    days = int(min(420, random.expovariate(1 / 90)))
    d = today - dt.timedelta(days=days)
    if random.random() < 0.68:
        pr = random.choice([p for p in predios if p['cls'] != 'verde'] if random.random() < .75 else predios)
        poly = Polygon(pr['geom']); c = poly.representative_point()
        lon, lat = c.x, c.y; mun = pr['mun']; pid = pr['id']
    else:
        mname = random.choices(franja_muns, [W[n] for n in franja_muns])[0]
        mg = mun_by_name[mname]; minx, miny, maxx, maxy = mg.bounds
        for _ in range(200):
            p = Point(random.uniform(minx, maxx), random.uniform(miny, maxy))
            if mg.contains(p) and not town_buf.contains(p) and not water.contains(p): break
        lon, lat = p.x, p.y; mun = mun_ids[mname]; pid = None
    age = days
    if age < 8: st = random.choices(ALERT_STATES, [.6, .35, .05, 0, 0, 0, 0])[0]
    elif age < 30: st = random.choices(ALERT_STATES, [.15, .4, .2, .1, .0, .0, .15])[0]
    elif age < 120: st = random.choices(ALERT_STATES, [.03, .12, .22, .25, .12, .06, .2])[0]
    else: st = random.choices(ALERT_STATES, [.0, .04, .12, .2, .2, .28, .16])[0]
    alertas.append({'id': 'AL-%s-%04d' % (d.strftime('%y%m'), i + 1), 'd': d.isoformat(), 'lon': round(lon, 5), 'lat': round(lat, 5),
                    'mun': mun, 'pid': pid, 'src': random.choice(FUENTES), 'conf': random.choices(['baja', 'alta', 'máxima'], [.25, .5, .25])[0],
                    'ha': round(max(0.1, random.lognormvariate(-0.3, 0.9)), 2), 'st': st,
                    'dias': (days if st in ('Detectada', 'En validación') else random.randint(2, 21))})
alertas.sort(key=lambda a: a['d'], reverse=True)

# ---------- ESTUDIOS LiDAR / DRON (DEMO) ----------
EQUIPOS = [
    ('DJI', 'Matrice 350 RTK', 'Zenmuse L2', 'ALS-UAV', 'DJI-L2', 240),
    ('DJI', 'Matrice 300 RTK', 'Zenmuse L1', 'ALS-UAV', 'DJI-L1', 160),
    ('Freefly', 'Alta X', 'Ouster OS1-128 + INS', 'ALS-UAV', 'OUS', 190),
    ('DJI', 'Matrice 350 RTK', 'YellowScan Voyager', 'ALS-UAV', 'YS', 320),
]
def sha(s): return hashlib.sha256(s.encode()).hexdigest()
def rand_serial(prefix, n=10): return prefix + ''.join(random.choice('0123456789ABCDEFGHJKLMNPQRSTUVWXYZ') for _ in range(n))
def utc(d, h, m): return dt.datetime(d.year, d.month, d.day, h, m).isoformat() + 'Z'

CHECKS = [
    ('hash', 'Huella SHA-256 de cada archivo coincide con el manifiesto sellado en la recepción'),
    ('cadena', 'Cadena de custodia (bitácora encadenada) íntegra desde la carga'),
    ('firma', 'Firma electrónica del operador y sello de tiempo (NOM-151) válidos'),
    ('autoriz', 'Autorización de vuelo (INEGI) y NOM-107-SCT3 vigentes en la fecha del vuelo'),
    ('equipo', 'Aeronave y sensor registrados en el padrón de equipos; calibración vigente'),
    ('tiempo', 'Coherencia temporal: registro de vuelo, EXIF y tiempo GPS de la nube dentro de la ventana declarada'),
    ('solar', 'Posición solar de las fotografías coherente con fecha, hora y lugar declarados'),
    ('gnss', 'Trayectoria GNSS/INS: solución fija ≥ 95 %, sin saltos, velocidad plausible'),
    ('cobertura', 'La nube cubre ≥ 98 % del polígono del predio; centro del vuelo dentro de la tolerancia'),
    ('densidad', 'Densidad de suelo y de retornos cumple el mínimo del Nivel de levantamiento'),
    ('las', 'Encabezado LAS 1.4: CRS, conteo de puntos, GUID y fecha de creación consistentes con el vuelo'),
    ('control', '≥ 30 puntos de control; RMSE vertical ≤ 5 cm'),
    ('dup', 'Sin reutilización: huella de nube distinta a la de otros vuelos y predios'),
]
ANOM = {  # índice de estudio -> (check, status, detalle)
    3: ('hash', 'fail', 'El archivo LAZ cargado difiere del manifiesto: SHA-256 actual no coincide con el sellado en recepción (posible edición posterior).'),
    7: ('gnss', 'fail', 'Salto de posición de 412 m entre dos épocas consecutivas de la trayectoria; solución fija 71 %.'),
    11: ('cobertura', 'fail', 'El 63 % de la nube cae fuera del polígono declarado; centroide a 14.2 km del predio.'),
    14: ('tiempo', 'fail', 'Fecha de creación del LAS (2026-08-19) posterior 41 días al vuelo declarado (2026-07-09); tiempo GPS fuera de la ventana.'),
    18: ('dup', 'fail', 'Huella espacial de la nube coincide en 97 % con el levantamiento LDR-2025-0009 de otro predio (reutilización).'),
    21: ('solar', 'warn', 'Elevación solar en fotos difiere 11° de la esperada para la hora declarada (posible reloj de aeronave desfasado).'),
    25: ('autoriz', 'fail', 'No existe autorización de vuelo INEGI vinculada al folio declarado.'),
    29: ('control', 'warn', 'RMSE vertical 6.8 cm > 5 cm; se solicita reajuste con puntos de control adicionales.'),
    33: ('firma', 'warn', 'Sello de tiempo NOM-151 pendiente; firma electrónica válida.'),
    36: ('densidad', 'warn', 'Densidad de suelo 62 pts/m² < 100 pts/m² requeridos en dosel cerrado.'),
}
estudios = []
n_est = 40
studies_for = cand[:n_est]
for i, pr in enumerate(studies_for):
    eq = random.choice(EQUIPOS)
    d = dt.date(2026, random.randint(1, 9), random.randint(1, 26))
    if d > today: d = today - dt.timedelta(days=5)
    hh = random.randint(16, 19)  # UTC (10-13 hora local aprox.)
    area = round(pr['ha'] * random.uniform(1.05, 1.2), 1)
    dens = random.randint(150, 340)
    npts = int(area * 10000 * dens)
    sid = 'LDR-2026-%04d' % (i + 1)
    nivel = 'B'
    files = []
    base = sid
    for nm, role, sz in [(base + '_nube.laz', 'Nube de puntos (LAZ 1.4, PDRF 6)', int(npts * 9 / 1e6) + 20),
                         (base + '_trayectoria.csv', 'Trayectoria GNSS/INS post-proceso (PPK)', 48),
                         (base + '_log_vuelo.txt', 'Registro de vuelo de la aeronave', 3),
                         (base + '_fotos_exif.zip', 'Fotografías con EXIF/XMP', 410),
                         (base + '_control.csv', 'Puntos de control terrestre', 1),
                         (base + '_informe_calidad.pdf', 'Informe de calidad (ISO 19157-1)', 2)]:
        files.append({'n': nm, 'role': role, 'mb': sz, 'sha': sha(nm + str(i) + 'demo'), 'ok': True})
    checks = []
    for k, lab in CHECKS:
        st, det = 'ok', ''
        checks.append({'k': k, 'lab': lab, 's': st, 'det': det})
    dets = {
        'hash': 'Manifiesto sellado en la recepción; 6 de 6 archivos con huella idéntica.',
        'cadena': 'Encadenado verificado: cada registro incluye el hash del anterior.',
        'firma': 'e.firma del operador válida; constancia de conservación NOM-151 adjunta.',
        'autoriz': 'Autorización INEGI vigente ' + d.isoformat() + '; aeronave dentro de NOM-107-SCT3-2019.',
        'equipo': 'Equipo en padrón; certificado de calibración de sensor vigente.',
        'tiempo': 'Ventana %s–%s UTC; log, EXIF y GPS-time coinciden (Δ < 2 s).' % (utc(d, hh, 5)[11:16], utc(d, hh + 1, 10)[11:16]),
        'solar': 'Elevación solar medida vs esperada: Δ 1.4°.',
        'gnss': 'Solución fija %.1f %%; RMS horizontal 2.1 cm; sin discontinuidades.' % random.uniform(96.2, 99.6),
        'cobertura': 'Cobertura %.1f %% del polígono; centroide a %d m.' % (random.uniform(98.2, 100), random.randint(20, 180)),
        'densidad': 'Densidad media %d pts/m² (suelo %d pts/m²).' % (dens, int(dens * .32)),
        'las': 'LAS 1.4; %s puntos; GUID único; creación posterior al vuelo por 1 día (procesamiento).' % f'{npts:,}',
        'control': '%d puntos de control; RMSE vertical %.1f cm.' % (random.randint(30, 44), random.uniform(2.2, 4.4)),
        'dup': 'Similitud máxima con otras nubes: %d %%.' % random.randint(2, 11),
    }
    for c in checks: c['det'] = dets[c['k']]
    if i in ANOM:
        k, st, det = ANOM[i]
        for c in checks:
            if c['k'] == k: c['s'] = st; c['det'] = det
        if k == 'hash': files[0]['ok'] = False; files[0]['sha_now'] = sha('alterado' + sid)
        if k == 'cadena': pass
    fails = sum(c['s'] == 'fail' for c in checks); warns = sum(c['s'] == 'warn' for c in checks)
    ver = 'Rechazado' if fails else ('Con observaciones' if warns else 'Íntegro')
    estudios.append({'id': sid, 'pid': pr['id'], 'mun': pr['mun'], 'nivel': nivel, 'fecha': d.isoformat(),
                     'oper': 'OC-%03d' % (10 + i % 9), 'aero': {'marca': eq[0], 'modelo': eq[1], 'serie': rand_serial('1ZN', 12)},
                     'sensor': {'marca': eq[2].split()[0], 'modelo': eq[2], 'serie': rand_serial('SN', 8), 'cal': '2026-0%d-%02d' % (random.randint(1, 3), random.randint(1, 28))},
                     'gnss': 'RTK/PPK', 'agl': random.choice([70, 80, 90, 100]), 'vel': random.choice([4, 5, 6, 8]),
                     'autoriz': 'INEGI/DGG/2026/%05d' % random.randint(1000, 9999), 'utc0': utc(d, hh, 5), 'utc1': utc(d, hh + 1, 10),
                     'area': area, 'dens': dens, 'npts': npts, 'crs': 'ITRF2008 época 2010.0 / UTM %sN · NAVD88 (geoide INEGI)' % ('13' if pr['geom'][0][0] < -102 else '14'),
                     'files': files, 'checks': checks, 'ver': ver, 'lon': round(Polygon(pr['geom']).centroid.x, 5), 'lat': round(Polygon(pr['geom']).centroid.y, 5)})
    pr['lid'] = sid
    pr['lver'] = ver

# ---------- PROYECTOS DE RESTAURACIÓN (DEMO) ----------
TIPOS = ['Regeneración natural asistida (N1)', 'Reforestación con especies nativas', 'Restauración de ribera y manantiales',
         'Sistema agroforestal / silvopastoril', 'Enriquecimiento de bosque degradado', 'Corredor biológico entre fragmentos']
ESP = ['Pinus pseudostrobus', 'Pinus devoniana', 'Pinus montezumae', 'Quercus laurina', 'Quercus rugosa', 'Alnus jorullensis', 'Cupressus lusitanica (solo en ribera y con criterio técnico)', 'Arbutus xalapensis']
proy_pool = [p for p in predios if p['cls'] in ('naranja', 'rojo') or (p['cls'] == 'verde' and random.random() < .06)]
random.shuffle(proy_pool)
proyectos = []
for i, pr in enumerate(proy_pool[:34]):
    ha = round(max(0.5, pr.get('aff', pr['ha'] * .2) * random.uniform(.9, 1.6)), 1)
    st = random.choices(['En evaluación', 'Aprobado', 'En ejecución', 'En verificación', 'Cerrado'], [.18, .12, .3, .25, .15])[0]
    planted = int(ha * random.randint(800, 1400)) if st in ('En ejecución', 'En verificación', 'Cerrado') else 0
    surv = round(random.uniform(58, 93), 0) if st in ('En verificación', 'Cerrado') else None
    stars = None
    if st == 'Cerrado': stars = random.choice([2, 3, 3, 4, 4, 5])
    proyectos.append({'id': 'RES-2026-%03d' % (i + 1), 'pid': pr['id'], 'mun': pr['mun'], 'tipo': random.choice(TIPOS), 'ha': ha,
                      'esp': random.sample(ESP[:6] + [ESP[7]], 3), 'st': st, 'plant': planted, 'surv': surv, 'stars': stars,
                      'ini': dt.date(2025 if st != 'En evaluación' else 2026, random.randint(1, 8), random.randint(1, 27)).isoformat(),
                      'lidar_base': pr.get('lid'), 'lon': round(Polygon(pr['geom']).centroid.x, 5), 'lat': round(Polygon(pr['geom']).centroid.y, 5)})
    pr['rid'] = proyectos[-1]['id']

# ---------- BITÁCORA ENCADENADA (DEMO, hash real) ----------
ACT = [('Sistema', 'ALERTA_CREADA'), ('Analista-07', 'ALERTA_VALIDADA'), ('Dictaminador-03', 'CLASIFICACION_EMITIDA'),
       ('Sistema', 'ESTUDIO_RECIBIDO'), ('Sistema', 'MANIFIESTO_SELLADO'), ('Analista-02', 'ESTUDIO_VERIFICADO'),
       ('Dictaminador-01', 'HISTORIAL_EMITIDO'), ('Jurídico-02', 'NOTIFICACION_ENVIADA'), ('Sistema', 'DATASET_INGESTADO'),
       ('Comité Técnico', 'VERSION_ALGORITMO_APROBADA')]
ledger = []; prev = '0' * 64
t0 = dt.datetime(2026, 9, 1, 8, 0, 0)
for i in range(60):
    actor, act = random.choice(ACT)
    obj = random.choice([a['id'] for a in alertas[:40]] + [e['id'] for e in estudios] + [p['id'] for p in predios[:60]])
    ts = (t0 + dt.timedelta(minutes=i * random.randint(35, 300))).isoformat() + 'Z'
    payload = json.dumps({'actor': actor, 'accion': act, 'objeto': obj, 'ts': ts}, ensure_ascii=False, sort_keys=True)
    h = hashlib.sha256((prev + payload).encode()).hexdigest()
    ledger.append({'seq': i + 1, 'ts': ts, 'actor': actor, 'acc': act, 'obj': obj, 'prev': prev, 'hash': h})
    prev = h

demo = {'generated': today.isoformat(),
        'predios': {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'properties': {k: v for k, v in p.items() if k != 'geom'},
             'geometry': {'type': 'Polygon', 'coordinates': [[[round(x, 5), round(y, 5)] for x, y in p['geom']]]}} for p in predios]},
        'alertas': alertas, 'estudios': estudios, 'proyectos': proyectos, 'ledger': ledger}
json.dump(demo, open(OUT + 'demo.json', 'w'), ensure_ascii=False, separators=(',', ':'))
import collections
print(collections.Counter(p['cls'] for p in predios))
print('alertas', len(alertas), collections.Counter(a['st'] for a in alertas))
print('estudios', collections.Counter(e['ver'] for e in estudios))
print('proyectos', len(proyectos))
for f in ['geo.json', 'demo.json']: print(f, os.path.getsize(OUT + f) // 1024, 'KB')
