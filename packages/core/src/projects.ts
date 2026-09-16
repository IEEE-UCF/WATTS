import { and, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Projects, ProjectMembers, ProjectMembershipRequests, Members } from '@watts/db/schema';
import { DomainError } from './errors';

export interface CreateProjectInput {
	title: string;
	slug?: string;
	overview: string;
	projectLead?: string;
	hardwareInfo?: string;
	softwareInfo?: string;
	skills?: string;
	photoUrls?: string[];
	categoryId?: string | null;
	discordRoleId?: string;
	discordLeadRoleId?: string;
	discordChannelId?: string;
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

/** projectId → "First Last" for the member flagged isLead, for the given ids. */
async function fetchLeadNames(db: WattsDb, projectIds: string[]): Promise<Map<string, string>> {
	if (projectIds.length === 0) return new Map();

	const leads = await db
		.select({
			projectId: ProjectMembers.projectId,
			firstName: Members.firstName,
			lastName: Members.lastName,
		})
		.from(ProjectMembers)
		.innerJoin(Members, eq(ProjectMembers.memberId, Members.id))
		.where(eq(ProjectMembers.isLead, true));

	const idSet = new Set(projectIds);
	const map = new Map<string, string>();
	for (const row of leads) {
		if (idSet.has(row.projectId)) {
			map.set(row.projectId, `${row.firstName} ${row.lastName}`);
		}
	}
	return map;
}

async function leadNameForProject(db: WattsDb, projectId: string): Promise<string | null> {
	const [row] = await db
		.select({ firstName: Members.firstName, lastName: Members.lastName })
		.from(ProjectMembers)
		.innerJoin(Members, eq(ProjectMembers.memberId, Members.id))
		.where(and(eq(ProjectMembers.projectId, projectId), eq(ProjectMembers.isLead, true)))
		.limit(1);
	return row ? `${row.firstName} ${row.lastName}` : null;
}

export async function listActiveProjects(db: WattsDb) {
	const projects = await db.select().from(Projects).where(eq(Projects.active, true));
	const leadMap = await fetchLeadNames(db, projects.map((p) => p.id));
	return projects.map((project) => ({
		...project,
		// Prefer the plain-text field; fall back to the ProjectMembers join.
		lead: project.projectLead ?? leadMap.get(project.id) ?? null,
	}));
}

export async function getProjectById(db: WattsDb, id: string) {
	const [project] = await db.select().from(Projects).where(eq(Projects.id, id)).limit(1);
	if (!project) throw new DomainError('NOT_FOUND', 'Project not found');
	return { ...project, lead: project.projectLead ?? (await leadNameForProject(db, project.id)) };
}

export async function getProjectBySlug(db: WattsDb, slug: string) {
	const [project] = await db.select().from(Projects).where(eq(Projects.slug, slug)).limit(1);
	if (!project) throw new DomainError('NOT_FOUND', 'Project not found');
	return { ...project, lead: project.projectLead ?? (await leadNameForProject(db, project.id)) };
}

export async function createProject(db: WattsDb, input: CreateProjectInput) {
	const [project] = await db
		.insert(Projects)
		.values({
			title: input.title,
			slug: input.slug ?? null,
			overview: input.overview,
			projectLead: input.projectLead ?? null,
			hardwareInfo: input.hardwareInfo ?? null,
			softwareInfo: input.softwareInfo ?? null,
			skills: input.skills ?? null,
			photoUrls: input.photoUrls ?? null,
			categoryId: input.categoryId ?? null,
			discordRoleId: input.discordRoleId ?? null,
			discordLeadRoleId: input.discordLeadRoleId ?? null,
			discordChannelId: input.discordChannelId ?? null,
		})
		.returning();
	return { project };
}

export async function updateProject(db: WattsDb, id: string, data: UpdateProjectInput) {
	const [project] = await db
		.update(Projects)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(Projects.id, id))
		.returning();
	if (!project) throw new DomainError('NOT_FOUND', 'Project not found');
	return { project };
}

