# Guía de contribución

HogarScan Backend es un proyecto académico desarrollado en equipo.
Esta guía establece cómo proponer, implementar y verificar cambios.

Antes de comenzar, revisa el [README](README.md), las instrucciones de
[AGENTS.md](AGENTS.md) y el [contrato OpenAPI](docs/hogarscan_openapi.yaml).

## Coordinación

Coordina previamente los cambios que afecten:

- Contrato HTTP y compatibilidad con la aplicación móvil.
- Esquema, permisos o persistencia en PostgreSQL.
- Autenticación y sesiones.
- Configuración y componentes compartidos.
- Dependencias.
- Infraestructura y despliegue.

Un cambio interno de un módulo puede avanzar de forma independiente
mientras respete los contratos acordados.

No es obligatorio crear un issue para cada cambio interno del equipo.
Para propuestas externas, conviene describir primero el problema y
el alcance esperado.

## Ramas

- `develop` integra el trabajo de desarrollo.
- `main` se reserva para la publicación estable.
- Los cambios se realizan en ramas de trabajo y se integran mediante
  Pull Requests hacia `develop`.
- Cada rama agrupa un bloque funcional y puede contener varios commits.
- No se crea una rama por cada commit.

Utiliza nombres descriptivos, por ejemplo:

- `feat/nombre-del-bloque`
- `fix/descripcion-del-problema`
- `docs/tema`
- `chore/tarea`

Actualiza la base antes de comenzar y vuelve a comprobarla antes de
integrar. No reescribas ramas compartidas ni resuelvas conflictos
descartando cambios ajenos sin revisarlos.

La promoción de `develop` a `main` se coordina como parte de la entrega.

## Commits y alcance

- Mantén commits pequeños, coherentes y revisables.
- Evita commits masivos y procura mantener cada uno por debajo de
  1000 líneas modificadas.
- Separa reformateos generales y actualizaciones de dependencias de
  los cambios funcionales.
- Describe el resultado del cambio en el mensaje.
- Incluye las pruebas relevantes junto con el comportamiento implementado.

Ejemplos:

```text
feat: registrar resúmenes de revisión
fix: conservar fechas de datos cacheados
docs: aclarar límites de evaluación
```

## Convenciones técnicas

- Respeta la separación entre presentación, aplicación, dominio e infraestructura.
- El proyecto utiliza ESM: los imports relativos terminan en `.js`.
- Utiliza Vitest y sus herramientas de mocks.
- Conserva la validación estricta y las respuestas de error del proyecto.
- No introduzcas cambios de contrato sin revisar su impacto en móvil.
- Evita modificar archivos ajenos al alcance del cambio.
- Si cambia una dependencia, incluye el archivo de bloqueo correspondiente.

Los cambios en la interpretación de hallazgos deben revisar también la
versión de reglas, su fecha fija, las pruebas y la documentación.

## Verificación

Para cambios funcionales:

```bash
npm run validate:openapi
npx tsc --noEmit
npm run build
npm run lint
npm test
npm run test:e2e
git diff --check
```

Aplica Prettier sobre los archivos modificados.

Para cambios exclusivamente documentales, revisa los enlaces, el diff y
el formato. Si cambia el contrato, ejecuta también su validador.

Las pruebas automatizadas deben utilizar dependencias simuladas y no
necesitar credenciales reales, RDS, NVD ni CISA. Las pruebas manuales contra
proveedores se coordinan por separado y conservan los límites del proyecto.

## Pull Requests

Explica:

- El problema y el comportamiento resultante.
- Los cambios relevantes para revisar la solución.
- Las verificaciones realizadas y sus resultados.
- El impacto en contratos, datos, configuración o despliegue.
- Las limitaciones que permanezcan.

Espera el resultado de CI antes de integrar. Una respuesta HTTP exitosa
no sustituye las comprobaciones del comportamiento esperado.

## Información privada y reportes de seguridad

No incluyas credenciales, tokens, archivos `.env`, datos personales ni
detalles privados del entorno en commits, issues, capturas o Pull Requests.

Para posibles vulnerabilidades del proyecto, sigue
la [política de seguridad](SECURITY.md) y utiliza el canal privado.
