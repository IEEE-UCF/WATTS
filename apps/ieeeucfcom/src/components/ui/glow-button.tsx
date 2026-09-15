'use client';
import * as React from 'react';
import { cn } from '@watts/ui/cn';

interface GlowButtonProps {
	children: React.ReactNode;
	className?: string;
	innerClassName?: string;
	onClick?: React.MouseEventHandler<HTMLDivElement>;
}

/**
 * Two-layer glow CTA button.
 *
 * Usage:
 *   <GlowButton>
 *     <span className="text-white font-heading">Join Us</span>
 *   </GlowButton>
 *
 * Wrap in <Link> or <a> when the button should navigate:
 *   <Link href="/about">
 *     <GlowButton>Learn More</GlowButton>
 *   </Link>
 *
 * Use innerClassName to override padding/layout of the inner surface.
 */
export function GlowButton({ children, className, innerClassName, onClick }: GlowButtonProps) {
	return (
		<div className={cn('group relative w-fit cursor-pointer', className)} onClick={onClick}>
			{/* Glow halo — brightens on hover */}
			<div className="pointer-events-none absolute -inset-1 rounded-lg bg-gradient-to-r from-ieee-bright-yellow to-ieee-bright-yellow opacity-25 blur transition duration-700 group-hover:opacity-100 group-hover:duration-200" />
			{/* Content surface */}
			<div
				className={cn(
					'relative flex items-center justify-center gap-2 rounded-lg bg-ieee-near-black px-8 py-4 leading-none ring-1 ring-white/5',
					innerClassName,
				)}
			>
				{children}
			</div>
		</div>
	);
}
