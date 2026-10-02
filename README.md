# DOSEL – Programa de Integridad Forestal (prototipo funcional)
Sitio estático de un solo archivo (index.html). Sin build. Datos de predios/alertas/estudios = DEMOSTRACIÓN.
Despliegue: `npx vercel --prod` dentro de esta carpeta, o arrastrar la carpeta a vercel.com/new.

## Arbolín · asistente ciudadano
Botón flotante en todos los portales (`fuente/src/assistant/`). Responde en lenguaje sencillo con los datos cargados (113 municipios de Guardián Forestal, padrón de demostración, metodología, folios) y guía la participación ciudadana (opinión, sugerencia, propuesta, denuncia) con municipio, localidad, colonia/paraje, referencias, punto GPS o en mapa y fotos (huella SHA-256 y GPS EXIF). Cada registro se cataloga con reglas CAT-1.0, recibe folio y asiento en bitácora; las denuncias entran a la cola de triaje. Vista de gestión: Administración → Participación ciudadana; vista pública: Ciudadano → Participa con Arbolín.

Modos de respuesta (se detectan solos):
1. **Dentro de claude.ai** (artefacto): usa Claude con el consentimiento de quien lo ve.
2. **En este sitio (Vercel)**: función `api/arbolin.js`. Configure `ANTHROPIC_API_KEY` en *Settings → Environment Variables* del proyecto (opcional `ARBOLIN_MODEL`, por defecto `claude-sonnet-5-5`) y vuelva a desplegar. Las reglas críticas viven en el servidor; límite de 30 consultas por IP cada 5 minutos.
3. **Modo básico** (sin llave o sin conexión): motor local determinista con los mismos datos.

Pruebas: `fuente/arbolin_test.py` (46 verificaciones de extremo a extremo).

## Origen certificado · temporada 2026-2027
Respuesta al acuerdo Presidencia–APEAM (Milenio, 2-oct-2026: "Sólo aguacate con origen certificado ingresará a EU"). Código en `fuente/src/domain/origen.js` y `fuente/src/views/origen.js`.
- **Constancia ambiental de origen** por huerta (folio CAO-2627-xxxxxx): origen autorizado, cero deforestación, agua, recuperación de zonas afectadas, obligaciones laborales y trazabilidad. Indispensables: origen, cero deforestación y trazabilidad; el resto se subsana en 30 días hábiles. Emisión con firma simulada, sólo rol de dictamen, asentada en bitácora. Descargable.
- **Trazabilidad de exportación**: huerta → corte → recepción → empaque → inspección → cargamento y cruce, con sello de trazabilidad; control de origen que bloquea fruta de estados no autorizados (sólo Michoacán y Jalisco).
- **Preparación de la temporada** (Administración → Origen certificado): cuenta regresiva al 15-oct, huertas listas por municipio y propuesta de reglas de acreditación (documento, inspección, mecanismo, parámetro), porque las reglas oficiales aún no se publican.
- Empacadora: la recepción exige constancia; productor: vista "Constancia ambiental"; público: consulta por UID o folio; Arbolín explica el acuerdo y consulta constancias.
Pruebas: `fuente/origen_test.py` (27 verificaciones).

## Integración del MCE (guía de integración para desarrollo)
Código en `fuente/src/domain/mce.js`, `fuente/src/views/mce.js` y `fuente/src/pdf.js` (PDF y QR sin servicios externos).
- **M1 · Expediente de tres semáforos** por huerta: fitosanitario (SENASICA/SICOA), ambiental de exportación y laboral (CLA). Cambio sólo con `evidencia_id` y usuario; el ambiental sólo cambia con el procedimiento. El semáforo forestal (5 colores, reversibilidad) queda separado.
- **M2 · Dictamen de condición forestal** de dos condiciones: fuera de terreno forestal al corte o CUSTF vigente; reproducible con `reproducir.py`.
- **M3 · Tres reglas de corte que no se concilian**: Pro-Forest (2018, incendio 2012, fuera de ANP), exportación (2019, Acuerdo DOF 24-oct-2025) y ruta de restauración (2019–2025).
- **M4 · Procedimientos de autoridad** (PROFEPA, PROAM, FGE) obligatorios para pasar a «En restauración»; constancia de cumplimiento; cohortes de supervivencia.
- **M5 · Balance de masa** con rendimiento SIAP por banda de altitud, umbral 1.30 editable y SLA de 72 h.
- **M6 · Geocerca OWP**: catálogo vacío hasta contar con la lista oficial (carga demo etiquetada).
- **M7 · Folio en el pedimento**: constancia por exportador (CAE) con huertas amparadas, pedimento en el embarque, verificador público `#/verificar/{folio}` con QR y endpoints `/v1/verificar/{folio}` y `/v1/constancias/exportador/{id}`.
- **M8 · CLA / VELAGRO** por fases (15-sep-2026 a 15-feb-2028), empresas de la cadena con registro patronal y REPSE; sin trabajadores por hectárea.
- **M9 · Seguridad de brigadas** sólo para el rol Seguridad (2FA simulado; datos ficticios), con registro de ruta en visitas de campo. **M10 · Paquete UE por lote** (GeoJSON + JSON + PDF + manifiesto SHA-256).
- **M11 · Vista pública bilingüe**: auditoría externa, resultado del dictamen por municipio, diccionario de datos ES/EN y metodología con los dos semáforos.
- **A1–A3**: detección (Guardián Forestal) separada del dictamen (autoridad estatal); «Finanzas (interno)» restringida al rol Finanzas; dictamen en dos modos con entrega a SEMARNAT.
- Roles Seguridad, Finanzas y Federal; requisitos no funcionales con prueba de carga de 59 mil huertas; registro de parámetros y bloqueos externos (SICOA, CUSTF, OWP, VELAGRO, Factor Técnico, VUCEM, cuota) como parámetros vacíos y etiquetados.
Pruebas: `fuente/mce_test.py` (64 verificaciones), además de `flow2.py` (28), `origen_test.py` (27), `arbolin_test.py` (46) y `smoke.py`.
