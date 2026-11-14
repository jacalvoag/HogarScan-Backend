# Política de consumo de fuentes externas

## Alcance y estado

Esta política define el trabajo de integración de NVD y CISA KEV para el piloto
de HogarScan. La configuración está registrada y validada al iniciar la API.
Los adaptadores reales y los controles descritos aquí están pendientes de
implementación. `EXTERNAL_SOURCES_ENABLED` permanece en `false` hasta completar
la integración y sus pruebas.

Las referencias son [la configuración](../src/config/external-sources.config.ts),
[las variables de ejemplo](../.env.example) y el
[contrato público](hogarscan_openapi.yaml).

## Responsabilidades y ramas

- José mantiene configuración compartida, autenticación, base de datos,
  resúmenes y preparación del despliegue.
- El compañero implementa clientes, resolución CPE, caché, planificación de
  consultas e integración dentro de `src/modules/evaluations`.
- Tras integrar configuración y política en `develop`, el compañero crea
  `feat/evaluations-integration` desde un `develop` actualizado y conserva
  varios commits pequeños en esa rama.
- Los PR tienen como destino `develop`. Los cambios a dependencias, archivos
  compartidos y contrato público se coordinan con José antes de implementarlos.
- `EvaluationsModule` ya está registrado: la integración de sus proveedores
  se hace dentro del módulo, sin volver a modificar su registro en `AppModule`.

## Configuración disponible

Inyectar `externalSourcesConfig.KEY` usando el tipo `ExternalSourcesConfig`.
Las variables se validan incluso cuando las fuentes están deshabilitadas.

| Propiedad | Valor inicial | Significado |
| --- | --- | --- |
| `enabled` | `false` | Habilitación de todo el enriquecimiento externo. |
| `requestTimeoutMs` | `10000` | Tiempo máximo de una operación HTTP externa. |
| `evaluationBudgetMs` | `45000` | Presupuesto compartido por toda la evaluación. |
| `maxConcurrentRequests` | `1` | Operaciones HTTP externas activas. |
| `maxQueuedRequests` | `8` | Operaciones pendientes en la cola común. |
| `nvdMinIntervalMs` | `10000` | Separación mínima entre inicios de llamadas a NVD. |
| `nvdMaxResponseBytes` | `2097152` | Máximo por respuesta de NVD, en bytes. |
| `nvdPageSize` | `50` | Registros solicitados por página NVD. |
| `nvdMaxPages` | `2` | Páginas máximas por búsqueda CPE o CVE. |
| `kevMaxResponseBytes` | `5242880` | Máximo del catálogo KEV, en bytes. |
| `cacheTtlSeconds` | `3600` | Vigencia desde la obtención de cada entrada. |
| `cacheMaxEntries` | `50` | Entradas máximas de la caché compartida. |
| `cacheMaxBytes` | `8388608` | Presupuesto de datos cacheados. |
| `nvdApiKey` | Ausente | Credencial opcional destinada exclusivamente a NVD. |

Estos valores son presupuestos del piloto. La clave de NVD no reduce
automáticamente los intervalos configurados. El piloto usa una sola instancia
de la API; antes de añadir réplicas hay que coordinar límites por salida/IP.
El límite HTTP de `/evaluations` no es una cuota de acceso a proveedores.

## Activación y destinos

Con `enabled=false`, devolver la interpretación básica con NVD y KEV en
`NOT_QUERIED`, `checked_at=null` y ninguna coincidencia CVE. No consultar
proveedores ni reutilizar resultados de su caché.

Con las fuentes habilitadas, iniciar NVD solo si existe identificación
declarada completa. Consultar KEV únicamente cuando exista al menos una
coincidencia CVE sustentada por las condiciones publicadas de NVD.

Los clientes utilizan HTTPS con verificación normal de certificados y destinos
oficiales fijados en el código. No reciben URLs del móvil ni siguen URLs
incluidas en referencias de los catálogos. No seguir redirecciones
automáticamente: otro destino requiere revisión de la lista permitida.

La clave de NVD se envía solo en su encabezado `apiKey`, nunca en la URL ni a
CISA. No enviar tokens de sesión, contraseñas, identificadores de cuentas,
IP privadas, inventarios ni banners. Tampoco registrar claves, encabezados de
autorización ni cuerpos completos de proveedores.

## Presupuesto, cola y cancelación

Crear un único plazo monotónico al entrar al caso de uso de evaluación.
`evaluationBudgetMs` incluye caché, cola, espera por intervalo, búsquedas CPE,
páginas CVE y KEV. No reiniciar el presupuesto por fuente, página o candidato.

