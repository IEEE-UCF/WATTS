import { DevEntryView } from '@/dev/components/entry-view';
import { entriesMeta } from '@/dev/registry/meta';

export function generateStaticParams() {
	return entriesMeta.map((e) => ({ slug: e.slug.split('/') }));
}

export const dynamicParams = true;

export default async function DevEntryPage({ params }: { params: Promise<{ slug: string[] }> }) {
	const { slug } = await params;
	return <DevEntryView slug={slug.join('/')} />;
}
