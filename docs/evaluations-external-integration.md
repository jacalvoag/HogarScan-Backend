# Integración de fuentes externas de evaluaciones

Con fuentes habilitadas, la evaluación usa fabricante, producto y versión
declarados para construir un filtro de búsqueda `cpeMatchString` en NVD. El
filtro cubre todas las clases de CPE y evita que títulos o enlaces determinen
la asociación. Solo se permiten campos literales del subconjunto CPE
implementado. El CPE que se usa en la búsqueda CVE proviene del diccionario
oficial. Véase la [documentación del filtro de NVD](https://nvd.nist.gov/developers/products).

La búsqueda completa debe devolver un solo registro vigente. Fabricante y
producto deben coincidir sin distinguir mayúsculas, y la versión debe coincidir
carácter por carácter. Los demás atributos deben ser genéricos porque la persona
usuaria no los aportó. Los alias, variantes, registros obsoletos y sintaxis no
soportada quedan inconclusos. Esto permite una asociación provisional con el
CPE para evaluar condiciones publicadas. La identidad sigue siendo declarada.

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

Quedan la revisión de José y dos pruebas de aceptación coordinadas, una limitada
contra NVD y CISA y otra por HTTPS. La propuesta mantiene las fuentes
deshabilitadas por defecto. Integrar en `develop` desencadena el despliegue de
desarrollo.
