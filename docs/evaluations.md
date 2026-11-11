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
