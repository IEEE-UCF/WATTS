/**
 * Validation for the bot's permission gate: @watts/permissions/tier `computeRoleTier`
 * (every rung of the ladder), @watts/core/members `resolveMemberTier` against the
 * seeded DB, and `Command.gate` (the check shared by slash commands and command
 * buttons). Run against a freshly seeded local DB:
 *
 *   pnpm db:reset                              # wipe + migrate + seed
 *   pnpm --filter @watts/bot check:tier
 *
 * Exits non-zero if any case fails.
 */
import { loadRootEnv } from '@watts/config/load-env';

loadRootEnv();

import { EmbedBuilder } from 'discord.js';
import { createNodePgClient } from '@watts/db/node';
import { resolveMemberTier } from '@watts/core/members';
import { computeRoleTier, PermissionLevel, type RoleTierFacts } from '@watts/permissions/tier';
import { Command, type CommandOptions } from '../src/structs/Command.ts';

const { db, end } = createNodePgClient({ url: process.env.DATABASE_URL! });

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
	console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${label}${detail && !ok ? `\n         ${detail}` : ''}`);
	if (!ok) failures++;
}

const name = (l: PermissionLevel) => PermissionLevel[l];

// ---------------------------------------------------------------------------
console.log('\ncomputeRoleTier — every rung\n');

const base: RoleTierFacts = {
	administrator: false,
	officerStatus: false,
	officerRole: null,
	isCommitteeChair: false,
	isProjectLead: false,
	isCommitteeMember: false,
};
const ladder: [string, RoleTierFacts | null, PermissionLevel, { isConfigOwner?: boolean }?][] = [
	['not in the DB → GUEST', null, PermissionLevel.GUEST],
	['config owner (even if not in the DB) → ADMINISTRATOR', null, PermissionLevel.ADMINISTRATOR, { isConfigOwner: true }],
	['plain member → MEMBER', base, PermissionLevel.MEMBER],
	['committee member → COMMITTEE_MEMBER', { ...base, isCommitteeMember: true }, PermissionLevel.COMMITTEE_MEMBER],
	['project lead → PROJECT_LEAD', { ...base, isProjectLead: true }, PermissionLevel.PROJECT_LEAD],
	['committee chair → COMMITTEE_CHAIR', { ...base, isCommitteeChair: true, isProjectLead: true }, PermissionLevel.COMMITTEE_CHAIR],
	['officer, non-exec role → OFFICER', { ...base, officerStatus: true, officerRole: 'Workshop Chair' }, PermissionLevel.OFFICER],
	['officer, no role → OFFICER', { ...base, officerStatus: true }, PermissionLevel.OFFICER],
	...(['Executive Chair', 'Vice Chair', 'Secretary', 'Treasurer'] as const).map(
		(role) =>
			[`officer, ${role} → EXECUTIVE`, { ...base, officerStatus: true, officerRole: role }, PermissionLevel.EXECUTIVE] as [
				string,
				RoleTierFacts,
				PermissionLevel,
			],
	),
	['exec role but officer_status off → MEMBER (role alone grants nothing)', { ...base, officerRole: 'Treasurer' }, PermissionLevel.MEMBER],
	['administrator → ADMINISTRATOR', { ...base, administrator: true }, PermissionLevel.ADMINISTRATOR],
];
for (const [label, facts, want, opts] of ladder) {
	const got = computeRoleTier(facts, opts);
	check(label, got === want, `got ${name(got)}, want ${name(want)}`);
}

// ---------------------------------------------------------------------------
console.log('\nresolveMemberTier — seeded members\n');

const seeded: [string, string, PermissionLevel][] = [
	['John (administrator)', 'johndoe', PermissionLevel.ADMINISTRATOR],
	['Jane (officer, Workshop Chair)', 'janesmith', PermissionLevel.OFFICER],
	['Peter (plain member, no committees)', 'peterjones', PermissionLevel.MEMBER],
	['unknown discord id', 'e2e-tier-check-nobody', PermissionLevel.GUEST],
];
const john = await resolveMemberTier(db, 'johndoe');
if (john === PermissionLevel.GUEST) {
	console.error('\nSeed data missing — run `pnpm db:reset` first.\n');
	await end();
	process.exit(1);
}
for (const [label, discordId, want] of seeded) {
	const got = await resolveMemberTier(db, discordId);
	check(label, got === want, `got ${name(got)}, want ${name(want)}`);
}
check(
	'config owner flag overrides the DB',
	(await resolveMemberTier(db, 'peterjones', { isConfigOwner: true })) === PermissionLevel.ADMINISTRATOR,
);

// ---------------------------------------------------------------------------
console.log('\nCommand.gate — shared by slash commands and command buttons\n');

// Stub Fritz client: fixed tier per user id, real EmbedBuilder.
const tiers: Record<string, PermissionLevel> = {
	guest: PermissionLevel.GUEST,
	member: PermissionLevel.MEMBER,
	admin: PermissionLevel.ADMINISTRATOR,
};
const client = {
	createEmbed: () => new EmbedBuilder(),
	hasPermission: (id: string, level: PermissionLevel) => Promise.resolve((tiers[id] ?? PermissionLevel.GUEST) >= level),
};

class StubCommand extends Command {
	run() {
		return Promise.resolve();
	}
	command(): any {
		return null;
	}
}
const make = (opts: Partial<CommandOptions>) =>
	new StubCommand(client, { name: 'stub', description: 'stub', cooldown: 0, ...opts });

const titleOf = async (cmd: Command, user: string, inGuild = true) => (await cmd.gate(user, inGuild))?.data.title ?? null;

const adminCmd = make({ permissionLevel: PermissionLevel.ADMINISTRATOR });
check('ADMINISTRATOR command: guest blocked', (await titleOf(adminCmd, 'guest'))?.includes('Insufficient') === true);
check('ADMINISTRATOR command: member blocked', (await titleOf(adminCmd, 'member'))?.includes('Insufficient') === true);
check('ADMINISTRATOR command: admin allowed', (await titleOf(adminCmd, 'admin')) === null);

const guestCmd = make({ permissionLevel: PermissionLevel.GUEST });
check('GUEST command: guest allowed', (await titleOf(guestCmd, 'guest')) === null);

check('disabled command: blocked even for admin', (await titleOf(make({ enabled: false }), 'admin'))?.includes('Disabled') === true);
check(
	'guild-only command: blocked in DMs',
	(await titleOf(make({ guildOnly: true, permissionLevel: PermissionLevel.GUEST }), 'admin', false))?.includes('Guild') === true,
);

const throwing = new StubCommand(
	{ ...client, hasPermission: () => Promise.reject(new Error('db down')) },
	{ name: 'stub', description: 'stub', permissionLevel: PermissionLevel.GUEST },
);
const origError = console.error;
console.error = () => undefined; // hasPermission logs the (expected) error
check('tier lookup throws → fails closed', (await titleOf(throwing, 'admin'))?.includes('Insufficient') === true);
console.error = origError;

const cooled = make({ permissionLevel: PermissionLevel.GUEST, cooldown: 60 });
cooled.setCooldown('member');
check('cooldown: blocked while cooling down', (await titleOf(cooled, 'member'))?.includes('Cooldown') === true);
check('cooldown: other users unaffected', (await titleOf(cooled, 'admin')) === null);

// ---------------------------------------------------------------------------
await end();
console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll tier checks passed.\n');
process.exit(failures ? 1 : 0);
