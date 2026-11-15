# Integración de fuentes externas de evaluaciones

Esta rama prepara la integración de NVD CPE, NVD CVE y el catálogo CISA KEV.
Las fuentes permanecen deshabilitadas por defecto y su activación desplegada
requiere coordinación con José.

Con fuentes habilitadas e identificación declarada, la evaluación busca páginas
del diccionario CPE en NVD. Una respuesta completa se informa como NVD
`AVAILABLE`; un fallo, plazo vencido o búsqueda parcial se informa como
`UNAVAILABLE` y se conserva la interpretación TCP básica. Sin identificación
o con fuentes deshabilitadas, NVD queda en `NOT_QUERIED`.

La búsqueda devuelve candidatos, pero la identificación enviada es declarada
por la persona usuaria y todavía no hay un criterio acordado que justifique
seleccionar un CPE. Por ello esta etapa no produce coincidencias CVE ni consulta
KEV. Los clientes paginados CVE y de catálogo KEV y los componentes de
interpretación de condiciones están preparados y probados por separado; aún
falta resolver la identidad con evidencia suficiente y conectarlos al flujo.
No se debe interpretar una lista vacía como prueba de seguridad.

El transporte usa destinos HTTPS fijos, sin redirecciones, con límites de
tiempo y tamaño. Una cola y una caché se comparten por proceso entre cuentas;
CPE y CVE comparten el intervalo NVD. La caché solo almacena páginas validadas
o el catálogo validado, aplica TTL y límites de entradas y bytes, y conserva
la fecha de obtención. La desconexión cancela la consulta en curso. El
presupuesto abarca la espera, consulta y procesamiento.

Antes de completar P05 hay que acordar con José qué evidencia permite resolver
el CPE y cómo tratar identificaciones ambiguas; integrar y probar la correlación
CVE y KEV sin perder incertidumbre; verificar CI y el contrato; y coordinar una
prueba limitada contra proveedores y otra por HTTPS. El PR requiere su revisión:
integrar en `develop` desencadena el despliegue automático de desarrollo.
