'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardTitle } from '@watts/ui/card';
import { renderBrandedQr } from './render-branded-qr';

/**
 * Merged from two near-identical components that had drifted apart:
 * pg/memberqrcode-gen.tsx (Card wrapper, error correction 'H', fetched its own
 * profile via tRPC for the heading) and pg/memberqrcodegen.tsx (plain wrapper,
 * error correction 'L', no data fetching). Both did byte-identical canvas/logo-
 * overlay work — that part now lives in ./render-branded-qr.ts (shared with the
 * /admin/links QR builder). The tRPC/session dependency
 * is intentionally NOT in this component: a QR-rendering primitive shouldn't own
 * data fetching, so callers that want a personalized heading pass `title`
 * themselves (see components/dashboard/member-qr-code.tsx).
 */
interface MemberQrCodeProps {
	memberInfo: string;
	size?: number;
	logoUrl?: string;
	logoSize?: number;
	/** QR error correction level. The two source components disagreed (H vs L) —
	 * defaults to 'H' (better logo-overlay tolerance); pass 'L' to match the old
	 * memberqrcodegen.tsx behavior. */
	errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
	/** 'card' = @watts/ui Card wrapper, dark text (was memberqrcode-gen.tsx).
	 * 'plain' = bare div, light text (was memberqrcodegen.tsx).
	 * 'bare' = just the <img>, no heading/caption/wrapper — for callers that build
	 * their own chrome around the code (see components/dashboard/member-qr-code.tsx).
	 * Default 'card'. */
	variant?: 'card' | 'plain' | 'bare';
	/** Personalized name for the 'card' variant's heading, e.g. "Dawn's QR Code".
	 * Ignored by the 'plain' variant, which always reads "Member QR Code". */
	title?: string;
}

export function MemberQRCode({
	memberInfo,
	size = 256,
	logoUrl,
	logoSize = Math.floor(size * 0.2), // Default to 20% of QR code size
	errorCorrectionLevel = 'H',
	variant = 'card',
	title = 'Member',
}: MemberQrCodeProps) {
	const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string>('');

	const generateQRCode = async (text: string) => {
		try {
			setLoading(true);
			setError('');
			setQrCodeUrl(
				await renderBrandedQr(text, { size, logoUrl, logoSize, errorCorrectionLevel }),
			);
		} catch (err) {
			console.error('QR Code generation error:', err);
			setError('Failed to generate QR code');
		} finally {
			setLoading(false);
		}
	};

	// Generate QR code when memberInfo or other dependencies change
	useEffect(() => {
		if (memberInfo) {
			generateQRCode(memberInfo);
		}
	}, [memberInfo, size, logoUrl, logoSize, errorCorrectionLevel]);

	if (loading) {
		return (
			<div className="flex justify-center p-4 text-muted-foreground">
				Generating QR Code...
			</div>
		);
	}

	if (error) {
		return <div className="p-4 text-red-400">Error: {error}</div>;
	}

	const qrImage = qrCodeUrl && (
		<img
			src={qrCodeUrl}
			alt="Member QR Code"
			className="rounded-lg border border-border shadow-md"
			data-testid="qr-code-image"
		/>
	);

	if (variant === 'bare') {
		return qrImage || null;
	}

	if (variant === 'plain') {
		return (
			<div className="flex flex-col items-center p-4">
				<h3 className="mb-2 text-lg font-semibold text-foreground">Member QR Code</h3>
				{qrImage}
				<p className="mt-2 text-sm text-muted-foreground">Scan to access member info</p>
			</div>
		);
	}

	return (
		<Card>
			<CardTitle className="font-subheading text-lg text-white">
				{title}&apos;s QR Code
			</CardTitle>
			{qrImage}
			<p className="mb-4 text-muted-foreground">Scan to access member info</p>
		</Card>
	);
}
