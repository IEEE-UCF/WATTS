// The Discord bot's ordinal permission ladder — a strict hierarchy (higher number
// = more access) used to gate bot commands. Distinct from the capability model in
// ./index.ts. Lives here so the bot (and later apps/jobs) share one definition;
// the website does not use it.

export enum PermissionLevel {
	GUEST = 0, // not in the database
	MEMBER = 1, // registered member
	COMMITTEE_MEMBER = 2, // member of ≥1 committee
	PROJECT_LEAD = 3, // leads ≥1 project
	COMMITTEE_CHAIR = 4, // chairs ≥1 committee
	OFFICER = 5, // any officer
	EXECUTIVE = 6, // executive officer roles only
	ADMINISTRATOR = 7, // administrator flag or a bot-config owner
}

export const PermissionLevelNames: Record<PermissionLevel, string> = {
	[PermissionLevel.GUEST]: 'Guest',
	[PermissionLevel.MEMBER]: 'Member',
	[PermissionLevel.COMMITTEE_MEMBER]: 'Committee Member',
	[PermissionLevel.PROJECT_LEAD]: 'Project Lead',
	[PermissionLevel.COMMITTEE_CHAIR]: 'Committee Chair',
	[PermissionLevel.OFFICER]: 'Officer',
	[PermissionLevel.EXECUTIVE]: 'Executive',
	[PermissionLevel.ADMINISTRATOR]: 'Administrator',
};

/** Officer roles that map to EXECUTIVE rather than plain OFFICER. */
export const EXECUTIVE_OFFICER_ROLES = [
	'Executive Chair',
	'Vice Chair',
	'Secretary',
	'Treasurer',
] as const;

export interface RoleTierFacts {
	administrator: boolean;
	officerStatus: boolean;
	officerRole: string | null;
	isCommitteeChair: boolean;
	isProjectLead: boolean;
	isCommitteeMember: boolean;
}

/**
 * Resolve the ordinal permission level from a member's role facts.
 *  - `opts.isConfigOwner` (a bot-config owners list) short-circuits to ADMINISTRATOR.
 *  - `null` facts (member not in the database) → GUEST.
 */
export function computeRoleTier(
	facts: RoleTierFacts | null,
	opts: { isConfigOwner?: boolean } = {},
): PermissionLevel {
	if (opts.isConfigOwner) return PermissionLevel.ADMINISTRATOR;
	if (!facts) return PermissionLevel.GUEST;
	if (facts.administrator) return PermissionLevel.ADMINISTRATOR;
	if (
		facts.officerStatus &&
		facts.officerRole &&
		(EXECUTIVE_OFFICER_ROLES as readonly string[]).includes(facts.officerRole)
	) {
		return PermissionLevel.EXECUTIVE;
	}
	if (facts.officerStatus) return PermissionLevel.OFFICER;
	if (facts.isCommitteeChair) return PermissionLevel.COMMITTEE_CHAIR;
	if (facts.isProjectLead) return PermissionLevel.PROJECT_LEAD;
	if (facts.isCommitteeMember) return PermissionLevel.COMMITTEE_MEMBER;
	return PermissionLevel.MEMBER;
}
