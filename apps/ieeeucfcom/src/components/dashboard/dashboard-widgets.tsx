'use client';

import { trpc } from '@/lib/trpc/client';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { MembershipStatus } from '@/components/dashboard/membership-status';
import { CommitteesProjects } from '@/components/dashboard/committees-projects';
import { AttendanceSummary } from '@/components/dashboard/attendance-summary';
import { ResumeStatus } from '@/components/dashboard/resume-status';
import { OfficerQuickTools } from '@/components/dashboard/officer-quick-tools';

/** The six member-dashboard widgets, fed by one shared getMyDashboard call — mirrors how
 * DashboardShellView separates data-fetching from presentation. */
export function DashboardWidgets() {
	const { data } = trpc.member.getMyDashboard.useQuery();
	const { data: auth } = trpc.auth.getAuthStatus.useQuery();

	if (!data) return null;
	const { member, committees, projects, attendance } = data;

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-4">
			<OnboardingChecklist
				discordId={member.discordId}
				ieeeMembershipNumber={member.ieeeMembershipNumber}
				knightConnectLinked={member.knightConnectLinked}
				resumeUploadedAt={member.resumeUploadedAt}
				biography={member.biography}
				linkedinURL={member.linkedinURL}
				githubURL={member.githubURL}
				websiteURL={member.websiteURL}
				hasOrg={committees.length + projects.length > 0}
			/>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<MembershipStatus
					duesPaid={member.duesPaid}
					officerStatus={member.officerStatus}
					officerRole={member.officerRole}
					memberSince={new Date(member.createdAt).toLocaleDateString(undefined, {
						month: 'short',
						year: 'numeric',
					})}
				/>
				<AttendanceSummary attendance={attendance} />
				<ResumeStatus resumeUploadedAt={member.resumeUploadedAt} />
				<CommitteesProjects committees={committees} projects={projects} />
			</div>

			{auth && <OfficerQuickTools isOfficer={auth.isOfficer} isAdmin={auth.isAdmin} />}
		</div>
	);
}
