import { HomeClient } from '@/components/pg/home-client';
import { getSiteContent } from '@/lib/site-content';

// Static + ISR: CMS media is cached and refreshed when a change is published.
export const revalidate = 3600;

export default async function Home() {
	const { slots } = await getSiteContent();
	return <HomeClient slots={slots} />;
}
