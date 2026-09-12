import { Card, CardTitle } from '@watts/ui/card';

export interface CommitteesProjectsProps {
	committees: { title: string; isChair: boolean }[];
	projects: { title: string; isLead: boolean }[];
}

/** Renders nothing if the member isn't on anything yet — not an empty card. */
export function CommitteesProjects({ committees, projects }: CommitteesProjectsProps) {
	if (committees.length === 0 && projects.length === 0) return null;

	return (
		<Card className="gap-3 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<CardTitle className="text-sm font-semibold text-foreground">
				My committees &amp; projects
			</CardTitle>
			<div className="flex flex-wrap gap-2">
				{committees.map((c) => (
					<span
						key={c.title}
						className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground"
					>
						{c.title} <span className="text-muted-foreground-dim">committee</span>
						{c.isChair && (
							<span className="rounded bg-ieee-dark-yellow px-1 py-0.5 font-mono text-[9px] text-black">
								chair
							</span>
						)}
					</span>
				))}
				{projects.map((p) => (
					<span
						key={p.title}
						className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground"
					>
						{p.title} <span className="text-muted-foreground-dim">project</span>
						{p.isLead && (
							<span className="rounded bg-ieee-dark-yellow px-1 py-0.5 font-mono text-[9px] text-black">
								lead
							</span>
						)}
					</span>
				))}
			</div>
		</Card>
	);
}
