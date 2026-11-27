# HogarScan Backend

Backend de HogarScan, una aplicación Android orientada a la revisión de
servicios TCP en redes domésticas y a la interpretación de sus resultados.

La API gestiona cuentas y sesiones, interpreta observaciones enviadas por
la aplicación móvil, consulta fuentes públicas de vulnerabilidades y
almacena resúmenes para generar estadísticas por usuario.

Las revisiones de red se ejecutan en el teléfono. El backend recibe las
observaciones normalizadas y no realiza el escaneo de la red doméstica.

La API aplica cabeceras HTTP de seguridad con Helmet, incluida una política CSP
restrictiva para respuestas de API, protección frente a MIME sniffing y HSTS por
un año. HSTS requiere que los clientes accedan por HTTPS; el proxy de producción
termina TLS. La política no incluye subdominios.

## Funcionalidades

### Cuentas y sesiones

- Registro de usuarios e inicio de sesión.
- Protección de contraseñas mediante Argon2id.
- Autenticación mediante tokens de sesión opacos.
- Almacenamiento del hash del token en PostgreSQL.
- Consulta de la sesión actual y cierre de sesión con revocación.

### Interpretación de observaciones TCP

- Procesamiento de conexiones aceptadas, rechazadas, con tiempo agotado
  o con errores.
- Interpretación de evidencia de protocolo cuando se proporciona.
- Generación de hallazgos con categoría, prioridad, confianza, evidencia,
  explicación, acción recomendada y limitaciones.
- Publicación de la versión de reglas utilizada por el motor.

El alcance del piloto comprende los puertos 22, 23, 80, 443, 445 y 3389.

### Consulta de fuentes externas

- Búsqueda de candidatos CPE en el diccionario oficial de NVD.
- Asociación provisional con la identificación declarada de fabricante,
  producto y versión.
- Evaluación de condiciones publicadas para posibles coincidencias CVE.
- Consulta del catálogo CISA KEV para las coincidencias sustentadas.
- Control de concurrencia, cola, intervalos, tiempos y tamaños de respuesta.
- Caché compartida con límites de entradas, bytes y vigencia.
- Cancelación de operaciones y conservación de la evaluación básica ante
  fallos de los proveedores.

Las fuentes externas están deshabilitadas por defecto y su activación
depende de la configuración del entorno.

### Resúmenes y estadísticas

- Registro idempotente de resúmenes de revisión.
- Estadísticas agregadas y revisiones recientes por cuenta.
- Aislamiento de información entre usuarios.
- Borrado de resúmenes con control de generación para impedir que
  solicitudes antiguas recuperen información eliminada.

Los resúmenes enviados al backend no incluyen direcciones IP ni un
inventario detallado de los dispositivos de la red.

## Arquitectura

El proyecto utiliza una arquitectura modular con separación entre
presentación HTTP, casos de uso, dominio e infraestructura.

| Capa            | Responsabilidad                                                                         |
| --------------- | --------------------------------------------------------------------------------------- |
| Presentación    | Rutas HTTP, autenticación, validación y transformación de solicitudes y respuestas.     |
| Aplicación      | Coordinación de casos de uso y definición de puertos para dependencias externas.        |
| Dominio         | Reglas e invariantes de las evaluaciones.                                               |
| Infraestructura | Acceso a PostgreSQL, protección de contraseñas y comunicación con proveedores externos. |

Los módulos funcionales principales corresponden a autenticación,
evaluaciones, resúmenes y estadísticas. Los componentes compartidos
proporcionan configuración, acceso a base de datos y comportamiento HTTP.

El flujo de evaluación sigue esta secuencia:

1. Validar la sesión y las observaciones recibidas.
2. Generar la interpretación TCP básica.
3. Si las fuentes están habilitadas y la identificación es comparable,
   consultar NVD y evaluar sus condiciones.
4. Si existen coincidencias CVE sustentadas, comprobar su pertenencia a KEV.
5. Transformar el resultado al contrato público y responder al cliente.

## Tecnologías

| Componente                | Tecnología           |
| ------------------------- | -------------------- |
| Plataforma                | Node.js              |
| Lenguaje                  | TypeScript           |
| Framework HTTP            | NestJS sobre Express |
| Base de datos             | PostgreSQL           |
| Acceso a datos            | `pg`                 |
| Validación                | Zod                  |
| Protección de contraseñas | Argon2id             |
| Pruebas                   | Vitest y Supertest   |
| Análisis y formato        | Oxlint y Prettier    |
| Contrato HTTP             | OpenAPI 3.0.3        |
| Integración y despliegue  | GitHub Actions y AWS |

El proyecto utiliza módulos ESM. Los imports relativos de TypeScript
incluyen la extensión `.js` correspondiente al código compilado.

## Requisitos

- Node.js `26.13.0`.
- npm `11.11.0`.
- Una base de datos PostgreSQL con el esquema y los permisos del proyecto.
- El certificado CA correspondiente al servidor PostgreSQL.

## Configuración local

Instala las dependencias respetando el archivo de bloqueo:

```bash
npm ci
```

En una instalación nueva, crea el archivo de configuración:

```bash
cp .env.example .env
```

Completa las variables documentadas en
[`.env.example`](.env.example), incluyendo la conexión a PostgreSQL y
la ruta del certificado CA.

Si ya existe un archivo `.env`, conserva sus valores. Las credenciales
y configuraciones privadas no deben incorporarse al repositorio.

La conexión a PostgreSQL utiliza TLS con verificación del certificado
del servidor. `DB_SSL_CA_PATH` debe indicar una ruta accesible para el
proceso de Node.js en el equipo donde se ejecuta la API.

