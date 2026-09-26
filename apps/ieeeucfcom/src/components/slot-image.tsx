import Image, { type ImageProps } from 'next/image';
import type { PublicAsset } from '@watts/core/site-content';
import { getSlotDefinition, type SlotKey } from '@watts/core/site-media-slots';
import { AnimatedMedia } from '@/components/animated-media';

type SlotImageProps = Omit<ImageProps, 'src' | 'unoptimized' | 'loader' | 'placeholder'> & {
	slot: SlotKey;
	/** The uploaded asset for this slot, from getSiteContent().slots — absent ⇒ code default. */
	media?: PublicAsset | null;
};

/**
 * A CMS-managed image spot. With an uploaded asset it renders that (animated assets
 * `unoptimized`, since Vercel doesn't transform them); without one it renders the
 * slot's code default exactly as the page did before the CMS.
 */
export function SlotImage({ slot, media, alt, width, height, fill, ...rest }: SlotImageProps) {
	const def = getSlotDefinition(slot);

	if (media && media.kind !== 'document') {
		return (
			<Image
				{...rest}
				src={media.url}
				alt={media.alt ?? alt}
				fill={fill}
				width={fill ? undefined : (media.width ?? width)}
				height={fill ? undefined : (media.height ?? height)}
				unoptimized={media.kind === 'animated'}
			/>
		);
	}

	if (!def) return null;
	if (def.kind === 'animated') {
		return (
			<AnimatedMedia
				{...rest}
				name={def.defaultSrc}
				alt={alt}
				fill={fill}
				width={width}
				height={height}
			/>
		);
	}
	return <Image {...rest} src={def.defaultSrc} alt={alt} fill={fill} width={width} height={height} />;
}
