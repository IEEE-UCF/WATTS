import localFont from 'next/font/local';

/**
 * Open Sans, self-hosted. Exposes the family on the `--font-open-sans` CSS
 * variable, which `@watts/ui/theme.css` wires into `--font-sans` (and therefore
 * every `t-*` typography utility and Tailwind's `font-sans`).
 *
 * The .ttf files under public/fonts are the originals; converting them to woff2
 * is a tracked follow-up (smaller, and `next/font` can subset them).
 */
export const openSans = localFont({
	variable: '--font-open-sans',
	display: 'swap',
	src: [
		{ path: '../../public/fonts/OpenSans-Light.ttf', weight: '300', style: 'normal' },
		{ path: '../../public/fonts/OpenSans-LightItalic.ttf', weight: '300', style: 'italic' },
		{ path: '../../public/fonts/OpenSans-Medium.ttf', weight: '500', style: 'normal' },
		{ path: '../../public/fonts/OpenSans-MediumItalic.ttf', weight: '500', style: 'italic' },
		{ path: '../../public/fonts/OpenSans-Bold.ttf', weight: '700', style: 'normal' },
		{ path: '../../public/fonts/OpenSans-BoldItalic.ttf', weight: '700', style: 'italic' },
		{ path: '../../public/fonts/OpenSans-ExtraBold.ttf', weight: '800', style: 'normal' },
		{ path: '../../public/fonts/OpenSans-ExtraBoldItalic.ttf', weight: '800', style: 'italic' },
	],
});
