'use client';

import { useMemo, useState } from 'react';
import { getMeta } from '../registry/meta';
import { renders } from '../registry/renders';
import { ControlsPanel, defaultProps } from './controls-panel';
import { PreviewFrame } from './preview-frame';

const STATUS_COPY: Record<string, string> = {
	ok: 'Renders and works standalone.',
	legacy: 'Renders, but needs live data or a session — expect a loading / signed-out state.',
	broken: 'Known to throw — the preview error boundary will catch it.',
};

export function DevEntryView({ slug }: { slug: string }) {
	const meta = getMeta(slug);
	const Render = renders[slug];
	const [props, setProps] = useState<Record<string, unknown>>(() => defaultProps(meta?.controls));

	const activeVariant = useMemo(() => JSON.stringify(props), [props]);

	if (!meta || !Render) {
		return (
			<div className="mx-auto max-w-3xl">
				<h1 className="t-h2">Not found</h1>
				<p className="mt-2 text-muted-foreground">
					No gallery entry for <code>{slug}</code>.
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-6">
			<header>
				<div className="flex flex-wrap items-baseline gap-3">
					<h1 className="t-h1">{meta.name}</h1>
					<code className="text-sm text-muted-foreground">{meta.source}</code>
					<span className="rounded-full border border-border px-2 py-0.5 text-xs uppercase">
						{meta.status}
					</span>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">{STATUS_COPY[meta.status]}</p>
				{meta.notes && (
					<p className="mt-2 max-w-2xl text-sm text-muted-foreground">{meta.notes}</p>
				)}
			</header>

			<PreviewFrame resetKey={activeVariant} defaultSurface={meta.surface ?? 'app'}>
				<Render {...props} />
			</PreviewFrame>

			<div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
				<section>
					<h2 className="t-h5">Props</h2>
					<div className="mt-3">
						<ControlsPanel
							controls={meta.controls ?? []}
							values={props}
							onChange={setProps}
							onReset={() => setProps(defaultProps(meta.controls))}
						/>
					</div>
				</section>

				{meta.variants && meta.variants.length > 0 && (
					<section>
						<h2 className="t-h5">Variants</h2>
						<div className="mt-3 flex flex-col gap-1.5">
							{meta.variants.map((v) => (
								<button
									key={v.name}
									type="button"
									onClick={() =>
										setProps({ ...defaultProps(meta.controls), ...v.props })
									}
									className="rounded-md border border-input px-2.5 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
								>
									{v.name}
								</button>
							))}
						</div>
					</section>
				)}
			</div>
		</div>
	);
}
