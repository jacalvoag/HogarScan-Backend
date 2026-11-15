# Integración de fuentes externas de evaluaciones

Con fuentes habilitadas, la evaluación usa fabricante, producto y versión
declarados para construir un filtro de búsqueda `cpeMatchString` en NVD. El
filtro cubre todas las clases de CPE y evita que títulos o enlaces determinen
la asociación. Solo se permiten campos literales del subconjunto CPE
implementado. El CPE que se usa en la búsqueda CVE proviene del diccionario
oficial. Véase la [documentación del filtro de NVD](https://nvd.nist.gov/developers/products).

La búsqueda completa debe devolver un solo registro vigente. Fabricante y
producto deben coincidir sin distinguir mayúsculas, y la versión debe coincidir
carácter por carácter. En los siete atributos restantes solo se acepta
`*` (ANY). Un `-` (NA) o un valor específico requiere información adicional
y deja la resolución inconclusa. Los alias, variantes, registros obsoletos y
sintaxis no soportada también quedan inconclusos. Esto permite una asociación
provisional con el CPE para evaluar condiciones publicadas. La identidad sigue
siendo declarada.

La búsqueda CVE también debe completar su paginación. Solo se emite un hallazgo
`POSSIBLE_CVE_MATCH` si se satisface una configuración con al menos un criterio
vulnerable positivo. Las condiciones sobre otros componentes quedan
desconocidas incluso bajo negación, ya que no hay un inventario del equipo.
Los rangos de versión requieren un comparador respaldado para ese producto y
el alcance actual se limita a condiciones que no requieren ordenar versiones.
La lista vacía no permite concluir que el dispositivo sea seguro.

Una consulta incompleta o un fallo de NVD conserva los hallazgos básicos y marca
NVD como `UNAVAILABLE`. Una búsqueda completa sin coincidencia sustentada
mantiene NVD en `AVAILABLE`. Ante una o más coincidencias, un catálogo KEV
validado comprueba todas las CVE en la misma evaluación. Si falla KEV, se
conservan las coincidencias y `in_kev` queda en `null`. Sin identificación
comparable o con fuentes deshabilitadas, ambos estados quedan en `NOT_QUERIED`.

El transporte usa destinos HTTPS fijos, sin redirecciones, con límites de
tiempo y tamaño. Una cola y una caché se comparten por proceso entre cuentas;
CPE y CVE comparten el intervalo NVD. La caché solo almacena páginas validadas
o el catálogo validado, aplica TTL y límites de entradas y bytes, y conserva
la fecha de obtención. La desconexión cancela la consulta en curso. El
presupuesto abarca la espera, consulta y procesamiento.

`GET /rules` y `POST /evaluations` comparten la versión `0.2.0` por la incorporación
de la regla `NVD_POSSIBLE_MATCH`. La fecha de la versión es fija y la respuesta
usa los campos y estados de OpenAPI existentes.

## Despliegue y configuración

La integración fue revisada e incorporada a `develop` mediante el PR #33.
La validación del backend y el despliegue automático de desarrollo finalizaron
correctamente.

Las fuentes permanecen deshabilitadas por defecto en el código. Para las
pruebas manuales se habilitaron en el entorno de desarrollo con esta
configuración:

```env
EXTERNAL_SOURCES_ENABLED=true
EXTERNAL_REQUEST_TIMEOUT_MS=30000
EXTERNAL_EVALUATION_BUDGET_MS=45000
```

El intervalo NVD se mantiene en 10000 ms, con páginas de 50 registros y un
máximo de dos páginas por búsqueda. El presupuesto de 45000 ms se comparte
entre las operaciones necesarias para una evaluación.

## Evidencia de aceptación

La revisión del PR #33 acreditó 547 pruebas unitarias y 260 pruebas HTTP
aprobadas con fuentes simuladas, además de tipos, compilación, lint y
validación estructural de OpenAPI.

Las pruebas manuales contra proveedores comprobaron:

- Consulta y validación del diccionario CPE de NVD.
- Búsqueda CVE completa para el CPE oficial de OpenSSH 9.6 utilizado en la
  prueba directa, con 32 candidatos validados.
- Descarga y validación del catálogo CISA KEV.
- Desde EC2, resolución de Apache HTTP Server 2.4.49 a un único CPE vigente
  y compatible con el resolver.
- Desde EC2, validación individual de las dos páginas CVE de Apache,
  con 100 candidatos en total. Estas consultas independientes no
  acreditan el presupuesto conjunto de una evaluación.

Por HTTPS se comprobaron disponibilidad, publicación de reglas 0.2.0,
rechazo de evaluaciones sin sesión, registro, login, evaluación básica
y logout.

Una evaluación con identificación OpenSSH ambigua devolvió NVD `AVAILABLE`
y KEV `NOT_QUERIED`, conservó el hallazgo básico y no generó coincidencias CVE.

## Indisponibilidad observada

Durante el diagnóstico del flujo de Apache desde EC2, la consulta CPE
respondió HTTP 200 y pasó la validación. La solicitud CVE posterior recibió
HTTP 503 de NVD, sin `Retry-After`.

El flujo conservó los hallazgos básicos, marcó NVD `UNAVAILABLE`, dejó KEV
en `NOT_QUERIED` y omitió coincidencias CVE. Las evaluaciones por HTTPS
también conservaron una respuesta válida con ese estado de indisponibilidad.

El HTTP 503 observado no acredita un problema de clave API ni justifica
aumentar los límites de paginación o añadir reintentos automáticos.

## Aceptación pendiente

Queda pendiente acreditar una evaluación completa por HTTPS que resuelva
un CPE compatible, genere una coincidencia CVE sustentada y compruebe
su pertenencia a KEV dentro del mismo flujo.

Las consultas independientes a proveedores y las pruebas con fuentes
simuladas no sustituyen esa aceptación. El caso propuesto utiliza Apache
HTTP Server 2.4.49 y CVE-2021-41773; su resultado debe comprobarse contra
los datos publicados y disponibles al ejecutar la prueba.

Una lista vacía de coincidencias o una fuente indisponible no demuestra
que un dispositivo sea seguro.
