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
