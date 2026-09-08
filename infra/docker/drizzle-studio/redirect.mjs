// Convenience redirector for Drizzle Studio.
//
// Drizzle Studio's UI is hosted by Drizzle at https://local.drizzle.studio and
// connects *back* to a local `drizzle-kit studio` server — so the real entrypoint
// is a long URL with ?host=&port= query params that nobody remembers. This tiny
// server publishes one friendly localhost port that 302s straight to it.
//
//   open http://127.0.0.1:3055  ->  https://local.drizzle.studio/?host=127.0.0.1&port=3054
//
// Runs alongside `drizzle-kit studio` in the same container (see Dockerfile CMD).
// Dev-only convenience: if it falls over, Studio itself is unaffected.

import { createServer } from 'node:http';

const PORT = Number(process.env.REDIRECT_PORT) || 3055;
const STUDIO_HOST = process.env.STUDIO_PUBLIC_HOST || '127.0.0.1';
const STUDIO_PORT = Number(process.env.STUDIO_PUBLIC_PORT) || 3054;
const TARGET =
	process.env.STUDIO_URL ||
	`https://local.drizzle.studio/?host=${STUDIO_HOST}&port=${STUDIO_PORT}`;

createServer((_req, res) => {
	res.writeHead(302, { Location: TARGET, 'Cache-Control': 'no-store' });
	res.end(`Redirecting to ${TARGET}\n`);
}).listen(PORT, '0.0.0.0', () => {
	console.log(`↪ drizzle-studio redirect listening on :${PORT} -> ${TARGET}`);
});
