import * as React from 'react';

import { cn } from './cn';

/**
 * Consolidates 3 independently hand-rolled admin <table>s (event-manager,
 * members-manager, resume-dashboard in @watts/web) that had already converged
 * on the same wrapper/header/row shape — semantic tokens only, no brand
 * colors, so this lives in @watts/ui rather than app-local.
 */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
	return (
		<div className="overflow-x-auto rounded-lg border border-border">
			<table
				data-slot="table"
				className={cn('w-full text-left text-sm', className)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
	return (
		<thead
			data-slot="table-header"
			className={cn('bg-card text-muted-foreground', className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
	return <tbody data-slot="table-body" className={className} {...props} />;
}

interface TableRowProps extends React.ComponentProps<'tr'> {
	/** Applies the shared opacity-50 dimming used for inactive/excluded rows. */
	inactive?: boolean;
}

function TableRow({ className, inactive, ...props }: TableRowProps) {
	return (
		<tr
			data-slot="table-row"
			className={cn('border-t border-border', inactive && 'opacity-50', className)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
	return <th data-slot="table-head" className={cn('px-3 py-2', className)} {...props} />;
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
	return <td data-slot="table-cell" className={cn('px-3 py-2', className)} {...props} />;
}

/** A full-width "no rows" message row — pass the table's real column count. */
function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
	return (
		<tr data-slot="table-empty">
			<td colSpan={colSpan} className="px-3 py-6 text-center text-muted-foreground-dim">
				{children}
			</td>
		</tr>
	);
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty };
