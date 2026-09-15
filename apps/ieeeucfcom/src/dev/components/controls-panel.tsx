'use client';

import type { ControlDef } from '../registry/types';

export function defaultProps(controls: ControlDef[] = []): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const c of controls) if (c.default !== undefined) out[c.name] = c.default;
	return out;
}

interface Props {
	controls: ControlDef[];
	values: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	onReset: () => void;
}

export function ControlsPanel({ controls, values, onChange, onReset }: Props) {
	if (controls.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No editable props declared for this entry.
			</p>
		);
	}

	const set = (name: string, value: unknown) => onChange({ ...values, [name]: value });

	return (
		<div className="flex flex-col gap-4">
			{controls.map((c) => {
				const value = values[c.name] ?? c.default;
				const label = c.label ?? c.name;
				return (
					<label key={c.name} className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium">
							{label} <code className="text-xs text-muted-foreground">{c.name}</code>
						</span>

						{c.type === 'text' && (
							<input
								type="text"
								value={(value as string) ?? ''}
								onChange={(e) => set(c.name, e.target.value)}
								className="rounded-md border border-input bg-background px-2.5 py-1.5"
							/>
						)}

						{c.type === 'number' && (
							<input
								type="number"
								value={(value as number) ?? 0}
								min={c.min}
								max={c.max}
								step={c.step}
								onChange={(e) => set(c.name, Number(e.target.value))}
								className="rounded-md border border-input bg-background px-2.5 py-1.5"
							/>
						)}

						{c.type === 'boolean' && (
							<input
								type="checkbox"
								checked={Boolean(value)}
								onChange={(e) => set(c.name, e.target.checked)}
								className="size-4 self-start"
							/>
						)}

						{c.type === 'select' && (
							<select
								value={(value as string) ?? ''}
								onChange={(e) => set(c.name, e.target.value)}
								className="rounded-md border border-input bg-background px-2.5 py-1.5"
							>
								{c.options.map((o) => (
									<option key={o} value={o}>
										{o}
									</option>
								))}
							</select>
						)}
					</label>
				);
			})}

			<button
				type="button"
				onClick={onReset}
				className="self-start rounded-md border border-input px-2.5 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
			>
				Reset to defaults
			</button>
		</div>
	);
}
