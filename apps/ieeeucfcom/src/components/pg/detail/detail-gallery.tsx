import Image from 'next/image';

export interface GalleryImage {
	key: string;
	url: string;
	alt: string;
	animated?: boolean;
}

/**
 * Photo grid for detail pages: up to three across on desktop, two on phones. Returns
 * nothing when there are no photos, so the section can be left out entirely.
 */
export function DetailGallery({ images }: { images: GalleryImage[] }) {
	if (images.length === 0) return null;
	return (
		<ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
			{images.map((img) => (
				<li
					key={img.key}
					className="relative aspect-[4/3] overflow-hidden rounded-sm bg-ieee-near-black"
				>
					<Image
						src={img.url}
						alt={img.alt}
						fill
						sizes="(min-width: 768px) 33vw, 50vw"
						className="object-cover"
						unoptimized={img.animated}
					/>
				</li>
			))}
		</ul>
	);
}
