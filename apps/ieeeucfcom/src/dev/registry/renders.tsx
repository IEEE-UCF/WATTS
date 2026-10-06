'use client';

/* Slug → live preview component. Each takes the merged control values as props.
 * Kept in sync with meta.ts by hand. This module is 'use client' — it must only
 * be imported by client components (the entry view), never by a server module. */

import type { ComponentType } from 'react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@watts/ui/accordion';
import { Button } from '@watts/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@watts/ui/card';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@watts/ui/field';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@watts/ui/hover-card';
import { Input } from '@watts/ui/input';
import { Label } from '@watts/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@watts/ui/select';
import { Separator } from '@watts/ui/separator';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@watts/ui/sheet';
import { ScrollArea } from '@watts/ui/scroll-area';
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
	TableEmpty,
} from '@watts/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@watts/ui/tooltip';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { AvatarMenu } from '@/components/avatarmenu';
import Signinblock from '@/components/signin';
import { Timer } from '@/components/timer';
import { Calendar } from '@/components/calendar';
import { StaffHub } from '@/components/staff/staff-hub';
import { EventList } from '@/components/dashboard/event-list';
import { EventShowcase } from '@/components/dashboard/event-showcase';
import { Member_QR_Code } from '@/components/dashboard/member-qr-code';
import AboutIEEE from '@/components/pg/aboutieee';
import AboutHeader from '@/components/pg/aboutheader';
import { TogglePill } from '@/components/ui/toggle-pill';
import { EventManager } from '@/components/admin/event-manager';
import { SiteContentManager } from '@/components/admin/site-content/site-content-manager';
import { ContentPageView } from '@/components/pg/content-page';
import { MembersManager } from '@/components/admin/members-manager';
import { ResumeDashboard } from '@/components/admin/resume-dashboard';
import { DashboardShellView } from '@/components/shell/dashboard-shell';
import { MembershipStatus } from '@/components/dashboard/membership-status';
import { CommitteesProjects } from '@/components/dashboard/committees-projects';
import { AttendanceSummary } from '@/components/dashboard/attendance-summary';
import { ResumeStatus } from '@/components/dashboard/resume-status';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { AdminOverview } from '@/components/admin/overview';
import { CommitteesProjectsPanel } from '@/components/staff/committees-projects-panel';
import { GlowButton } from '@/components/ui/glow-button';
import { QREventScanner } from '@/components/admin/qr_event_scanner';
import { ProjectPhotos } from '@/components/admin/project-photos';
import { FormPopup } from '@/components/dashboard/newEventForm';
import { ThemePlayground } from '@/components/theme-playground';
import { AnimatedMediaCompare } from '@/dev/components/animated-media-compare';
import { EventPageView } from '@/components/pg/event-page';
import type { EventSummary } from '@watts/core/event-page';

type Render = ComponentType<Record<string, unknown>>;

const NoDemo = ({ label }: { label: string }) => (
	<p className="text-sm text-muted-foreground">{label}</p>
);

/** A sample event `days` from now at 7 PM Eastern (negative = past). */
function sampleEvent(id: string, days: number, title: string, attended?: number): EventSummary {
	const start = new Date(Date.now() + days * 86_400_000);
	start.setUTCHours(23, 0, 0, 0);
	const end = new Date(start.getTime() + 90 * 60_000);
	return {
		id,
		number: 900 + days,
		slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		title,
		startTime: start.toISOString(),
		endTime: end.toISOString(),
		allDay: false,
		timeZone: 'America/New_York',
		location: 'Sample building, room 101',
		flyerUrl: days < 0 ? null : '/events/gbm.png',
		label: { name: 'Workshop', hex: null },
		attendanceCount: days < 0 ? (attended ?? 0) : null,
	};
}

