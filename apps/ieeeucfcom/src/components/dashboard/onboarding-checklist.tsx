import { Card, CardTitle } from '@watts/ui/card';

export interface OnboardingChecklistProps {
	discordId: string | null;
	ieeeMembershipNumber: string | null;
	knightConnectLinked: boolean;
	resumeUploadedAt: Date | null;
	/** storage.resumeUploadPolicy's canUpload — résumé upload is audience-gated
	 * (RESUME_UPLOAD_AUDIENCE, currently officers + a pilot cohort), so most members
	 * can't act on this item yet. It's only included below if it's actually reachable. */
	canUploadResume: boolean;
	biography: string | null;
	linkedinURL: string | null;
	githubURL: string | null;
	websiteURL: string | null;
	hasOrg: boolean;
}

function Row({
	done,
	label,
	cta,
}: {
	done: boolean;
	label: string;
	cta?: { href: string; text: string };
}) {
	return (
		<div className="flex items-center gap-3 py-2 text-sm">
			<span
				className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded border text-[11px] ${
					done
						? 'border-green-700 bg-green-800/70 text-green-200'
						: 'border-input text-transparent'
				}`}
			>
				✓
			</span>
			<span
				className={
					done
						? 'flex-1 text-muted-foreground line-through decoration-border'
						: 'flex-1 text-foreground'
				}
			>
				{label}
			</span>
			{!done && cta && (
				<a
					href={cta.href}
					className="font-mono text-xs text-ieee-dark-yellow hover:underline"
				>
					{cta.text}
				</a>
			)}
		</div>
	);
}

/** Real column checks, six of them. Renders nothing once all six are true — this is the
 * new-member experience, not a permanent fixture. */
export function OnboardingChecklist(props: OnboardingChecklistProps) {
	const hasPersonalDetails = Boolean(
		props.biography || props.linkedinURL || props.githubURL || props.websiteURL,
	);

	const items = [
		{ done: Boolean(props.discordId), label: 'Link your Discord account' },
		{
			done: Boolean(props.ieeeMembershipNumber),
			label: 'Add your IEEE membership number',
			cta: { href: '/settings', text: 'Settings →' },
		},
		{
			done: props.knightConnectLinked,
			label: 'Connect on KnightConnect',
			cta: { href: '/settings', text: 'Settings →' },
		},
		// Only a real item for someone who can actually act on it — if upload isn't open
		// to them yet, an already-uploaded résumé still counts as done, but "not yet
		// uploaded + can't upload" isn't a to-do, it's just not applicable.
		...(props.canUploadResume || props.resumeUploadedAt
			? [
					{
						done: Boolean(props.resumeUploadedAt),
						label: 'Upload a résumé',
						cta: { href: '/settings', text: 'Settings →' },
					},
				]
			: []),
		{
			done: hasPersonalDetails,
			label: 'Fill out your personal details',
			cta: { href: '/settings', text: 'Settings →' },
		},
		{
			done: props.hasOrg,
			label: 'Join a committee or project (Coming Soon!)',
			cta: { href: '/connect', text: 'Connect →' },
		},
	];

	if (items.every((i) => i.done)) return null;

	const doneCount = items.filter((i) => i.done).length;

	return (
		<Card className="gap-3 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<CardTitle className="text-sm font-semibold text-foreground">Get set up</CardTitle>
			<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
				<div
					className="h-full bg-ieee-dark-yellow"
					style={{ width: `${(doneCount / items.length) * 100}%` }}
				/>
			</div>
			<div className="flex flex-col divide-y divide-border">
				{items.map((item) => (
					<Row key={item.label} {...item} />
				))}
			</div>
		</Card>
	);
}
