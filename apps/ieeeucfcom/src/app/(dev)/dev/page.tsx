import Link from 'next/link';
import { entriesMeta, groupedMeta } from '@/dev/registry/meta';
import { GROUP_LABELS } from '@/dev/registry/types';

export default function DevIndexPage() {
	const groups = groupedMeta();
	const counts = {
		total: entriesMeta.length,
		ok: entriesMeta.filter((e) => e.status === 'ok').length,
		legacy: entriesMeta.filter((e) => e.status === 'legacy').length,
		broken: entriesMeta.filter((e) => e.status === 'broken').length,
	};

	return (
		<div className="mx-auto max-w-4xl">
			<h1 className="t-h1">Component gallery</h1>
			<p className="mt-2 text-muted-foreground">
				Every component the website ships — {counts.total} entries · {counts.ok} ok ·{' '}
				{counts.legacy} legacy · {counts.broken} broken. Pick one to preview it, edit its
				props live, resize the viewport, and flip between the app and marketing surfaces.
			</p>

			<div className="mt-8 flex flex-col gap-8">
				{groups.map(({ group, entries }) => (
					<section key={group}>
						<h2 className="t-h4">{GROUP_LABELS[group]}</h2>
						<div className="mt-3 grid gap-2 sm:grid-cols-2">
							{entries.map((e) => (
								<Link
									key={e.slug}
									href={`/dev/${e.slug}`}
									className="rounded-lg border border-border p-3 hover:bg-accent hover:text-accent-foreground"
								>
									<div className="flex items-center justify-between">
										<span className="font-medium">{e.name}</span>
										<span className="text-[10px] text-muted-foreground uppercase">
											{e.status}
										</span>
									</div>
									<code className="text-xs text-muted-foreground">
										{e.source}
									</code>
								</Link>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
