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
o el dominio público del entorno desplegado.

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

En EC2, Node escucha HTTP en `127.0.0.1:3000` y Caddy publica la API mediante
HTTPS. El servicio usa `API_HOST=127.0.0.1` y `TRUST_LOCAL_PROXY=true`.
La conexión TLS entre la API y RDS es independiente del HTTPS entre el cliente
y Caddy.

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

## Despliegue de desarrollo

La API de desarrollo está disponible en:

https://hogarscan-jacalvoag.duckdns.org

Se ejecuta en una instancia EC2 con Ubuntu, en `mx-central-1`. Caddy administra
HTTPS y reenvía las solicitudes al servicio `hogarscan-api`, supervisado por
systemd. PostgreSQL se encuentra en RDS y utiliza TLS con verificación del
certificado del servidor.

### Despliegue automático

Al integrar cambios en `develop`, GitHub Actions:

1. Ejecuta TypeScript, build, lint y pruebas unitarias y HTTP.
2. Genera el paquete y comprueba su checksum SHA-256.
3. Obtiene credenciales temporales de AWS mediante OIDC.
4. Sube el paquete a S3 y ejecuta el instalador en EC2 mediante SSM.
5. Comprueba la disponibilidad de la API por HTTPS.

Los pull requests ejecutan las validaciones y generan el paquete. El despliegue
se ejecuta únicamente para eventos push sobre `develop`.

Cada versión utiliza un identificador compuesto por el SHA del commit, el ID
de ejecución y el número de intento. Las versiones se instalan en
`/opt/hogarscan/releases/`; `/opt/hogarscan/current` apunta a la versión activa.

El instalador comprueba la API local y su acceso mediante Caddy. Si falla la
activación, intenta restaurar la versión y las configuraciones anteriores.
El despliegue se informa como fallido aunque la restauración termine bien.

Después de un despliegue exitoso, `/opt/hogarscan/previous` apunta a la versión
que estaba activa anteriormente. Si el despliegue falla, el instalador restaura
también el estado previo de ese enlace. La limpieza de versiones debe conservar
los destinos de `current` y `previous`.

### Configuración del servidor

Las variables privadas se encuentran en `/etc/hogarscan/api.env`, con propietario
`root` y permisos `600`. El certificado regional de RDS está instalado en
`/etc/hogarscan/certs/mx-central-1-bundle.pem`.

Las credenciales de PostgreSQL permanecen en el servidor y no forman parte
del paquete de despliegue.

El instalador está en `/usr/local/sbin/hogarscan-deploy-release`. Los cambios
en ese script requieren actualizar también su copia instalada en EC2.

### Conservación de versiones en EC2

El script `deploy/scripts/prune-releases.sh` conserva los destinos de `current`
y `previous`, además de cinco versiones adicionales recientes ordenadas por
la fecha de modificación de sus directorios.

Solo considera directorios con identificadores de versión reconocidos.
Comparte el bloqueo del instalador y se detiene si los enlaces protegidos
faltan o tienen destinos inválidos.

Después de instalarlo en EC2, la simulación se ejecuta con:

```bash
sudo /usr/local/sbin/hogarscan-prune-releases --dry-run
```

Para aplicar la limpieza:

```bash
sudo /usr/local/sbin/hogarscan-prune-releases --apply
```

Esta limpieza actúa sobre las versiones locales de EC2. Los paquetes de S3
tienen una política de conservación independiente.

El workflow ejecuta la limpieza después de cada despliegue exitoso mediante
SSM. Si el instalador falla, la limpieza no se ejecuta. Si la limpieza falla,
el job informa el error aunque la nueva versión ya haya quedado activa.

### Diagnóstico desde EC2

```bash
sudo systemctl status hogarscan-api --no-pager
sudo journalctl -u hogarscan-api -n 100 --no-pager
sudo systemctl status caddy --no-pager
sudo readlink -f /opt/hogarscan/current
```

### Publicación estable

`develop` corresponde al entorno de desarrollo. Al publicar la versión estable,
se realizará un PR hacia `main` y se ajustarán el workflow y la confianza OIDC
para desplegar desde esa rama.
