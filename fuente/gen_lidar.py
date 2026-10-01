"""Genera 3 nubes LiDAR de demostración (LAS 1.4, PDRF 6, UTM 13N) en la franja aguacatera.
Son SINTÉTICAS pero con estructura física realista (terreno, copas, sotobosque, retornos múltiples, clasificación ASPRS):
  1) bosque de pino-encino de referencia, 2) huerta de aguacate establecida en terrazas, 3) conversión reciente con olla.
El encabezado lo declara: System Identifier = 'SINTETICO DEMO UAV'."""
import numpy as np, struct, json, math, uuid, datetime, hashlib, os
from scipy.spatial import cKDTree

OUT = '/home/claude/platform/public/muestras'; os.makedirs(OUT, exist_ok=True)
demo = json.load(open('/home/claude/platform/src/data/demo.json'))

def utm(lon, lat, zone=13):
    a = 6378137; f = 1 / 298.257223563; k0 = .9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2); r = math.pi / 180
    lon0 = ((zone - 1) * 6 - 180 + 3) * r; phi = lat * r; lam = lon * r
    N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2); T = math.tan(phi) ** 2; C = ep2 * math.cos(phi) ** 2; A = math.cos(phi) * (lam - lon0)
    M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * phi) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * math.sin(6 * phi))
    x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    y = k0 * (M + N * math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return x, y

S = 60.0  # lado del recorte (m)
def terrain(rng, base, slope=(0.18, 0.06)):
    ph = rng.uniform(0, 6.28, 4)
    def z(x, y):
        return base + slope[0] * x + slope[1] * y + 1.2 * np.sin(x / 9 + ph[0]) * np.cos(y / 11 + ph[1]) + .5 * np.sin(x / 3.7 + ph[2]) + .4 * np.cos(y / 4.3 + ph[3])
    return z

def poisson(rng, n, minD, area, mask=None):
    pts = []
    tries = 0
    while len(pts) < n and tries < n * 60:
        tries += 1; p = rng.uniform(0, area, 2)
        if mask is not None and not mask(p): continue
        if all((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 > minD ** 2 for q in pts): pts.append(p)
    return np.array(pts)

def crown_points(rng, cx, cy, gz, h, cr, shape, dens):
    """Puntos en la superficie y el interior de una copa. shape: cone (pino) | ell (encino/aguacate)."""
    area = math.pi * cr * cr; n = max(8, int(area * dens * rng.uniform(.8, 1.2)))
    r = cr * np.sqrt(rng.uniform(0, 1, n)); t = rng.uniform(0, 6.283, n)
    x = cx + r * np.cos(t); y = cy + r * np.sin(t)
    base = h * (0.45 if shape == 'cone' else 0.35)
    if shape == 'cone': top = gz + h - (r / cr) * (h - base)
    else: top = gz + base + (h - base) * np.sqrt(np.clip(1 - (r / cr) ** 2, 0, 1))
    depth = rng.exponential(.9 if shape == 'ell' else 1.4, n)  # penetración bajo la superficie
    z = np.maximum(gz + base * .9, top - depth)
    return x, y, z

def build(kind, seed):
    rng = np.random.default_rng(seed)
    zf = terrain(rng, {'bosque': 2240.0, 'huerta': 1890.0, 'conversion': 2085.0}[kind])
    X, Y, Z, C, I, RN, NR = [], [], [], [], [], [], []
    def add(x, y, z, c, inten, rn=1, nr=1):
        x = np.atleast_1d(x); m = (x >= 0) & (x <= S) & (np.atleast_1d(y) >= 0) & (np.atleast_1d(y) <= S)
        X.append(x[m]); Y.append(np.atleast_1d(y)[m]); Z.append(np.atleast_1d(z)[m]); k = m.sum()
        C.append(np.full(k, c, np.uint8)); I.append(np.clip(rng.normal(inten, inten * .12, k), 1, 65535).astype(np.uint16))
        RN.append(np.broadcast_to(np.atleast_1d(rn), x.shape)[m].astype(np.uint8)); NR.append(np.broadcast_to(np.atleast_1d(nr), x.shape)[m].astype(np.uint8))
    trees = []; ground_open = None
    if kind == 'bosque':
        pos = poisson(rng, 95, 4.2, S)
        for p in pos:
            h = rng.uniform(16, 31); pine = rng.uniform() < .6; cr = (rng.uniform(2.2, 3.4) if pine else rng.uniform(3, 5.2))
            trees.append((p[0], p[1], h, cr, 'cone' if pine else 'ell'))
        under = lambda x, y: 1
        shrub = .5
    elif kind == 'huerta':
        ang = math.radians(rng.uniform(8, 18)); sp = 7.0
        for i in range(-2, 12):
            for j in range(-2, 12):
                u, v = i * sp + rng.normal(0, .25), j * sp + rng.normal(0, .25)
                x = 3 + u * math.cos(ang) - v * math.sin(ang); y = 3 + u * math.sin(ang) + v * math.cos(ang)
                if 0 <= x <= S and 0 <= y <= S and not (27 < y < 31):  # camino interior
                    trees.append((x, y, rng.uniform(5, 8.2), rng.uniform(2.4, 3.4), 'ell'))
        shrub = .05
    else:  # conversión reciente: bosque al oeste, desmonte al este con plantas jóvenes y olla
        pos = poisson(rng, 40, 4.4, S, mask=lambda p: p[0] < 24)
        for p in pos:
            h = rng.uniform(16, 29); pine = rng.uniform() < .65; trees.append((p[0], p[1], h, rng.uniform(2.2, 3.3) if pine else rng.uniform(3, 4.8), 'cone' if pine else 'ell'))
        for i in range(0, 6):
            for j in range(0, 9):
                x = 30 + i * 6 + rng.normal(0, .2); y = 3 + j * 6.5 + rng.normal(0, .2)
                if (x - 47) ** 2 + (y - 15) ** 2 > 9 ** 2: trees.append((x, y, rng.uniform(1.2, 2.6), rng.uniform(.6, 1.1), 'ell'))
        shrub = .15
    # ---- terreno ----
    ng = int(S * S * 26); gx = rng.uniform(0, S, ng); gy = rng.uniform(0, S, ng); gz = zf(gx, gy)
    if kind == 'huerta':  # terrazas: escalones de 0.9 m cada 7 m en la pendiente
        gz = gz - ((gz - gz.min()) % 1.3) * .55
    if kind == 'conversion':
        cut = gx > 26; gz = np.where(cut, gz - ((gz - gz.min()) % 1.5) * .6, gz)  # cortes nuevos
        d = np.hypot(gx - 47, gy - 15); olla = d < 7.5; gz = np.where(olla, zf(47, 15) - 2.6 + d * .05, gz)
    zg = lambda x, y: (zf(x, y) - ((zf(x, y) - 1880) % 1.3) * .55) if kind == 'huerta' else zf(x, y)
    # oclusión por copas
    tr = np.array([[t[0], t[1], t[3]] for t in trees]) if trees else np.zeros((0, 3))
    if len(tr):
        kd = cKDTree(tr[:, :2]); dist, idx = kd.query(np.c_[gx, gy]); under = dist < tr[idx, 2]
        keep = np.where(under, rng.uniform(0, 1, ng) < (.22 if kind != 'huerta' else .35), True)
    else: keep = np.ones(ng, bool)
    if kind == 'conversion':
        water = olla & (np.hypot(gx - 47, gy - 15) < 5.5)
        add(gx[keep & ~water], gy[keep & ~water], gz[keep & ~water], 2, 34000, np.where(under[keep & ~water], 2, 1) if len(tr) else 1, np.where(under[keep & ~water], 2, 1) if len(tr) else 1)
        wz = zf(47, 15) - 2.6 + 5.5 * .05 + .2; wm = water & (rng.uniform(0, 1, ng) < .35)
        add(gx[wm], gy[wm], np.full(wm.sum(), wz) + rng.normal(0, .015, wm.sum()), 9, 6000)
        # tocones
        for _ in range(55):
            x, y = rng.uniform(27, S), rng.uniform(0, S)
            if (x - 47) ** 2 + (y - 15) ** 2 < 64: continue
            k = 14; add(x + rng.normal(0, .25, k), y + rng.normal(0, .25, k), zf(x, y) + rng.uniform(0, .7, k), 3, 22000)
    else:
        add(gx[keep], gy[keep], gz[keep], 2, 36000 if kind == 'huerta' else 30000, np.where(under[keep], 2, 1) if len(tr) else 1, np.where(under[keep], 2, 1) if len(tr) else 1)
    # sotobosque / hierba
    ns = int(S * S * shrub * 20); sx = rng.uniform(0, S, ns); sy = rng.uniform(0, S, ns)
    if kind == 'conversion': m = sx < 25; sx, sy = sx[m], sy[m]
    sz = zg(sx, sy) + rng.gamma(2, .45, len(sx)); add(sx, sy, sz, 3, 18000, 2, 3)
    # copas y troncos
    for (x, y, h, cr, sh) in trees:
        g = float(zg(x, y)); dens = 17 if h > 10 else 24
        cx_, cy_, cz_ = crown_points(rng, x, y, g, h, cr, sh, dens); hag = cz_ - g
        add(cx_, cy_, cz_, 5 if h > 5 else 4 if h > 2 else 3, 21000 if sh == 'ell' else 17000, np.where(hag < h * .9, 2, 1), np.full(len(cx_), 2))
        if h > 8: k = int(h * 1.5); add(x + rng.normal(0, .12, k), y + rng.normal(0, .12, k), g + rng.uniform(.5, h * .5, k), 5, 15000, 3, 3)
    X, Y, Z = map(np.concatenate, (X, Y, Z)); C, I, RN, NR = map(np.concatenate, (C, I, RN, NR))
    o = np.argsort(X + rng.normal(0, .4, len(X)))  # orden de barrido
    return X[o], Y[o], Z[o], C[o], I[o], RN[o], NR[o], len(trees)

WKT = 'PROJCS["WGS 84 / UTM zone 13N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-105],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","32613"]]'
def write_las(path, X, Y, Z, C, I, RN, NR, ox, oy, date):
    n = len(X); sc = .001
    x0, y0, z0 = ox, oy, math.floor(Z.min())
    xs = X + ox; ys = Y + oy
    vlr = struct.pack('<H16sHH32s', 0, b'LASF_Projection', 2112, len(WKT) + 1, b'Integrity demo WKT') + WKT.encode() + b'\0'
    HS = 375; off = HS + len(vlr); doy = date.timetuple().tm_yday
    h = bytearray(HS); h[0:4] = b'LASF'; struct.pack_into('<H', h, 6, 1 | 16); h[8:24] = uuid.uuid4().bytes; h[24] = 1; h[25] = 4
    h[26:58] = b'SINTETICO DEMO UAV'.ljust(32, b'\0'); h[58:90] = b'GAMASIS lidar-synth 1.0'.ljust(32, b'\0')
    struct.pack_into('<HHHII', h, 90, doy, date.year, HS, off, 1); h[104] = 6; struct.pack_into('<H', h, 105, 30)
    struct.pack_into('<6d', h, 131, sc, sc, sc, x0, y0, z0)
    struct.pack_into('<6d', h, 179, xs.max(), xs.min(), ys.max(), ys.min(), Z.max(), Z.min())
    struct.pack_into('<Q', h, 247, n)
    byret = [int((RN == k).sum()) for k in range(1, 16)]; struct.pack_into('<15Q', h, 255, *byret)
    rec = np.zeros(n, dtype=[('x', '<i4'), ('y', '<i4'), ('z', '<i4'), ('i', '<u2'), ('rn', 'u1'), ('fl', 'u1'), ('c', 'u1'), ('ud', 'u1'), ('sa', '<i2'), ('ps', '<u2'), ('t', '<f8')])
    rec['x'] = np.round((xs - x0) / sc); rec['y'] = np.round((ys - y0) / sc); rec['z'] = np.round((Z - z0) / sc); rec['i'] = I
    rec['rn'] = (RN & 15) | ((np.maximum(NR, RN) & 15) << 4); rec['fl'] = 0; rec['c'] = C; rec['ps'] = 1
    t0 = (datetime.datetime(date.year, date.month, date.day, 17, 5) - datetime.datetime(1980, 1, 6)).total_seconds() - 1e9
    rec['t'] = t0 + np.arange(n) * 2.4e-5
    with open(path, 'wb') as f: f.write(h); f.write(vlr); f.write(rec.tobytes())

SAMPLES = [
    ('bosque', 'Bosque de pino-encino (referencia)', 'Bosque continuo sin intervención: copas altas, sotobosque y suelo apenas visible.', 11),
    ('huerta', 'Huerta de aguacate establecida', 'Árboles de 5-8 m en marco regular de 7 m, terrazas y camino interior.', 22),
    ('conversion', 'Conversión reciente con olla', 'Remanente de bosque al oeste; desmonte, cortes de terraza, plantas jóvenes y olla de agua al este.', 33),
]
fe = demo['predios']['features']
pick = {'bosque': next(f for f in fe if f['properties']['cls'] == 'verde' and f['properties']['mun'] == 'M035'),
        'huerta': next(f for f in fe if f['properties']['cls'] == 'verde' and f['properties']['cul'] == 'Aguacate' and f['properties']['mun'] == 'M044'),
        'conversion': next(f for f in fe if f['properties']['cls'] == 'rojo' and f['properties']['cul'] == 'Aguacate')}
meta = []
for kind, name, desc, seed in SAMPLES:
    f = pick[kind]; r = f['geometry']['coordinates'][0]; lon = sum(p[0] for p in r) / len(r); lat = sum(p[1] for p in r) / len(r)
    ux, uy = utm(lon, lat); X, Y, Z, C, I, RN, NR, nt = build(kind, seed)
    date = datetime.date(2026, 8, 12 + seed // 11)
    fn = f'demo_sintetico_{kind}.las'; write_las(f'{OUT}/{fn}', X, Y, Z, C, I, RN, NR, round(ux - S / 2, 2), round(uy - S / 2, 2), date)
    b = open(f'{OUT}/{fn}', 'rb').read()
    meta.append({'id': kind, 'file': f'muestras/{fn}', 'name': name, 'desc': desc, 'pid': f['properties']['id'], 'mun': f['properties']['mun'], 'lon': round(lon, 5), 'lat': round(lat, 5), 'n': int(len(X)), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'fecha': date.isoformat(), 'arboles_generados': nt, 'lado_m': S})
    print(fn, len(X), round(len(b) / 1e6, 2), 'MB', f['properties']['id'])
json.dump(meta, open('/home/claude/platform/src/data/lidar_samples.json', 'w'), ensure_ascii=False, indent=1)