export async function deleteProject(db: WattsDb, id: string) {
	const [deleted] = await db.delete(Projects).where(eq(Projects.id, id)).returning();
	if (!deleted) throw new DomainError('NOT_FOUND', 'Project not found');
}

/** Members on a project, with lead status — for the rough Staff Committees & Projects panel. */
export function listProjectMembers(db: WattsDb, projectId: string) {
	return db
		.select({
			memberId: Members.id,
			firstName: Members.firstName,
			lastName: Members.lastName,
			isLead: ProjectMembers.isLead,
		})
		.from(ProjectMembers)
		.innerJoin(Members, eq(Members.id, ProjectMembers.memberId))
		.where(eq(ProjectMembers.projectId, projectId));
}

export async function addProjectMember(db: WattsDb, projectId: string, memberId: string) {
	const [row] = await db
		.insert(ProjectMembers)
		.values({ projectId, memberId })
		.onConflictDoNothing()
		.returning();
	return row ?? null;
}

export async function removeProjectMember(db: WattsDb, projectId: string, memberId: string) {
	await db
		.delete(ProjectMembers)
		.where(and(eq(ProjectMembers.projectId, projectId), eq(ProjectMembers.memberId, memberId)));
}

export async function setProjectLead(db: WattsDb, projectId: string, memberId: string, isLead: boolean) {
	const [row] = await db
		.update(ProjectMembers)
		.set({ isLead })
		.where(and(eq(ProjectMembers.projectId, projectId), eq(ProjectMembers.memberId, memberId)))
		.returning();
	if (!row) throw new DomainError('NOT_FOUND', 'That member is not on this project');
	return row;
}

/** Is `memberId` currently flagged isLead on `projectId`? Used to gate review authority. */
export async function isProjectLead(db: WattsDb, projectId: string, memberId: string): Promise<boolean> {
	const [row] = await db
		.select({ isLead: ProjectMembers.isLead })
		.from(ProjectMembers)
		.where(and(eq(ProjectMembers.projectId, projectId), eq(ProjectMembers.memberId, memberId)))
		.limit(1);
	return row?.isLead ?? false;
}

/**
 * Self-service "request to join" a project — reviewed by a lead or officer/admin
 * before a ProjectMembers row is created. Officers/admins can still bypass this
 * entirely via addProjectMember, which grants membership instantly.
 */
export async function requestProjectMembership(db: WattsDb, projectId: string, memberId: string, message?: string) {
	const [project] = await db.select({ active: Projects.active }).from(Projects).where(eq(Projects.id, projectId)).limit(1);
	if (!project) throw new DomainError('NOT_FOUND', 'Project not found');
	if (!project.active) throw new DomainError('FORBIDDEN', 'This project is not accepting new members');

	const [existingMember] = await db
		.select({ id: ProjectMembers.id })
		.from(ProjectMembers)
		.where(and(eq(ProjectMembers.projectId, projectId), eq(ProjectMembers.memberId, memberId)))
		.limit(1);
	if (existingMember) throw new DomainError('CONFLICT', 'Already a member of this project');

	try {
		const [request] = await db
			.insert(ProjectMembershipRequests)
			.values({ projectId, memberId, requestedByMemberId: memberId, message: message ?? null })
			.returning();
		return request;
	} catch (err) {
		// Unique violation on the partial (project, member) WHERE status='pending' index.
		// drizzle-orm wraps the driver error in a DrizzleQueryError, with the pg error
		// (carrying `.code`) as `.cause` — check both shapes so this works whether the
		// pg error surfaces directly or wrapped.
		if (pgErrorCode(err) === '23505') {
			throw new DomainError('CONFLICT', 'A pending request already exists for this project');
		}
		throw err;
	}
}

function pgErrorCode(err: unknown): string | undefined {
	if (!err || typeof err !== 'object') return undefined;
	const code = (err as { code?: unknown }).code;
	if (typeof code === 'string') return code;
	const cause = (err as { cause?: unknown }).cause;
	if (cause && typeof cause === 'object') {
		const causeCode = (cause as { code?: unknown }).code;
		if (typeof causeCode === 'string') return causeCode;
	}
	return undefined;
}