Usar un planificador compartido por proceso para todos los clientes externos.
Mantener como máximo `maxConcurrentRequests` operaciones activas y
`maxQueuedRequests` pendientes. La cola atiende en orden de llegada entre
trabajos elegibles. Una espera por intervalo NVD ocupa una plaza pendiente,
sin reservar una operación HTTP activa; KEV puede avanzar mientras tanto.

El intervalo NVD es común para CPE y CVE, todas las cuentas y todas las
evaluaciones. Se mide entre inicios reales de solicitudes. Un fallo también
consume ese inicio; nunca crear un limitador independiente por teléfono.

Iniciar `requestTimeoutMs` al comenzar la operación HTTP. El plazo efectivo es
el menor entre ese tiempo y el presupuesto restante. Incluye recepción de
encabezados y lectura completa del cuerpo. Comprobar también el presupuesto
antes y después del parseo y la validación.

Cancelar esperas y lecturas al agotarse su plazo. Retirar de la cola los
trabajos cancelados y liberar los recursos activos en `finally`. Una operación
que ya perdió su plazo no puede comenzar después ni publicar su resultado en
la caché. Revalidar la caché tras salir de la cola para aprovechar otra consulta
que haya terminado durante la espera.

Cola llena, plazo agotado o error de proveedor producen `UNAVAILABLE` para el
enriquecimiento necesario. Mantener la interpretación básica y responder 200
cuando la solicitud del móvil era válida. El caso de uso debe distinguir estos
fallos de una cancelación por desconexión del cliente: esta última se propaga
y no intenta escribir una respuesta en la conexión cerrada.

Los casos de uso actuales propagan señales abortadas. El orquestador deberá
traducir el vencimiento del presupuesto externo a la degradación anterior,
sin convertirlo en un error 500 ni ocultar errores internos de programación.
Los puertos deben distinguir fallos esperados de transporte/proveedor de fallos
internos; revisar los `catch` generales actuales antes de integrar el flujo.

## Lectura y validación de respuestas

Aceptar datos únicamente de respuestas HTTP 200 con JSON UTF-8 válido y esquema
válido del proveedor. Medir incrementalmente los bytes entregados por el cuerpo
de la respuesta, después de cualquier descompresión del cliente HTTP. Interrumpir
la lectura al superar el límite. `Content-Length` no sustituye este control y
no debe cargarse primero todo el cuerpo para comprobar su tamaño después.

Usar los parsers existentes para validar NVD, CPE y KEV. Un error HTTP, JSON
inválido, catálogo incompleto o cuerpo excesivo no representa una lista vacía.
No efectuar reintentos automáticos dentro de la misma evaluación.

Si un proveedor entrega `Retry-After` válido con 429 o 503, posponer nuevas
llamadas a ese proveedor hasta el plazo indicado. Rechazar rápidamente las
consultas que no puedan realizarse dentro de su presupuesto. No mantener una
solicitud del móvil esperando ese plazo ni bloquear respuestas de caché vigente.
Sin un plazo válido siguen aplicando los intervalos configurados.

## Paginación, identificación y coincidencias

Aplicar `nvdPageSize` y `nvdMaxPages` por búsqueda: una búsqueda CPE y una búsqueda
CVE son colecciones distintas, pero comparten presupuesto, cola e intervalo.
Validar offsets, totales, progreso y duplicados antes de aceptar la colección.
No interpretar páginas pendientes como ausencia de resultados.

Si se alcanza el límite de páginas o de tiempo antes de completar una búsqueda
necesaria, el enriquecimiento NVD queda `UNAVAILABLE`: conservar los hallazgos
básicos, omitir coincidencias CVE y dejar KEV en `NOT_QUERIED`.

Una colección CPE completa sin coincidencia inequívoca es un resultado válido
de la fuente, pero una identificación inconclusa. NVD puede quedar `AVAILABLE`
sin emitir coincidencias CVE; ese estado no afirma que el producto sea seguro.

Un resultado por palabras clave es solo un candidato. No elegir automáticamente
el primer CPE ni fabricar un nombre CPE a partir del texto del usuario. Resolver
fabricante, producto y versión con evidencia suficiente, respetando obsolescencia
y condiciones publicadas. Con ambigüedad, sintaxis no soportada, información
`affected` sin interpretar o comparador de versiones injustificado, conservar
el resultado inconcluso. Tener tres números no demuestra que una versión sea SemVer.

