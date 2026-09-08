import { and, eq } from 'drizzle-orm';
import type { WattsDb } from '@watts/db';
import { Projects, ProjectMembers, Members } from '@watts/db/schema';
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
	discordRoleId?: string;
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
			discordRoleId: input.discordRoleId ?? null,
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
