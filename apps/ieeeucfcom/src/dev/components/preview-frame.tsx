'use client';

import { useState } from 'react';
import { cn } from '@watts/ui/cn';
import { PreviewErrorBoundary } from './error-boundary';

const WIDTHS = [
	{ label: 'sm', px: 375 },
	{ label: 'md', px: 768 },
	{ label: 'lg', px: 1024 },
	{ label: 'full', px: 0 },
] as const;

interface Props {
	/** changes to this string reset the error boundary (e.g. serialised props) */
	resetKey?: string;
	defaultSurface?: 'marketing' | 'app';
	children: React.ReactNode;
}

/** The preview stage: viewport-width picker + light/marketing surface toggle + a
 *  render error boundary. */
export function PreviewFrame({ resetKey, defaultSurface = 'app', children }: Props) {
	const [width, setWidth] = useState<number>(0);
	const [surface, setSurface] = useState<'marketing' | 'app'>(defaultSurface);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<span className="text-muted-foreground">viewport</span>
				{WIDTHS.map((w) => (
					<button
						key={w.label}
						type="button"
						onClick={() => setWidth(w.px)}
						className={cn(
							'rounded-md border border-input px-2 py-1',
							width === w.px
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent hover:text-accent-foreground',
						)}
					>
						{w.label}
						{w.px > 0 ? ` · ${w.px}` : ''}
					</button>
				))}
				<span className="ml-3 text-muted-foreground">surface</span>
				{(['app', 'marketing'] as const).map((s) => (
					<button
						key={s}
						type="button"
						onClick={() => setSurface(s)}
						className={cn(
							'rounded-md border border-input px-2 py-1',
							surface === s
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent hover:text-accent-foreground',
						)}
					>
						{s}
					</button>
				))}
			</div>

			<div className="overflow-x-auto rounded-lg border border-border">
				<div
					className={cn(
						'mx-auto min-h-40 p-6',
						surface === 'marketing'
							? 'theme-marketing bg-background text-foreground'
							: 'bg-background',
					)}
					style={width > 0 ? { width, maxWidth: '100%' } : undefined}
				>
					<PreviewErrorBoundary resetKey={resetKey}>{children}</PreviewErrorBoundary>
				</div>
			</div>
		</div>
	);
}
