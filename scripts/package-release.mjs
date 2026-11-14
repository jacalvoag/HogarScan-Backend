import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  'dist',
  'package.json',
  'package-lock.json',
  'deploy/systemd/hogarscan-api.service',
];

for (const file of ['dist/main.js', ...files]) {
  if (!existsSync(join(root, file))) {
    throw new Error(
      `Falta ${file}; comprueba el build y los archivos requeridos.`,
    );
  }
}

const output = join(root, 'release');
const filename = 'hogarscan-api.tar.gz';
const archive = join(output, filename);

mkdirSync(output, { recursive: true });

execFileSync('tar', ['-czf', `release/${filename}`, ...files], {
  cwd: root,
  stdio: 'inherit',
});

const checksum = createHash('sha256')
  .update(readFileSync(archive))
  .digest('hex');

writeFileSync(`${archive}.sha256`, `${checksum}  ${filename}\n`);

console.log(`Paquete: release/${filename}`);
console.log(`Checksum: release/${filename}.sha256`);
