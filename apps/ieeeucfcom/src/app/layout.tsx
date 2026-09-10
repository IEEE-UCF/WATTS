import type { Metadata } from 'next';
import './globals.css';
import { openSans } from './fonts';
import { Providers } from './providers';

const siteUrl = process.env.NEXTAUTH_URL ?? 'https://ieeeucf.com';

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: 'IEEE UCF Student Chapter',
	description:
		'IEEE UCF is the largest electrical engineering organization at UCF. We host EE and CS projects, workshops, and professional events.',
	icons: {
		icon: '/iconography/ieeeucficon.png',
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={openSans.variable}>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
