// Block until the local Postgres container accepts connections (or give up after ~60s).
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = ['compose', '-f', 'infra/docker/docker-compose.yml'];

const deadline = Date.now() + 60_000;
process.stdout.write('• waiting for postgres');

while (Date.now() < deadline) {
	try {
		execFileSync('docker', [...compose, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'postgres', '-d', 'watts'], {
			cwd: root,
			stdio: 'ignore',
		});
		process.stdout.write(' — up\n');
		process.exit(0);
	} catch {
		process.stdout.write('.');
		await new Promise((r) => setTimeout(r, 1500));
	}
}

process.stdout.write('\n');
console.error('postgres did not become ready within 60s — check `pnpm infra:up` / `docker ps`');
process.exit(1);
