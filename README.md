# HogarScan Backend

API de HogarScan desarrollada con NestJS y TypeScript. Interpreta observaciones
TCP enviadas por la aplicación Android y gestiona cuentas y resúmenes para
estadísticas. Las revisiones de red se ejecutan en el teléfono.

La integración real de NVD y CISA KEV está en desarrollo. Las fuentes externas
permanecen deshabilitadas por defecto.

## Entorno

- Node.js 26.13.0 y npm 11.11.0, utilizados también en CI.
- PostgreSQL en RDS con conexión TLS y verificación del certificado del servidor.
- Los comandos de este documento usan Bash o Git Bash.

## Configuración

En una instalación nueva, crea `.env` a partir de [.env.example](.env.example)
y completa las variables de conexión. Si ya tienes `.env`, conserva sus valores.
La aplicación carga ese archivo desde el directorio de ejecución; las variables
definidas por el entorno tienen prioridad. En un servidor también puedes
proporcionar las variables sin crear un archivo `.env`.

| Variable                                       | Valor predeterminado | Uso                                            |
| ---------------------------------------------- | -------------------- | ---------------------------------------------- |
| `NODE_ENV`                                     | `development`        | Entorno: `development`, `test` o `production`. |
| `PORT`                                         | `3000`               | Puerto de escucha de la API.                   |
| `API_HOST`                                     | `0.0.0.0`            | Dirección IP literal donde escucha la API.     |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Requeridas           | Conexión de la API a PostgreSQL.               |
| `DB_PORT`                                      | `5432`               | Puerto de PostgreSQL.                          |
| `DB_SSL_CA_PATH`                               | Requerida            | Ruta al archivo CA regional de RDS.            |
| `SESSION_TTL_SECONDS`                          | `604800`             | Vigencia de una sesión.                        |

`API_HOST=127.0.0.1` permite acceso desde el mismo equipo o un proxy local.
`API_HOST=0.0.0.0` escucha en las interfaces IPv4, útil para pruebas en LAN o un
contenedor. También se admiten direcciones IPv6 literales. La dirección de
escucha no es la URL que debe usar el móvil: utiliza la IP accesible del servidor
o el dominio público cuando se configure el despliegue.

`DB_SSL_CA_PATH` corresponde al equipo donde corre Node. En Windows puede ser
`C:/certificados/mx-central-1-bundle.pem`; en un servidor Linux será la ruta donde
se haya colocado o montado ese archivo. El proceso debe poder leerlo y se
mantiene la verificación TLS. Credenciales y archivos `.env` quedan fuera de Git.

## Instalación, desarrollo y verificación

```bash
npm ci
npm run start:dev
```

```bash
npx tsc --noEmit
npm run build
npm run lint
npm test
npm run test:e2e
```

## Ejecución del build

```bash
npm run build
NODE_ENV=production npm run start:prod
```

`start:prod` ejecuta `dist/main.js`. La compilación requiere las dependencias de
desarrollo. En el despliegue, establecer `NODE_ENV=production` en el entorno del
servicio y proporcionar las variables de conexión. El nombre del script por sí
solo no cambia `NODE_ENV`.

El proceso sirve HTTP. La publicación con HTTPS y la configuración del proxy
se completarán al elegir el entorno de despliegue. La conexión TLS a RDS es
independiente del HTTPS entre el móvil y la API.

## Comprobaciones de salud

| Ruta pública        | Resultado                                                 |
| ------------------- | --------------------------------------------------------- |
| `GET /health/live`  | 200 si el proceso atiende HTTP; no consulta dependencias. |
| `GET /health/ready` | 200 si responde PostgreSQL; 503 genérico si falla.        |

Ambas usan `Cache-Control: no-store`. Readiness comparte la prueba pendiente
entre solicitudes simultáneas. Usa hasta 10 segundos para adquirir conexión y
1 segundo para la consulta; configurar un supervisor con un timeout superior
a ese presupuesto nominal. Los fallos de NVD/KEV no forman parte de readiness.

## Documentación del proyecto

- [Contrato OpenAPI](docs/hogarscan_openapi.yaml).
- [Evaluación básica y preparación de fuentes](docs/evaluations.md).
- [Política de consumo de NVD y CISA KEV](docs/external-sources-policy.md).

El equipo trabaja mediante ramas por bloque funcional, varios commits pequeños
por rama y Pull Requests hacia `develop`.

## Proxy local

`TRUST_LOCAL_PROXY=false` es el valor predeterminado y descarta los encabezados
reenviados al determinar la IP y el protocolo del cliente. Usa `true` cuando
Caddy esté en el mismo servidor y la API escuche en `127.0.0.1` o `::1`.
En ese modo Express confía únicamente en conexiones desde loopback. Caddy debe
reemplazar los encabezados `X-Forwarded-*` recibidos del cliente, como hace por
defecto. Los límites se aplican por IP; clientes que compartan una IP pública
también comparten el contador correspondiente.
