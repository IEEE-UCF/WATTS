'use client';

import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

/** True when the viewport is narrower than the mobile breakpoint (768px). Tracks
 * `window.innerWidth` on resize — client-only, so it starts `false` on the server. */
export const useIsMobile = () => {
	const [isMobile, setIsMobile] = React.useState(false);

	React.useEffect(() => {
		const checkIsMobile = () => {
			setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		};
		checkIsMobile();
		window.addEventListener('resize', checkIsMobile);
		return () => window.removeEventListener('resize', checkIsMobile);
	}, []);

	return isMobile;
};