export function listProjectMembershipRequests(
	db: WattsDb,
	projectId: string,
	status?: 'pending' | 'approved' | 'denied',
) {
	return db
		.select({
			id: ProjectMembershipRequests.id,
			memberId: ProjectMembershipRequests.memberId,
			firstName: Members.firstName,
			lastName: Members.lastName,
			status: ProjectMembershipRequests.status,
			message: ProjectMembershipRequests.message,
			reviewNote: ProjectMembershipRequests.reviewNote,
			createdAt: ProjectMembershipRequests.createdAt,
			reviewedAt: ProjectMembershipRequests.reviewedAt,
		})
		.from(ProjectMembershipRequests)
		.innerJoin(Members, eq(Members.id, ProjectMembershipRequests.memberId))
		.where(
			status
				? and(eq(ProjectMembershipRequests.projectId, projectId), eq(ProjectMembershipRequests.status, status))
				: eq(ProjectMembershipRequests.projectId, projectId),
		);
}

async function loadPendingRequest(db: WattsDb, requestId: string) {
	const [request] = await db
		.select()
		.from(ProjectMembershipRequests)
		.where(eq(ProjectMembershipRequests.id, requestId))
		.limit(1);
	if (!request) throw new DomainError('NOT_FOUND', 'Request not found');
	if (request.status !== 'pending') throw new DomainError('CONFLICT', 'This request has already been reviewed');
	return request;
}

/**
 * Approves a pending request — grants plain member access only, never lead.
 * Not run in a DB transaction: WattsDb may be the Neon HTTP driver, which has no
 * interactive-transaction support. addProjectMember is idempotent (onConflictDoNothing),
 * so a retry after a partial failure here is safe.
 */
export async function approveProjectMembershipRequest(
	db: WattsDb,
	requestId: string,
	reviewerMemberId: string,
	reviewNote?: string,
) {
	const request = await loadPendingRequest(db, requestId);
	await addProjectMember(db, request.projectId, request.memberId);
	const [updated] = await db
		.update(ProjectMembershipRequests)
		.set({
			status: 'approved',
			reviewedByMemberId: reviewerMemberId,
			reviewNote: reviewNote ?? null,
			reviewedAt: new Date(),
		})
		.where(eq(ProjectMembershipRequests.id, requestId))
		.returning();
	return updated;
}

export async function denyProjectMembershipRequest(
	db: WattsDb,
	requestId: string,
	reviewerMemberId: string,
	reviewNote?: string,
) {
	await loadPendingRequest(db, requestId);
	const [updated] = await db
		.update(ProjectMembershipRequests)
		.set({
			status: 'denied',
			reviewedByMemberId: reviewerMemberId,
			reviewNote: reviewNote ?? null,
			reviewedAt: new Date(),
		})
		.where(eq(ProjectMembershipRequests.id, requestId))
		.returning();
	return updated;
}

/**
 * Projects `memberId` leads, each with its pending join requests — the data a
 * non-officer lead's dashboard panel needs in one call. Renders nothing for a member
 * who isn't a lead of anything (empty array).
 */
export async function listMyLeadRequests(db: WattsDb, memberId: string) {
	const ledProjects = await db
		.select({ projectId: Projects.id, title: Projects.title })
		.from(ProjectMembers)
		.innerJoin(Projects, eq(Projects.id, ProjectMembers.projectId))
		.where(and(eq(ProjectMembers.memberId, memberId), eq(ProjectMembers.isLead, true)));

	if (ledProjects.length === 0) return [];

	const requestsByProject = await Promise.all(
		ledProjects.map((p) => listProjectMembershipRequests(db, p.projectId, 'pending')),
	);

	return ledProjects
		.map((p, i) => ({ projectId: p.projectId, title: p.title, requests: requestsByProject[i] }))
		.filter((p) => p.requests.length > 0);
}