## Ejecución

Para desarrollo con recarga automática:

```bash
npm run start:dev
```

Para compilar y ejecutar el resultado en Bash o Git Bash:

```bash
npm run build
NODE_ENV=production npm run start:prod
```

La ejecución requiere las variables de entorno y el acceso a PostgreSQL.
El script `start:prod` ejecuta el código compilado; por sí solo no
establece `NODE_ENV`.

## Rutas principales

| Método | Ruta             | Propósito                                                           |
| ------ | ---------------- | ------------------------------------------------------------------- |
| POST   | `/auth/register` | Registrar una cuenta.                                               |
| POST   | `/auth/login`    | Iniciar sesión.                                                     |
| GET    | `/auth/me`       | Consultar la identidad y sesión actuales.                           |
| POST   | `/auth/logout`   | Revocar la sesión actual.                                           |
| GET    | `/rules`         | Consultar metadatos de las reglas de evaluación.                    |
| POST   | `/evaluations`   | Interpretar observaciones y realizar el enriquecimiento disponible. |
| POST   | `/me/scans`      | Registrar un resumen de revisión.                                   |
| GET    | `/me/stats`      | Consultar estadísticas de la cuenta.                                |
| DELETE | `/me/scans`      | Eliminar resúmenes mediante el control de generación.               |
| GET    | `/health/live`   | Comprobar que el proceso atiende solicitudes.                       |
| GET    | `/health/ready`  | Comprobar la disponibilidad de PostgreSQL desde la API.             |

Los esquemas, requisitos de autenticación, parámetros, respuestas y
códigos de error se describen en el
[contrato OpenAPI](docs/hogarscan_openapi.yaml).

La comprobación de readiness no acredita la disponibilidad de NVD ni
de CISA KEV.

## Verificación

```bash
npm run validate:openapi
npx tsc --noEmit
npm run build
npm run lint
npm test
npm run test:e2e
```

Las pruebas automatizadas utilizan dobles de prueba para las dependencias
externas. No requieren credenciales reales ni acceso a RDS, NVD o CISA.

La validación estructural de OpenAPI complementa las pruebas HTTP;
no sustituye la comprobación del comportamiento de los endpoints.

## Integración y despliegue

GitHub Actions ejecuta la validación del contrato, tipos, compilación,
análisis estático y pruebas antes de preparar el paquete de despliegue.

El despliegue utiliza credenciales temporales mediante OIDC, artefactos
con checksum y ejecución remota administrada. La activación de una versión
incluye comprobaciones de disponibilidad y restauración de la versión
anterior ante fallos. La restauración no convierte un despliegue fallido
en exitoso.

También se dispone de conservación y limpieza de versiones instaladas.

`develop` es la rama de integración y `main` contiene la entrega estable.
Ambas ramas y sus Pull Requests ejecutan las verificaciones de CI.
Solo los pushes a `main` activan el despliegue automático, después de
superar la validación. Los cambios en `develop` no actualizan la instancia.

La confianza OIDC del rol de despliegue debe autorizar exclusivamente
`main`, según `deploy/iam/github-deploy-trust.json`. Modificar ese archivo
no actualiza por sí mismo la política aplicada en AWS IAM.

Las direcciones, credenciales y parámetros particulares de cada entorno
se administran fuera de este documento.

## Alcance y limitaciones

- Una conexión TCP aceptada no demuestra una vulnerabilidad.
- Un timeout no demuestra que un dispositivo esté ausente.
- El número de puerto no identifica por sí solo un protocolo o producto.
- La identificación de fabricante, producto y versión es declarada,
  no certificada por el backend.
- Una coincidencia CVE representa una posibilidad sustentada en las
  condiciones interpretadas, no una vulnerabilidad confirmada.
- La ambigüedad CPE y las condiciones no soportadas conservan un resultado
  inconcluso.
- Los rangos de versión requieren un comparador respaldado para el
  producto; el flujo actual no presupone un orden universal de versiones.
- Una fuente indisponible no equivale a una búsqueda sin resultados.
- La ausencia de coincidencias no acredita que un dispositivo sea seguro.

La integración de fuentes externas está implementada. Las pruebas
automatizadas, la aceptación del recorrido completo por HTTPS y sus
limitaciones se documentan por separado.

## Documentación

- [Contrato OpenAPI](docs/hogarscan_openapi.yaml).
- [Dominio de evaluaciones](docs/evaluations.md).
- [Integración de fuentes externas y aceptación](docs/evaluations-external-integration.md).
- [Política de consumo de NVD y CISA KEV](docs/external-sources-policy.md).

## Contribución

El trabajo se organiza mediante ramas por bloque funcional, con varios
commits pequeños y coherentes por rama. Los Pull Requests de trabajo se
dirigen a `develop`; las promociones estables se realizan mediante un
Pull Request de `develop` hacia `main`.

Los cambios al contrato público, al esquema de base de datos, a componentes
compartidos o a la infraestructura se coordinan antes de implementarse.

Cada Pull Request debe explicar el comportamiento resultante, las pruebas
realizadas y las limitaciones relevantes.

Consulta la [guía de contribución](CONTRIBUTING.md) para el flujo de trabajo
y la [política de seguridad](SECURITY.md) para reportar posibles vulnerabilidades.

## Licencia

Este proyecto se distribuye bajo la [licencia MIT](LICENSE).

Copyright © 2026 José Antonio Calvo Aguilar y
Uzzi Yazziel Gonzaga Gómez.

Las dependencias de terceros conservan sus respectivas licencias.
