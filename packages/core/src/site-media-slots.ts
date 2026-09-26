// Named media slots on the public pages. Pure data — safe to import from client
// components. A slot with no `site_media_slots` row (or whose asset was removed)
// renders its code default, which is exactly what the page showed before the CMS.
//
// Adding a slot: add an entry here and render it with <SlotImage> on the page. No
// migration needed. Removing one: drop it here; any stored row is simply ignored.

export type SlotKind = 'image' | 'animated' | 'document';

export interface SlotDefinition {
	key: string;
	/** Admin grouping. */
	page: 'Home' | 'About' | 'Connect' | 'Events' | 'Projects' | 'Sponsorships';
	label: string;
	/** What may be uploaded: a still image, an animated WebP, or a PDF. */
	kind: SlotKind;
	/**
	 * Today's file under apps/ieeeucfcom/public. For `animated`, the path WITHOUT an
	 * extension (rendered through <AnimatedMedia>, which picks gif/webp/static).
	 */
	defaultSrc: string;
	/** Admin hint only — the page's own layout decides the real crop. */
	aspectHint?: string;
}

const slot = (def: SlotDefinition) => def;

export const SITE_MEDIA_SLOTS = [
	// Home carousel — the five animated committee cards
	slot({ key: 'home.carousel.workshops', page: 'Home', label: 'Carousel: Technical workshops', kind: 'animated', defaultSrc: '/committees/workshopgif', aspectHint: 'square card' }),
	slot({ key: 'home.carousel.projects', page: 'Home', label: 'Carousel: Embedded projects', kind: 'animated', defaultSrc: '/projects/sechardwaregif1', aspectHint: 'square card' }),
	slot({ key: 'home.carousel.social', page: 'Home', label: 'Carousel: Social events', kind: 'animated', defaultSrc: '/committees/socialgif1', aspectHint: 'square card' }),
	slot({ key: 'home.carousel.prodev', page: 'Home', label: 'Carousel: Career development', kind: 'animated', defaultSrc: '/committees/prodevgif', aspectHint: 'square card' }),
	slot({ key: 'home.carousel.service', page: 'Home', label: 'Carousel: Community service', kind: 'animated', defaultSrc: '/committees/servicegif', aspectHint: 'square card' }),

	// About
	slot({ key: 'about.hero', page: 'About', label: 'Header background', kind: 'image', defaultSrc: '/southeastcon/secgroup.jpg', aspectHint: 'full-width, wide' }),
	slot({ key: 'about.workshops.1', page: 'About', label: 'Technical development photo 1', kind: 'image', defaultSrc: '/committees/workshop1.png' }),
	slot({ key: 'about.workshops.2', page: 'About', label: 'Technical development photo 2', kind: 'image', defaultSrc: '/committees/workshop2.png' }),
	slot({ key: 'about.southeastcon.1', page: 'About', label: 'SoutheastCon photo 1', kind: 'image', defaultSrc: '/southeastcon/secawards.png' }),
	slot({ key: 'about.southeastcon.2', page: 'About', label: 'SoutheastCon photo 2', kind: 'image', defaultSrc: '/projects/sechardware1.png' }),
	slot({ key: 'about.service.1', page: 'About', label: 'Community service photo 1', kind: 'image', defaultSrc: '/committees/service1.png' }),
	slot({ key: 'about.service.2', page: 'About', label: 'Community service photo 2', kind: 'image', defaultSrc: '/committees/service2.png' }),
	slot({ key: 'about.social.1', page: 'About', label: 'Social photo 1', kind: 'image', defaultSrc: '/committees/social1.png' }),
	slot({ key: 'about.social.2', page: 'About', label: 'Social photo 2', kind: 'image', defaultSrc: '/committees/social2.png' }),
	slot({ key: 'about.prodev.1', page: 'About', label: 'Professional development photo 1', kind: 'image', defaultSrc: '/committees/prodev2.jpg' }),
	slot({ key: 'about.prodev.2', page: 'About', label: 'Professional development photo 2', kind: 'image', defaultSrc: '/committees/prodev1.jpg' }),
	slot({ key: 'about.network', page: 'About', label: 'Alumni network graphic', kind: 'image', defaultSrc: '/sponsors/network.png' }),

	// Connect
	slot({ key: 'connect.hero', page: 'Connect', label: 'Header background', kind: 'image', defaultSrc: '/gbms/firstgbm2024.png', aspectHint: 'full-width, wide' }),
	slot({ key: 'connect.prodev', page: 'Connect', label: 'Mentorship photo', kind: 'image', defaultSrc: '/committees/prodev3.png' }),
	slot({ key: 'connect.step.1', page: 'Connect', label: 'Joining: step one', kind: 'image', defaultSrc: '/newmembers/stepone.png' }),
	slot({ key: 'connect.step.2', page: 'Connect', label: 'Joining: step two', kind: 'image', defaultSrc: '/newmembers/steptwo.png' }),
	slot({ key: 'connect.step.3', page: 'Connect', label: 'Joining: step three', kind: 'image', defaultSrc: '/newmembers/stepthree.png' }),
	slot({ key: 'connect.step.4', page: 'Connect', label: 'Joining: step four', kind: 'image', defaultSrc: '/newmembers/stepthree.png' }),

	// Heroes
	slot({ key: 'events.hero', page: 'Events', label: 'Header background', kind: 'animated', defaultSrc: '/gbms/gbmgif', aspectHint: 'full-width, wide' }),
	slot({ key: 'projects.hero', page: 'Projects', label: 'Header background', kind: 'animated', defaultSrc: '/projects/sechardwaregif2', aspectHint: 'full-width, wide' }),
	slot({ key: 'sponsorships.hero', page: 'Sponsorships', label: 'Header background', kind: 'animated', defaultSrc: '/committees/socialgif2', aspectHint: 'full-width, wide' }),

	// Documents
	slot({ key: 'sponsorships.packet', page: 'Sponsorships', label: 'Sponsorship packet (PDF)', kind: 'document', defaultSrc: '/sponsors/IEEE_UCF_Sponsorship_Packet_2026_to_2027.pdf' }),
] as const satisfies readonly SlotDefinition[];

export type SlotKey = (typeof SITE_MEDIA_SLOTS)[number]['key'];

const BY_KEY = new Map<string, SlotDefinition>(SITE_MEDIA_SLOTS.map((s) => [s.key, s]));

export function getSlotDefinition(key: string): SlotDefinition | undefined {
	return BY_KEY.get(key);
}

export function isSlotKey(key: string): key is SlotKey {
	return BY_KEY.has(key);
}
