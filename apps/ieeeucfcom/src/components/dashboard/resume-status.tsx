import { Card, CardTitle } from '@watts/ui/card';

export interface ResumeStatusProps {
	resumeUploadedAt: Date | null;
}

/** A one-line nudge, not a duplicate of the full upload form on /settings. */
export function ResumeStatus({ resumeUploadedAt }: ResumeStatusProps) {
	return (
		<Card className="gap-3 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<CardTitle className="text-sm font-semibold text-foreground">Résumé</CardTitle>
			{resumeUploadedAt ? (
				<div className="flex items-center justify-between text-sm">
					<span className="rounded-full bg-ieee-dark-yellow px-2.5 py-0.5 text-xs font-semibold text-black">
						Uploaded
					</span>
					<span className="font-mono text-xs text-muted-foreground-dim">
						{new Date(resumeUploadedAt).toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric',
							year: 'numeric',
						})}
					</span>
				</div>
			) : (
				<a
					href="/settings"
					className="inline-flex w-fit items-center rounded-md border border-input px-3 py-1.5 text-xs text-foreground hover:border-ieee-dark-yellow hover:text-ieee-dark-yellow"
				>
					Add résumé in Settings →
				</a>
			)}
		</Card>
	);
}
