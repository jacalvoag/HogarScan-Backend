# Política de seguridad

Esta política describe cómo comunicar posibles vulnerabilidades de
HogarScan Backend sin exponer información que pueda afectar al proyecto
o a sus usuarios.

## Alcance de mantenimiento

El mantenimiento se concentra en la línea actual de desarrollo.
No se garantiza mantenimiento independiente de revisiones anteriores.

HogarScan es un proyecto académico. El equipo revisa los reportes según
su disponibilidad, sin comprometer un plazo fijo de respuesta o resolución.

## Reportar una vulnerabilidad

Utiliza el reporte privado de vulnerabilidades de GitHub:

1. Abre la pestaña **Security and quality** del repositorio.
2. Entra en **Advisories**.
3. Selecciona **Report a vulnerability**.

No publiques detalles de una vulnerabilidad sin corregir en issues,
Pull Requests o comentarios públicos.

Si el formulario privado no está disponible, puedes abrir un issue
solicitando un canal privado de contacto, sin describir la vulnerabilidad
ni adjuntar pruebas sensibles.

## Información útil para el reporte

Incluye, cuando sea posible:

- Descripción del problema.
- Versión o commit afectado.
- Condiciones necesarias para reproducirlo.
- Pasos mínimos usando datos de prueba.
- Comportamiento observado y comportamiento esperado.
- Impacto que pudiste comprobar.

Distingue los hechos observados de las hipótesis. No adjuntes contraseñas,
tokens, archivos de entorno ni información de otras personas.

Utiliza entornos propios o expresamente autorizados. El canal de reporte
no constituye una autorización para probar el servicio desplegado.

## Tratamiento del reporte

El equipo analizará el alcance, intentará reproducir el problema y
coordinará la corrección y su comunicación.

Una alerta automática se clasifica después de revisar su contexto.
La presencia de una cadena en un archivo de pruebas no basta por sí sola
para considerarla un falso positivo.

## Vulnerabilidades consultadas por HogarScan

Una coincidencia CVE o una entrada KEV obtenida durante una evaluación
no implica una vulnerabilidad del backend.

Las coincidencias de HogarScan son posibles y dependen de la identificación
declarada y de las condiciones soportadas. Los problemas del propio motor,
la autenticación, la privacidad o la infraestructura sí corresponden a
esta política.
