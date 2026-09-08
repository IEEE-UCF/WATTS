import { eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Members } from '@watts/db/schema';
import { DomainError } from './errors';

const officerPublicFields = {
	id: Members.id,
	firstName: Members.firstName,
	lastName: Members.lastName,
	officerRole: Members.officerRole,
	biography: Members.biography,
	portraitUrl: Members.portraitUrl,
	linkedinURL: Members.linkedinURL,
	githubURL: Members.githubURL,
	websiteURL: Members.websiteURL,
};

/** Public "meet the officers" list — everyone with officerStatus. */
export function listOfficers(db: WattsDb) {
	return db.select(officerPublicFields).from(Members).where(eq(Members.officerStatus, true));
}

/** One officer's public card. Throws NOT_FOUND if the member isn't an officer. */
export async function getOfficerById(db: WattsDb, id: string) {
	const [officer] = await db
		.select(officerPublicFields)
		.from(Members)
		.where(eq(Members.id, id))
		.limit(1);
	if (!officer?.officerRole) throw new DomainError('NOT_FOUND', 'Officer not found');
	return officer;
}

// promote / demote are setMemberOfficer(db, …) from ./members — one implementation.
