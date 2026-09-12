'use client';
import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Card, CardTitle } from '@watts/ui/card';

/**
 * Merged from two near-identical components that had drifted apart:
 * pg/memberqrcode-gen.tsx (Card wrapper, error correction 'H', fetched its own
 * profile via tRPC for the heading) and pg/memberqrcodegen.tsx (plain wrapper,
 * error correction 'L', no data fetching). Both did byte-identical canvas/logo-
 * overlay work — that part is kept verbatim below. The tRPC/session dependency
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
	 * 'plain' = bare div, light text (was memberqrcodegen.tsx). Default 'card'. */
	variant?: 'card' | 'plain';
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

			// Generate base QR code
			const qrDataUrl = await QRCode.toDataURL(text, {
				width: size,
				errorCorrectionLevel,
				margin: 2,
			});

			// If no logo, use the QR code as-is
			if (!logoUrl) {
				setQrCodeUrl(qrDataUrl);
				return;
			}

			// Create canvas for logo overlay
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas not supported');

			canvas.width = size;
			canvas.height = size;

			// Load and draw QR code
			const qrImage = new Image();
			qrImage.crossOrigin = 'anonymous';

			await new Promise((resolve, reject) => {
				qrImage.onload = resolve;
				qrImage.onerror = reject;
				qrImage.src = qrDataUrl;
			});

			ctx.drawImage(qrImage, 0, 0, size, size);

			// Load and draw logo
			const logoImage = new Image();
			logoImage.crossOrigin = 'anonymous'; // Handle CORS for external images

			await new Promise((resolve) => {
				logoImage.onload = resolve;
				logoImage.onerror = () => {
					console.warn('Logo failed to load, using QR without logo');
					resolve(null);
				};
				logoImage.src = logoUrl;
			});

			if (logoImage.complete && logoImage.naturalWidth > 0) {
				// Create circular background for logo
				const centerX = size / 2;
				const centerY = size / 2;
				const logoRadius = logoSize / 2;

				// Draw white circular background
				ctx.fillStyle = 'white';
				ctx.beginPath();
				ctx.arc(centerX, centerY, logoRadius + 4, 0, 2 * Math.PI);
				ctx.fill();

				// Draw logo in circle (clipped)
				ctx.save();
				ctx.beginPath();
				ctx.arc(centerX, centerY, logoRadius, 0, 2 * Math.PI);
				ctx.clip();
				ctx.drawImage(
					logoImage,
					centerX - logoRadius,
					centerY - logoRadius,
					logoSize,
					logoSize,
				);
				ctx.restore();
			}

			setQrCodeUrl(canvas.toDataURL());
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
