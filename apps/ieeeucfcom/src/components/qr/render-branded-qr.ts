import QRCode from 'qrcode';

/** The IEEE UCF icon every branded QR carries in its centre. */
export const QR_LOGO_URL = '/iconography/ieeeucficon.png';

export interface BrandedQrOptions {
	/** Output width/height in px. */
	size: number;
	logoUrl?: string;
	/** Logo diameter in px. Default 20% of `size`. */
	logoSize?: number;
	/** White ring around the logo, in px. */
	logoPadding?: number;
	/** 'H' tolerates the centre logo best. */
	errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
	/** Quiet zone, in modules. The QR spec asks for 4; on-screen badges use 2. */
	margin?: number;
}

/**
 * Draw `text` as a QR code with the logo clipped into a white circle in the middle, on a
 * canvas (browser only). If the logo can't load, the plain QR is returned.
 */
export async function renderBrandedQrCanvas(
	text: string,
	{
		size,
		logoUrl,
		logoSize = Math.floor(size * 0.2),
		logoPadding = 4,
		errorCorrectionLevel = 'H',
		margin = 2,
	}: BrandedQrOptions,
): Promise<HTMLCanvasElement> {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	await QRCode.toCanvas(canvas, text, { width: size, errorCorrectionLevel, margin });
	if (!logoUrl) return canvas;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas not supported');

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
		const centerX = size / 2;
		const centerY = size / 2;
		const logoRadius = logoSize / 2;

		// White circular background
		ctx.fillStyle = 'white';
		ctx.beginPath();
		ctx.arc(centerX, centerY, logoRadius + logoPadding, 0, 2 * Math.PI);
		ctx.fill();

		// Logo, clipped to a circle
		ctx.save();
		ctx.beginPath();
		ctx.arc(centerX, centerY, logoRadius, 0, 2 * Math.PI);
		ctx.clip();
		ctx.drawImage(logoImage, centerX - logoRadius, centerY - logoRadius, logoSize, logoSize);
		ctx.restore();
	}
	return canvas;
}

/** Same as `renderBrandedQrCanvas`, as a PNG data URL (for an <img>). */
export async function renderBrandedQr(text: string, opts: BrandedQrOptions): Promise<string> {
	return (await renderBrandedQrCanvas(text, opts)).toDataURL('image/png');
}

/** Same as `renderBrandedQrCanvas`, as a PNG Blob (for downloading / sharing). */
export async function renderBrandedQrBlob(text: string, opts: BrandedQrOptions): Promise<Blob> {
	const canvas = await renderBrandedQrCanvas(text, opts);
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Could not create PNG'))),
			'image/png',
		),
	);
}

/**
 * Save a PNG. On phones, the share sheet ("Save Image", AirDrop, Messages) is the only
 * reliable route — iOS Safari ignores <a download>. Elsewhere, a normal download.
 */
export async function saveQrPng(blob: Blob, filename: string): Promise<void> {
	const file = new File([blob], filename, { type: 'image/png' });
	const coarse =
		typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
	if (coarse && navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title: filename });
			return;
		} catch (e) {
			if ((e as Error).name === 'AbortError') return; // closed the share sheet
		}
	}
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
