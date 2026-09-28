import ProjectsPage from '@/components/pg/projectspage';
import { getSiteContent } from '@/lib/site-content';

import { Metadata } from 'next';

const pageTitle = 'Projects | IEEE UCF';
const pageDescription =
	'Explore IEEE UCF projects to tackle real-world challenges, build technical skills, and collaborate with peers.';

export const metadata: Metadata = {
	title: pageTitle,
	description: pageDescription,
	openGraph: {
		title: pageTitle,
		description: pageDescription,
		url: 'https://www.ieeeucf.com/projects',
		type: 'website',
	},
};

// Static + ISR: CMS media refreshes when a change is published.
export const revalidate = 3600;

export default async function Projects() {
	const { slots } = await getSiteContent();
	return (
		<div>
			<ProjectsPage heroMedia={slots['projects.hero']} />
		</div>
	);
}
