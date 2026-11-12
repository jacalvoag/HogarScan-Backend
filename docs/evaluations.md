# Dominio de evaluaciones

El dominio recibe observaciones TCP normalizadas correspondientes a una sola
dirección que no se incluye en los datos. Cada evaluación tiene entre una y seis
observaciones y no puede repetir puertos. Los puertos admitidos para el piloto
son 22, 23, 80, 443, 445 y 3389.

Los resultados `ACCEPTED`, `REFUSED`, `TIMEOUT` y `ERROR` son distintos. Una
conexión aceptada no confirma una vulnerabilidad; un timeout no demuestra que
el dispositivo esté ausente. El número de puerto no identifica por sí solo
un protocolo, producto ni CVE. La evidencia de protocolo solo acompaña a una
conexión aceptada y usa las parejas definidas por el contrato.

La identificación de fabricante, producto y versión es opcional y declarada
por la persona usuaria; no es una identificación verificada. El dominio
conserva los valores recibidos y comprueba que no estén vacíos ni excedan los
límites del contrato.

Los hallazgos tienen una categoría, prioridad, confianza, evidencia,
explicación, acción, limitación y regla. Solo la categoría
`POSSIBLE_CVE_MATCH` incluye un identificador CVE y su confianza es `POSSIBLE`.
Una coincidencia posible no confirma que un dispositivo sea vulnerable.

Los tipos del dominio describen datos ya decodificados. Las funciones de
construcción comprueban las invariantes indicadas en su implementación; no son
un validador de JSON ni reemplazan los esquemas estrictos del borde HTTP. Los
controladores y la consulta de fuentes externas se desarrollarán posteriormente.

## Interpretación TCP básica

El motor es determinista y no consulta fuentes externas ni guarda información.
Devuelve la versión de reglas y los hallazgos en el orden de las observaciones.
La versión y los identificadores están definidos en `basic-rules.ts`; la futura
implementación de `GET /rules` debe utilizar esa misma fuente.

| Regla                 | Interpretación                                                                         |
| --------------------- | -------------------------------------------------------------------------------------- |
| `TCP_ACCEPTED`        | Conexión aceptada; prioridad baja, sin inferir vulnerabilidad.                         |
| `PROTOCOL_IDENTIFIED` | Se añade solo cuando la observación aceptada incluye evidencia explícita de protocolo. |
| `TCP_REFUSED`         | Conexión rechazada; no se concluye que el servicio sea seguro.                         |
| `TCP_TIMEOUT`         | Tiempo de espera agotado; no se concluye que el equipo esté ausente.                   |
| `TCP_ERROR`           | Error de medición; no se concluye disponibilidad ni seguridad.                         |

Los tres últimos resultados producen hallazgos de evidencia insuficiente con
prioridad indeterminada. La identificación declarada no genera coincidencias
CVE: su correlación con fuentes externas queda para una entrega posterior.

## Módulo HTTP básico

`EvaluationsModule` prepara `GET /rules` público y `POST /evaluations` protegido
por `SessionGuard`. La solicitud privada se valida con un esquema estricto, se
interpreta sin persistencia y responde con `Cache-Control: no-store`. NVD y KEV
figuran como `NOT_QUERIED`; no se generan coincidencias CVE en esta etapa.

Los metadatos usan la versión del motor. La fecha fija de publicación de la
versión 0.1.0 es `2026-11-11T05:32:33Z`, correspondiente a su integración en
`develop` mediante el PR #24.

El módulo está registrado en `AppModule`. Para la evaluación básica, el límite
por IP y ruta es de 60 solicitudes por minuto para `GET /rules` y 600 por minuto
para `POST /evaluations`. El límite se aplica antes de comprobar la sesión en
la ruta privada. Esos valores no autorizan consultas a proveedores externos;
sus cuotas y controles deberán coordinarse antes de integrar NVD o KEV.
