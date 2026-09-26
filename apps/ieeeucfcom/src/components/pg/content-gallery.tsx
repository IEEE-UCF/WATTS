'use client';

import Image from 'next/image';
import Autoplay from 'embla-carousel-autoplay';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@watts/ui/carousel';
import type { PublicAsset } from '@watts/core/site-content';

type GalleryItem = { key: string; url: string; alt: string; animated: boolean };

/**
 * Photo carousel for committee/project pages. Deliberately simple; styling pass later.
 * Animated uploads are served `unoptimized` (Vercel doesn't transform them).
 */
export function ContentGallery({
	title,
	assets,
	legacyUrls = [],
}: {
	title: string;
	assets: PublicAsset[];
	/** Project pages: pre-CMS `photo_urls`, shown only when no gallery is curated. */
	legacyUrls?: string[];
}) {
	const items: GalleryItem[] =
		assets.length > 0
			? assets.map((a) => ({ key: a.id, url: a.url, alt: a.alt ?? title, animated: a.kind === 'animated' }))
			: legacyUrls.map((url) => ({ key: url, url, alt: title, animated: false }));

	if (items.length === 0) {
		return <p className="text-sm text-muted-foreground">Photos coming soon.</p>;
	}

	return (
		<Carousel
			opts={{ align: 'center', loop: items.length > 1 }}
			plugins={items.length > 1 ? [Autoplay({ delay: 4000, stopOnInteraction: true })] : []}
			className="mx-auto w-full max-w-3xl"
		>
			<CarouselContent>
				{items.map((item, i) => (
					<CarouselItem key={item.key}>
						<div className="relative aspect-video w-full overflow-hidden rounded-sm bg-ieee-near-black">
							<Image
								src={item.url}
								alt={item.alt}
								fill
								sizes="(min-width: 768px) 768px, 100vw"
								className="object-cover"
								unoptimized={item.animated}
								priority={i === 0}
							/>
						</div>
					</CarouselItem>
				))}
			</CarouselContent>
			{items.length > 1 && (
				<>
					<CarouselPrevious className="left-2" />
					<CarouselNext className="right-2" />
				</>
			)}
		</Carousel>
	);
}
