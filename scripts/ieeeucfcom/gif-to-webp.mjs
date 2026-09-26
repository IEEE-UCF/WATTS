// One-off helper: build animated-WebP and static-WebP variants next to every GIF in
// apps/ieeeucfcom/public, then print a size / frame / fidelity table so the options can be
// compared before one is picked. Originals are never modified or deleted.
//
//   node scripts/ieeeucfcom/gif-to-webp.mjs [--quality 85] [--effort 6]
//
// Output next to each `<name>.gif`:
//   <name>.webp         animated WebP, same frames + dimensions + frame delays
//   <name>-static.webp  first frame only (a comparison option, not the default)
//
// Not part of the build. `sharp` is resolved through the website app's `next` dependency
// (Next.js already ships it for image optimization), so nothing new is installed.

import { readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const appRequire = createRequire(new URL('../../apps/ieeeucfcom/package.json', import.meta.url));
const sharp = createRequire(appRequire.resolve('next/package.json'))('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(here, '../../apps/ieeeucfcom/public');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : Number(args[i + 1]);
};
const QUALITY = opt('quality', 85);
const EFFORT = opt('effort', 6);

function findGifs(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		if (e.isDirectory()) return findGifs(p);
		return e.name.toLowerCase().endsWith('.gif') ? [p] : [];
	});
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/** PSNR (dB) between frame `page` of two animated images; higher = closer, >40 is visually identical. */
async function framePsnr(a, b, page) {
	const [ra, rb] = await Promise.all(
		[a, b].map((f) => sharp(f, { page }).ensureAlpha().raw().toBuffer()),
	);
	if (ra.length !== rb.length) return NaN;
	let se = 0;
	for (let i = 0; i < ra.length; i++) {
		const d = ra[i] - rb[i];
		se += d * d;
	}
	const mse = se / ra.length;
	return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

const rows = [];
for (const gif of findGifs(PUBLIC).sort()) {
	const base = gif.slice(0, -'.gif'.length);
	const webp = `${base}.webp`;
	const still = `${base}-static.webp`;

	const src = await sharp(gif, { animated: true }).metadata();
	const frames = src.pages ?? 1;

	await sharp(gif, { animated: true })
		.webp({ quality: QUALITY, effort: EFFORT, smartSubsample: true })
		.toFile(webp);
	await sharp(gif, { page: 0 }).webp({ quality: 90, effort: EFFORT }).toFile(still);

	const out = await sharp(webp, { animated: true }).metadata();
	const sample = [0, Math.floor(frames / 2), frames - 1];
	const psnr = [];
	for (const p of sample) psnr.push(await framePsnr(gif, webp, p));

	rows.push({
		file: relative(PUBLIC, gif).split(sep).join('/'),
		dims: `${src.width}x${src.pageHeight ?? src.height}`,
		frames: `${frames} -> ${out.pages ?? 1}`,
		delayKept: JSON.stringify(src.delay) === JSON.stringify(out.delay) ? 'yes' : 'NO',
		gif: kb(statSync(gif).size),
		webp: kb(statSync(webp).size),
		static: kb(statSync(still).size),
		saved: `${(100 - (statSync(webp).size / statSync(gif).size) * 100).toFixed(0)}%`,
		psnr: psnr.map((v) => (Number.isFinite(v) ? v.toFixed(1) : 'inf')).join(' / '),
	});
}

console.log(`\nanimated WebP quality=${QUALITY} effort=${EFFORT}\n`);
console.table(rows);