export const renders: Record<string, Render> = {
	'ui/button': (p) => (
		<Button
			variant={p.variant as never}
			size={p.size as never}
			disabled={p.disabled as boolean}
		>
			{(p.children as string) || 'Button'}
		</Button>
	),
	'ui/card': (p) => (
		<Card className="w-80">
			<CardHeader>
				<CardTitle>{(p.title as string) || 'General Body Meeting'}</CardTitle>
				<CardDescription>
					{(p.description as string) || 'Thursday · ENG2 102'}
				</CardDescription>
				{(p.withAction as boolean) && (
					<CardAction>
						<Button size="sm" variant="outline">
							RSVP
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent className="text-sm text-muted-foreground">
				Pizza, a tech talk, and project demos. Bring a friend.
			</CardContent>
			{(p.withFooter as boolean) && (
				<CardFooter className="text-xs text-muted-foreground">Doors at 6:00pm</CardFooter>
			)}
		</Card>
	),
	'ui/input': (p) => (
		<div className="w-72">
			<Input
				placeholder={(p.placeholder as string) || 'you@knights.ucf.edu'}
				disabled={p.disabled as boolean}
				aria-invalid={p.invalid as boolean}
			/>
		</div>
	),
	'ui/label': () => (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor="demo-name">Full name</Label>
			<Input id="demo-name" className="w-64" placeholder="Ada Lovelace" />
		</div>
	),
	'ui/field': (p) => (
		<div className="w-80">
			<Field data-invalid={p.invalid as boolean}>
				<FieldLabel htmlFor="demo-field">Major</FieldLabel>
				<FieldContent>
					<Input
						id="demo-field"
						placeholder="Computer Engineering"
						aria-invalid={p.invalid as boolean}
					/>
					<FieldDescription>Shown on your member profile.</FieldDescription>
					{(p.invalid as boolean) && <FieldError>Pick a major.</FieldError>}
				</FieldContent>
			</Field>
		</div>
	),
	'ui/select': () => (
		<Select>
			<SelectTrigger className="w-64">
				<SelectValue placeholder="Graduation year" />
			</SelectTrigger>
			<SelectContent>
				{['2026', '2027', '2028', '2029'].map((y) => (
					<SelectItem key={y} value={y}>
						{y}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	),
	'ui/accordion': () => (
		<Accordion type="single" collapsible className="w-80">
			{['What is IEEE?', 'How do I join?', 'Do I need to be an EE major?'].map((q, i) => (
				<AccordionItem key={q} value={`item-${i}`}>
					<AccordionTrigger>{q}</AccordionTrigger>
					<AccordionContent>
						The world&apos;s largest technical professional organization, with a very
						active UCF student branch.
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	),
	'ui/tooltip': () => (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button variant="outline">Hover me</Button>
				</TooltipTrigger>
				<TooltipContent>Membership is free for your first semester.</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	),
	'ui/hover-card': () => (
		<HoverCard>
			<HoverCardTrigger asChild>
				<Button variant="link">@ieeeucf</Button>
			</HoverCardTrigger>
			<HoverCardContent>
				<p className="text-sm">IEEE @ UCF — circuits to embedded systems.</p>
			</HoverCardContent>
		</HoverCard>
	),
	'ui/separator': () => (
		<div className="w-72 text-sm">
			<p>Officers</p>
			<Separator className="my-3" />
			<p>Committees</p>
		</div>
	),
	'ui/sheet': () => (
		<Sheet>
			<SheetTrigger asChild>
				<Button variant="outline">Open menu</Button>
			</SheetTrigger>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Navigation</SheetTitle>
					<SheetDescription>The mobile drawer should be built on this.</SheetDescription>
				</SheetHeader>
				<SheetFooter>
					<SheetClose asChild>
						<Button>Close</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	),
	'ui/scroll-area': () => (
		<ScrollArea className="h-40 w-64 rounded-md border border-border p-3 text-sm">
			{Array.from({ length: 20 }, (_, i) => (
				<p key={i} className="py-1">
					Event #{i + 1}
				</p>
			))}
		</ScrollArea>
	),
	'ui/navigation-menu': () => (
		<NoDemo label="Radix navigation menu — see layout/avatar-menu for a wired example." />
	),
	'ui/carousel': () => <NoDemo label="Embla carousel — exercised on / and /sponsorships." />,
	'ui/chart': () => (
		<NoDemo label="Recharts container — needs a dataset; no consumer in the app yet." />
	),
	'ui/table': () => (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Name</TableHead>
					<TableHead>Major</TableHead>
					<TableHead>Status</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				<TableRow>
					<TableCell>Ada Lovelace</TableCell>
					<TableCell className="text-muted-foreground">Computer Engineering</TableCell>
					<TableCell>active</TableCell>
				</TableRow>
				<TableRow inactive>
					<TableCell>Grace Hopper</TableCell>
					<TableCell className="text-muted-foreground">Electrical Engineering</TableCell>
					<TableCell>archived</TableCell>
				</TableRow>
				<TableEmpty colSpan={3}>No more rows.</TableEmpty>
			</TableBody>
		</Table>
	),
	'ui/sidebar': () => (
		<NoDemo label="App sidebar shell — to be wired into the dashboard route group." />
	),

	'layout/navbar': () => <Navbar />,
	'layout/footer': () => <Footer />,
	'layout/avatar-menu': (p) => (
		<AvatarMenu
			image={(p.image as string) || 'https://cdn.discordapp.com/embed/avatars/1.png'}
			name={(p.name as string) || 'Amara Okafor'}
			email={(p.email as string) || 'aokafor@knights.ucf.edu'}
			role={(p.role as string) || null}
			navAuth={{
				isMember: true,
				isOfficer: Boolean(p.isOfficer ?? true),
				isAdmin: Boolean(p.isAdmin ?? true),
				hasStaffAccess: true,
				permissions: ['manage_events', 'manage_event_photos', 'review_resumes'],
			}}
		/>
	),
	'marketing/signin-block': () => <Signinblock />,
	'marketing/timer': () => <Timer />,
	'marketing/animated-media': (p) => (
		<AnimatedMediaCompare
			name={(p.name as string) || '/committees/workshopgif'}
			height={(p.height as number) || 360}
		/>
	),
	'marketing/calendar': (p) => <Calendar className={(p.className as string) || 'h-96 w-full'} />,
	'marketing/about-ieee': () => <AboutIEEE />,
	'marketing/about-header': () => <AboutHeader />,
	'staff/staff-hub': () => <StaffHub />,
	'dashboard/event-list': () => <EventList />,
	'dashboard/event-showcase': () => (
		<div className="max-w-md">
			<EventShowcase />
		</div>
	),
	'dashboard/member-qr-code': () => (
		<div className="max-w-xs">
			<Member_QR_Code />
		</div>
	),
	'admin/event-manager': () => <EventManager />,
	'admin/project-photos': () => (
		<ProjectPhotos
			projectId="00000000-0000-0000-0000-000000000000"
			photoUrls={[
				'/projects/micromouse.png',
				'/projects/gnor.png',
				'/projects/pegasuscpu.png',
			]}
			onChanged={() => undefined}
		/>
	),
	'admin/site-content-manager': () => <SiteContentManager />,
	'admin/content-page-view': () => (
		<ContentPageView
			page={{
				type: 'committee',
				id: '00000000-0000-0000-0000-000000000000',
				slug: 'software',
				title: 'Software Committee',
				tagline: 'Build real software for IEEE @ UCF.',
				body: [
					'Sample about text, written by the chair.',
					'Members build and maintain the tools the branch runs on.',
				].join('\n\n'),
				leadNames: ['Sample Chair'],
				applyUrl: '/connect',
				hero: null,
				gallery: [],
				legacyPhotoUrls: [],
				project: null,
				committee: {
					chair: {
						id: 'c',
						name: 'Sample Chair',
						initials: 'SC',
						portraitUrl: null,
						detail: "Computer Science · '27",
						isLead: true,
						bio: 'A short bio from the member profile.',
						linkedinUrl: null,
					},
					memberCount: 12,
					upcoming: [0, 7].map((d, i) =>
						sampleEvent(`u${i}`, d + 3, `Sample workshop ${i + 1}`),
					),
					past: [-7, -21, -35].map((d, i) =>
						sampleEvent(`p${i}`, d, `Sample meeting ${i + 1}`, 18 - i * 4),
					),
				},
			}}
		/>
	),
	'marketing/project-detail-page': (p) => {
		const empty = Boolean(p.empty);
		const person = (id: string, name: string, detail: string, isLead = false) => ({
			id,
			name,
			initials: name
				.split(' ')
				.map((w) => w[0])
				.join(''),
			portraitUrl: null,
			detail,
			isLead,
		});
		return (
			<ContentPageView
				page={{
					type: 'project',
					id: '00000000-0000-0000-0000-000000000000',
					slug: 'gnor',
					title: 'GNOR',
					tagline: empty ? null : 'Building an autonomous rover, one sensor at a time.',
					body: empty
						? 'A short overview from the project record.'
						: 'Sample overview. Leads expand this on the page: goals, progress so far, and what new members will work on.\n\nA second paragraph for spacing.',
					leadNames: ['Sample Lead'],
					applyUrl: null,
					hero: null,
					gallery: [],
					legacyPhotoUrls: empty
						? []
						: [
								'/projects/gnor.png',
								'/projects/micromouse.png',
								'/projects/pegasuscpu.png',
							],
					project: {
						status: p.status === 'past' ? 'past' : 'current',
						category: empty ? null : 'Robotics',
						skills: empty ? [] : ['Embedded C', 'PCB design', 'Computer vision'],
						hardware: empty ? [] : ['Jetson Nano', 'LiDAR'],
						software: empty ? [] : ['Python', 'ROS 2'],
						team: empty
							? []
							: [
									person('1', 'Sample Lead', "Computer Engineering · '26", true),
									person('2', 'Alex Member', "Electrical Engineering · '27"),
									person('3', 'Sam Member', "Computer Science · '28"),
									person('4', 'Riley Member', "Mechanical Engineering · '27"),
								],
					},
					committee: null,
				}}
			/>
		);
	},
	'marketing/event-detail-page': (p) => {
		const past = p.state === 'past';
		const base = sampleEvent('e', past ? -3 : 3, 'GBM #3: Industry Night', 42);
		return (
			<EventPageView
				pageUrl="https://www.ieeeucf.com/events/sample"
				event={{
					...base,
					slug: 'sample',
					flyerUrl: '/events/gbm.png',
					label: { name: 'General Body Meeting', hex: null },
					description:
						'Sample description from the event form. Sponsors give short talks, then tables open for résumé reviews.',
					rsvpLink: p.rsvp === false ? null : 'https://example.com/rsvp',
					requiresDues: Boolean(p.dues),
					room: null,
					committee: { title: 'Professional Development', slug: null },
					isPast: past,
					photos: past
						? [
								'/committees/prodev1.jpg',
								'/committees/prodev2.jpg',
								'/events/mentor.png',
							].map((url, i) => ({ id: String(i), url, caption: null }))
						: [],
					more: [4, 8, 11].map((d, i) =>
						sampleEvent(`m${i}`, d, `Sample event ${i + 1}`),
					),
				}}
			/>
		);
	},
	'admin/members-manager': () => <MembersManager />,
	'admin/resume-dashboard': () => <ResumeDashboard />,
	'admin/toggle-pill': (p) => (
		<TogglePill selected={Boolean(p.selected)} tone={p.tone as never} size={p.size as never}>
			{(p.children as string) || 'Toggle'}
		</TogglePill>
	),
	'dashboard/membership-status': (p) => (
		<div className="max-w-xs">
			<MembershipStatus
				duesPaid={Boolean(p.duesPaid)}
				officerStatus={Boolean(p.officerStatus)}
				officerRole={(p.officerRole as string) || null}
				memberSince={(p.memberSince as string) || 'Aug 2024'}
			/>
		</div>
	),
	'dashboard/committees-projects': () => (
		<div className="max-w-md">
			<CommitteesProjects
				committees={[{ title: 'Corporate Relations', isChair: false }]}
				projects={[{ title: 'Micromouse', isLead: true }]}
			/>
		</div>
	),
	'dashboard/attendance-summary': () => {
		const now = Date.now();
		return (
			<div className="max-w-xs">
				<AttendanceSummary
					attendance={[
						{
							eventId: '1',
							title: 'GBM 1',
							startTime: '',
							attendedAt: new Date(now - 5 * 86400000),
						},
						{
							eventId: '2',
							title: 'GBM 2',
							startTime: '',
							attendedAt: new Date(now - 40 * 86400000),
						},
						{
							eventId: '3',
							title: 'GBM 3',
							startTime: '',
							attendedAt: new Date(now - 41 * 86400000),
						},
						{
							eventId: '4',
							title: 'GBM 4',
							startTime: '',
							attendedAt: new Date(now - 95 * 86400000),
						},
					]}
				/>
			</div>
		);
	},
	'dashboard/resume-status': (p) => (
		<div className="max-w-xs">
			<ResumeStatus
				resumeUploadedAt={p.uploaded ? new Date() : null}
				canUploadResume={Boolean(p.canUpload ?? true)}
			/>
		</div>
	),
	'dashboard/onboarding-checklist': (p) => (
		<div className="max-w-md">
			<OnboardingChecklist
				discordId={p.discordLinked ? 'x' : null}
				ieeeMembershipNumber={p.ieeeNumber ? '12345' : null}
				knightConnectLinked={Boolean(p.knightConnect)}
				resumeUploadedAt={p.resume ? new Date() : null}
				canUploadResume={Boolean(p.canUploadResume ?? true)}
				biography={p.personalDetails ? 'bio' : null}
				linkedinURL={null}
				githubURL={null}
				websiteURL={null}
				hasOrg={Boolean(p.hasOrg)}
			/>
		</div>
	),
	'admin/overview': () => <AdminOverview />,
	'staff/committees-projects-panel': () => (
		<div className="max-w-lg">
			<CommitteesProjectsPanel />
		</div>
	),
	'layout/dashboard-shell': (p) => (
		<DashboardShellView
			pathname={(p.pathname as string) || '/admin/events'}
			auth={{
				isMember: true,
				isOfficer: Boolean(p.isOfficer ?? true),
				isAdmin: Boolean(p.isAdmin ?? true),
				hasStaffAccess: true,
				permissions: ['manage_events', 'manage_event_photos', 'review_resumes'],
				discordAvatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
				name: 'Amara Okafor',
				email: 'aokafor@knights.ucf.edu',
				role: (p.isAdmin ?? true) ? 'Administrator' : 'Officer · Workshop Chair',
			}}
		>
			<div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
				Routed page content renders here.
			</div>
		</DashboardShellView>
	),
	'marketing/glow-button': (p) => (
		<GlowButton innerClassName={(p.innerClassName as string) || undefined}>
			<span className="font-heading text-white">
				{(p.children as string) || 'Get Involved'}
			</span>
		</GlowButton>
	),
	'qr/event-scanner': () => <QREventScanner />,
	'admin/create-event-form': () => <FormPopup />,
	'misc/theme-playground': (p) => (
		<ThemePlayground pageName={(p.pageName as string) || 'Component gallery'} />
	),
};
