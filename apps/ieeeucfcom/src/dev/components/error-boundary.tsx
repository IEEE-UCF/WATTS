'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
	/** re-mount the boundary (clears the error) when this changes */
	resetKey?: unknown;
	children: ReactNode;
}
interface State {
	error: Error | null;
}

/** Catches render errors from a gallery preview so one broken component can't take
 *  down the whole page. */
export class PreviewErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidUpdate(prev: Props) {
		if (prev.resetKey !== this.props.resetKey && this.state.error) {
			this.setState({ error: null });
		}
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('[dev gallery] preview threw:', error, info.componentStack);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
					<p className="font-semibold text-destructive">
						This component threw while rendering.
					</p>
					<pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap text-destructive/90">
						{this.state.error.message}
					</pre>
					<p className="mt-2 text-xs text-muted-foreground">
						Expected for entries marked <code>broken</code>. The stack is in the
						console.
					</p>
				</div>
			);
		}
		return this.props.children;
	}
}
