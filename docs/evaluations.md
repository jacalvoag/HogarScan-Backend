# Dominio de evaluaciones

El backend interpreta observaciones TCP enviadas por la aplicación móvil.
Cada evaluación corresponde a una sola dirección, que no se incluye en la
solicitud, y contiene entre una y seis observaciones sin puertos repetidos.

Los puertos admitidos por el piloto son 22, 23, 80, 443, 445 y 3389.

## Interpretación de observaciones

Los resultados `ACCEPTED`, `REFUSED`, `TIMEOUT` y `ERROR` son distintos.
Una conexión aceptada no confirma una vulnerabilidad y un timeout no demuestra
que un dispositivo esté ausente.

El número de puerto no identifica por sí solo un protocolo, producto o CVE.
La evidencia de protocolo solo acompaña a una conexión aceptada y debe cumplir
las combinaciones admitidas por el contrato HTTP.

La interpretación básica es determinista y no consulta proveedores externos.

| Regla                 | Interpretación                                               |
| --------------------- | ------------------------------------------------------------ |
| `TCP_ACCEPTED`        | Conexión aceptada, sin inferir una vulnerabilidad.           |
| `PROTOCOL_IDENTIFIED` | Evidencia explícita de protocolo en una conexión aceptada.   |
| `TCP_REFUSED`         | Conexión rechazada, sin concluir que el servicio sea seguro. |
| `TCP_TIMEOUT`         | Tiempo agotado, sin concluir ausencia del dispositivo.       |
| `TCP_ERROR`           | Error que impide valorar disponibilidad y seguridad.         |

## Identificación y resolución CPE

La identificación de fabricante, producto y versión es opcional y declarada
por la persona usuaria. El backend no certifica su correspondencia con un
dispositivo real.

Con fuentes habilitadas e identificación comparable, el flujo consulta el
diccionario oficial de NVD mediante un filtro `cpeMatchString`.

La resolución exige una búsqueda completa con un único registro vigente.
Fabricante y producto deben coincidir sin distinguir mayúsculas; la versión
debe coincidir carácter por carácter. Los siete atributos restantes deben
ser `*` (ANY). Un `-` (NA) o un atributo específico deja la asociación inconclusa.

No se selecciona el primer candidato ni se utilizan títulos o referencias
como prueba de identidad. Los alias, registros obsoletos y sintaxis no
soportada conservan la incertidumbre.

## Evaluación de condiciones NVD

El CPE seleccionado procede del diccionario oficial y se utiliza para buscar
candidatos CVE. La búsqueda debe completar su paginación y comprobar offsets,
totales, progreso e identificadores duplicados.

Las configuraciones conservan operadores, negaciones y condiciones publicadas.
Su evaluación distingue verdadero, falso y desconocido. Los requisitos de otros
componentes permanecen desconocidos porque no existe un inventario del equipo.

Solo una configuración satisfecha con un criterio vulnerable positivo permite
generar `POSSIBLE_CVE_MATCH`, con confianza `POSSIBLE` y regla
`NVD_POSSIBLE_MATCH`.

Los rangos de versión requieren un comparador respaldado para el producto.
El flujo integrado no presupone un orden universal de versiones ni selecciona
SemVer por la apariencia de una cadena. Las condiciones CPE no soportadas
conservan un resultado inconcluso.

La coincidencia se sustenta exclusivamente en las configuraciones CPE
publicadas por NVD. Los datos adicionales de `affected` no se interpretan
ni se utilizan como evidencia positiva o negativa. Su presencia no anula
automáticamente una configuración CPE soportada. El hallazgo comunica
expresamente esta limitación y no acredita una validación conjunta de ambas
representaciones.

## Consulta de CISA KEV

KEV se consulta únicamente si existen coincidencias CVE sustentadas.
Un catálogo completo y validado comprueba todas las coincidencias de la
evaluación.

`in_kev=false` exige un catálogo válido y vigente que no contenga la CVE.
Si KEV falla o no se consulta, la pertenencia permanece en `null`.

La pertenencia a KEV no demuestra que el dispositivo declarado esté siendo
explotado.

## Integración HTTP y reglas

`EvaluationsModule` está registrado en `AppModule`.

- `GET /rules` publica metadatos de las reglas y es público.
- `POST /evaluations` requiere sesión, valida estrictamente la solicitud y
  responde con `Cache-Control: no-store`.

Ambos endpoints comparten la versión `0.3.0` y la fecha fija de publicación
`2026-11-15T08:56:16Z`, definidas en `basic-rules.ts`.

Los límites actuales por IP y ruta son 60 solicitudes por minuto para
`GET /rules` y 600 para `POST /evaluations`. Estos límites HTTP no representan
cuotas de acceso a los proveedores externos.

## Estados y degradación

Con fuentes deshabilitadas o identificación no comparable, la evaluación
conserva la interpretación básica y ambas fuentes quedan en `NOT_QUERIED`.

Una búsqueda NVD válida y completa puede quedar en `AVAILABLE` aunque no
exista una coincidencia sustentada.

Un fallo de NVD o una búsqueda necesaria incompleta produce `UNAVAILABLE`,
conserva los hallazgos básicos y deja KEV en `NOT_QUERIED`.

Si falla KEV, se conservan las coincidencias CVE sustentadas y su pertenencia
queda en `null`. Los fallos esperados de proveedores no se confunden con
errores internos de programación ni con desconexiones del cliente.

## Controles de consumo

Los clientes comparten por proceso cola, concurrencia, intervalo NVD y caché.
El presupuesto incluye esperas, solicitudes, lectura y procesamiento.

El transporte utiliza destinos HTTPS fijos, sin redirecciones automáticas,
con límites de tiempo y tamaño. La caché conserva las fechas originales y
aplica TTL y límites simultáneos de entradas y bytes.

Las fuentes están deshabilitadas por defecto. Su configuración y controles
se describen en la [política de consumo](external-sources-policy.md).

## Verificación y limitaciones

Las pruebas automatizadas utilizan fuentes simuladas. La evidencia manual
contra proveedores y por HTTPS se registra en
[integración y aceptación](evaluations-external-integration.md).

La aceptación positiva del recorrido completo por HTTPS permanece pendiente.
Una lista vacía, una fuente indisponible o una condición inconclusa no
acreditan que un dispositivo sea seguro.

## Referencias

- [Contrato OpenAPI](hogarscan_openapi.yaml).
- [Esquema NVD CVE API 2.0](https://csrc.nist.gov/schema/nvd/api/2.0/cve_api_json_2.0.schema).
- [Esquema NVD CPE API 2.0](https://csrc.nist.gov/schema/nvd/api/2.0/cpe_api_json_2.0.schema).
- [Esquema CISA KEV](https://github.com/cisagov/kev-data/blob/develop/known_exploited_vulnerabilities_schema.json).
- [NISTIR 7698: condiciones de aplicabilidad](https://nvlpubs.nist.gov/nistpubs/legacy/ir/nistir7698.pdf).
- [NISTIR 7695: nombres CPE](https://nvlpubs.nist.gov/nistpubs/legacy/ir/nistir7695.pdf).
- [NISTIR 7696: comparación CPE](https://nvlpubs.nist.gov/nistpubs/legacy/ir/nistir7696.pdf).
