// The pre-CMS hardcoded content (officer roster, sponsor list), read straight out of the
// website components so the import and the pre-flight inspection share one source of truth.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const APP = join(ROOT, 'apps', 'ieeeucfcom');
export const PUBLIC = join(APP, 'public');

export interface LegacyOfficer {
	name: string;
	type: 'Executive' | 'Chair';
	role: string;
	major: string;
	year: string;
	linkedin: string;
	photo: string;
	bio?: string;
}

export interface LegacySponsor {
	name: string;
	logo: string;
	tier: 'Gold' | 'Silver' | 'Bronze';
}

async function readArrayLiteral<T>(file: string, marker: string): Promise<T[]> {
	const text = await readFile(join(APP, file), 'utf8');
	const start = text.indexOf(marker);
	if (start === -1) throw new Error(`${marker} not found in ${file}`);
	const open = text.indexOf('[', start + marker.length - 1);
	const end = text.indexOf('\n];', open);
	// The literal is plain data (strings / objects) in our own repo file.
	return new Function(`return ${text.slice(open, end + 2)}`)() as T[];
}

export const readLegacyOfficers = () =>
	readArrayLiteral<LegacyOfficer>('src/components/pg/aboutofficers.tsx', 'const OFFICERS: Officer[] = [');

export const readLegacySponsors = () =>
	readArrayLiteral<LegacySponsor>('src/components/pg/sponsorshipsclient.tsx', 'const SPONSORS: SponsorCard[] = [');