Solo una condición vulnerable positiva evaluada permite `POSSIBLE_CVE_MATCH`.
La identificación sigue siendo declarada y la coincidencia no certifica una
vulnerabilidad. Mantener la correspondencia sin duplicados entre hallazgos y
`possible_cve_matches`, las categorías y las limitaciones de OpenAPI.

Descargar o reutilizar un catálogo KEV completo para comprobar las CVE
sustentadas. No descargarlo por cada CVE. `in_kev=false` exige un catálogo válido
y vigente que no contenga esa CVE; ante omisión o fallo utilizar `null`.

## Caché y fechas

La caché se comparte por proceso entre cuentas y entre NVD/CPE/KEV. Sus claves
incluyen fuente, consulta efectiva, tamaño de página y offset cuando corresponda.
No incluyen identidad, token o clave de API. No aplicar normalizaciones de
producto o versión que cambien el significado de la consulta.

Cachear únicamente respuestas completas y validadas, incluidas búsquedas
completas con cero resultados. Un conjunto parcial no se cachea como colección
completa. Una página válida puede cachearse como página sin certificar que la
colección esté completa. No cachear errores como resultados vacíos ni usar datos
vencidos cuando falla una actualización. El vencimiento se calcula desde la
obtención original; leer una entrada no renueva su TTL.

Aplicar simultáneamente el límite de entradas y de bytes, con eliminación de
vencidas y expulsión LRU. Contabilizar bytes UTF-8 de clave y cuerpo validado;
este presupuesto de datos no equivale al tamaño total del heap de Node.
Las entradas deben ser inmutables o entregarse mediante copias defensivas.

Conservar por resultado su fecha de obtención. `nvd_checked_at` mantiene la
fecha de los datos CVE utilizados. `sources.checked_at` es `null` solo con ambas
fuentes en `NOT_QUERIED`; en otro caso usa la fecha más antigua entre los
resultados o intentos usados. Servir caché no sustituye esas fechas por la hora actual.

Antes de añadir caché, ampliar los resultados internos de los puertos para
transportar su procedencia temporal. `FindNvdCandidates` y `CheckKevMembership`
actualmente asignan `now()` al terminar la llamada: hay que ajustarlos y probarlos
para que una lectura cacheada conserve la fecha original. Esa ampliación es
interna y no añade campos a la respuesta pública.

## Integración y pruebas de aceptación

El compañero adapta el resultado de aplicación, el controlador asíncrono y el
mapper dentro de evaluaciones. El mapper actual depende del tipo concreto de
`EvaluateBasic`; debe admitir el resultado enriquecido sin perder los campos,
estados, fechas y relaciones del contrato. Si cambian las reglas de interpretación,
actualizar conjuntamente su versión y fecha fija de publicación.

Las pruebas automatizadas usan transporte, reloj y esperas controlables:

- Fuentes deshabilitadas o identificación ausente: sin HTTP externo.
- Sin coincidencia CVE sustentada: KEV permanece `NOT_QUERIED`.
- Dos cuentas comparten cola, intervalo y caché; se respetan todos sus límites.
- Cola llena, cancelación, desconexión y timeout durante lectura liberan recursos.
- Ningún trabajo cancelado comienza tarde ni actualiza la caché.
- JSON inválido, cuerpo excesivo y catálogo incompleto producen indisponibilidad.
- Paginación completa, parcial, sin progreso y con duplicados se distinguen.
- Caché vigente conserva sus fechas; vencimiento y expulsión respetan ambos límites.
- `Retry-After` impide intentos anticipados sin paralizar datos cacheados vigentes.
- Ambigüedad CPE o versión no comparable no genera coincidencias inventadas.
- KEV válido distingue presencia y ausencia; fallo u omisión conserva `null`.
- Fallo externo devuelve una evaluación básica válida; errores internos se sanitizan.
- Las respuestas HTTP cumplen OpenAPI y no publican credenciales ni datos locales.

Antes de activar las fuentes, integrar los controles, pasar CI y verificar con
José una prueba manual limitada contra los proveedores. Mantener la activación
deshabilitada en el repositorio de ejemplo. Las pruebas de CI no necesitan
credenciales reales, RDS ni conexión a NVD/CISA.

## Referencias

- [NVD: API de productos y paginación](https://nvd.nist.gov/developers/products).
- [NVD: API de vulnerabilidades](https://nvd.nist.gov/developers/vulnerabilities).
- [NVD: guía de consumo](https://nvd.nist.gov/developers/start-here).
- [CISA: catálogo KEV y esquema oficiales](https://github.com/cisagov/kev-data).