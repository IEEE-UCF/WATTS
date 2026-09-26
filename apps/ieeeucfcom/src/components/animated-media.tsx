import Image, { type ImageProps } from 'next/image';
import { cn } from '@watts/ui/cn';

/**
 * Animated hero / carousel media with a swappable delivery format, so the options can be
 * compared on real pages before one is picked.
 *
 *   gif    `<name>.gif`          the original animated GIF (today's behaviour)
 *   webp   `<name>.webp`         same frames / size / timing, a fraction of the bytes (default)
 *   static `<name>-static.webp`  first frame only — comparison option, loses the animation
 *   video  `<name>.webm|.mp4`    muted looping <video>, poster = the static frame (files not
 *                                generated yet — see scripts/ieeeucfcom/gif-to-webp.mjs)
 *
 * gif / webp are served with `unoptimized`: Vercel doesn't transform animated images, so
 * routing them through /_next/image only adds cache reads/writes for no benefit.
 *
 * Site-wide default: NEXT_PUBLIC_ANIMATED_MEDIA=gif|webp|static|video (build-time). Any
 * instance can override with `mode`. `name` is the public path without an extension.
 */
export type AnimatedMediaMode = 'gif' | 'webp' | 'static' | 'video';

export const ANIMATED_MEDIA_MODES: readonly AnimatedMediaMode[] = [
	'gif',
	'webp',
	'static',
	'video',
];

function parseMode(value: string | undefined): AnimatedMediaMode {
	return ANIMATED_MEDIA_MODES.includes(value as AnimatedMediaMode)
		? (value as AnimatedMediaMode)
		: 'webp';
}

export const DEFAULT_ANIMATED_MEDIA_MODE = parseMode(process.env.NEXT_PUBLIC_ANIMATED_MEDIA);

type AnimatedMediaProps = Omit<ImageProps, 'src' | 'unoptimized' | 'loader' | 'placeholder'> & {
	/** public path without extension, e.g. `/committees/workshopgif` */
	name: string;
	mode?: AnimatedMediaMode;
};

export function AnimatedMedia({
	name,
	mode = DEFAULT_ANIMATED_MEDIA_MODE,
	alt,
	className,
	fill,
	width,
	height,
	priority,
	...rest
}: AnimatedMediaProps) {
	if (mode === 'video') {
		return (
			<video
				className={cn(fill && 'absolute inset-0 h-full w-full', className)}
				width={fill ? undefined : width}
				height={fill ? undefined : height}
				poster={`${name}-static.webp`}
				preload={priority ? 'auto' : 'metadata'}
				aria-label={alt || undefined}
				aria-hidden={alt ? undefined : true}
				autoPlay
				loop
				muted
				playsInline
			>
				<source src={`${name}.webm`} type="video/webm" />
				<source src={`${name}.mp4`} type="video/mp4" />
			</video>
		);
	}

	const src =
		mode === 'gif' ? `${name}.gif` : mode === 'webp' ? `${name}.webp` : `${name}-static.webp`;

	return (
		<Image
			{...rest}
			src={src}
			alt={alt}
			className={className}
			fill={fill}
			width={width}
			height={height}
			priority={priority}
			unoptimized={mode !== 'static'}
		/>
	);
}
