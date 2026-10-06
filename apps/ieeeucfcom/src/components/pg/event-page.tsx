import Image from 'next/image';
import Link from 'next/link';
import { Calendar, Clock, Lock, MapPin } from 'lucide-react';
import type { PublicEventPage } from '@watts/core/event-page';
import { Footer } from '@/components/footer';
import { DetailGallery } from '@/components/pg/detail/detail-gallery';
import { DetailSection, Prose } from '@/components/pg/detail/detail-section';
import { EventCards } from '@/components/pg/detail/event-list';
import { FactsBar } from '@/components/pg/detail/facts-bar';
import { PosterHero, type HeroTag } from '@/components/pg/detail/poster-hero';
import {
	googleCalendarUrl,
	longDate,
	relativeDay,
	shortDate,
	timeRange,
	zoneLabel,
} from '@/lib/event-dates';

const SOLID =
	'inline-block rounded-xs bg-ieee-bright-yellow px-8 py-4 font-display text-sm tracking-[0.08em] text-black hover:bg-ieee-dark-yellow';
const OUTLINE =
	'inline-block rounded-xs border border-white px-6 py-[15px] font-heading text-sm text-white hover:border-ieee-bright-yellow hover:text-ieee-bright-yellow';
const SMALL_OUTLINE =
	'inline-block rounded-xs border border-ieee-grey px-4 py-2.5 font-subheading text-sm text-white hover:border-ieee-bright-yellow hover:text-ieee-bright-yellow';

/** Google Maps search for the location (UCF building names resolve well). */
function mapsUrl(place: string) {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, UCF Orlando`)}`;
}

/**
 * Public page for one event. Before it happens: flyer, when/where, RSVP and "add to
 * calendar". After it ends the same URL shows photos and how many members came
 * (a count only; names are never public).
 */
export function EventPageView({ event, pageUrl }: { event: PublicEventPage; pageUrl: string }) {
	const where = event.room ? `${event.room} · ${event.location}` : event.location;
	const soon = event.isPast ? null : relativeDay(event);
	const gcal = googleCalendarUrl({
		...event,
		location: where,
		details: `${event.description}\n\n${pageUrl}`,
	});
	const icsHref = `/events/${event.number}/calendar.ics`;

	const tags: HeroTag[] = [];
	if (event.label) tags.push({ label: event.label.name, tone: 'solid' });
	if (event.isPast) tags.push({ label: `Past event · ${shortDate(event)}`, tone: 'muted' });
	else if (soon) tags.push({ label: soon, tone: 'outline' });

	// Past events lead with a photo when there is one; upcoming ones with the flyer.
	const heroPhoto = event.isPast ? event.photos[0] : undefined;
	const heroImage = heroPhoto
		? { url: heroPhoto.url, alt: heroPhoto.caption ?? event.title }
		: event.flyerUrl
			? { url: event.flyerUrl, alt: `${event.title} flyer` }
			: null;

	const details = !event.isPast && (
		<ul className="flex flex-wrap gap-x-7 gap-y-2 font-subheading text-base text-white md:text-lg">
			<li className="flex items-center gap-2.5">
				<Calendar className="size-5 text-ieee-bright-yellow" aria-hidden />
				{shortDate(event)}
			</li>
			<li className="flex items-center gap-2.5">
				<Clock className="size-5 text-ieee-bright-yellow" aria-hidden />
				{timeRange(event)}
			</li>
			<li className="flex items-center gap-2.5">
				<MapPin className="size-5 text-ieee-bright-yellow" aria-hidden />
				{where}
			</li>
		</ul>
	);

	const actions = !event.isPast && (
		<>
			{event.rsvpLink && (
				<a href={event.rsvpLink} target="_blank" rel="noreferrer" className={SOLID}>
					RSVP
				</a>
			)}
			<a href={gcal} target="_blank" rel="noreferrer" className={OUTLINE}>
				Add to calendar
			</a>
			{event.requiresDues && (
				<span className="flex items-center gap-2 font-subheading text-sm text-ieee-dark-yellow">
					<Lock className="size-4" aria-hidden />
					Dues-paying members
				</span>
			)}
		</>
	);

	const aside = event.isPast ? (
		event.attendanceCount ? (
			<div className="flex flex-col items-start gap-1 lg:items-end">
				<span className="font-display text-6xl leading-none text-white md:text-7xl">
					{event.attendanceCount}
				</span>
				<span className="font-subheading text-sm tracking-[0.14em] text-ieee-light-grey">
					{event.attendanceCount === 1 ? 'MEMBER' : 'MEMBERS'} ATTENDED
				</span>
			</div>
		) : null
	) : event.flyerUrl ? (
		<div className="relative mx-auto aspect-[4/5] w-full max-w-xs overflow-hidden rounded-sm border border-ieee-warm-dark lg:w-80">
			<Image
				src={event.flyerUrl}
				alt={`${event.title} flyer`}
				fill
				sizes="320px"
				className="object-cover"
				priority
			/>
		</div>
	) : null;

	const facts = [
		{ label: 'When', value: `${longDate(event)} · ${timeRange(event)}` },
		{ label: 'Where', value: where },
		{
			label: 'Hosted by',
			value: event.committee ? (
				event.committee.slug ? (
					<Link
						href={`/committees/${event.committee.slug}`}
						className="text-ieee-bright-yellow hover:underline"
					>
						{event.committee.title}
					</Link>
				) : (
					event.committee.title
				)
			) : (
				'IEEE UCF'
			),
		},
	];

	return (
		<div className="flex min-h-screen max-w-screen flex-col overflow-x-hidden bg-black text-white">
			<PosterHero
				image={heroImage}
				dimImage={!heroPhoto}
				tags={tags}
				title={event.title}
				tagline={event.isPast ? 'Thanks to everyone who came out.' : null}
				details={details || undefined}
				actions={actions || undefined}
				aside={aside ?? undefined}
			/>

			{event.isPast && <FactsBar facts={facts} />}

			<main className="flex flex-1 flex-col gap-16 pt-14 pb-20 md:gap-20 md:pt-18">
				{event.isPast && event.photos.length > 0 && (
					<DetailSection title="Photos">
						<DetailGallery
							images={event.photos.map((p, i) => ({
								key: p.id,
								url: p.url,
								alt: p.caption ?? `${event.title} photo ${i + 1}`,
							}))}
						/>
					</DetailSection>
				)}

				<div className="mx-auto grid w-full max-w-6xl gap-12 px-6 md:px-10 lg:grid-cols-3 lg:gap-14">
					<div className="flex flex-col gap-5 lg:col-span-2">
						<h2 className="font-heading text-xs tracking-[0.16em] text-ieee-bright-yellow uppercase md:text-sm">
							{event.isPast ? 'About this event' : 'What to expect'}
						</h2>
						<Prose text={event.description} />
					</div>

					{!event.isPast && (
						<aside className="flex flex-col self-start rounded-sm border border-ieee-dark-grey bg-ieee-near-black">
							<div className="flex flex-col gap-1 border-b border-ieee-dark-grey px-6 py-5">
								<span className="font-subheading text-xs tracking-[0.14em] text-ieee-light-grey">
									WHEN
								</span>
								<span className="font-heading text-lg">{longDate(event)}</span>
								<span className="font-body text-sm text-[#d6d8da]">
									{timeRange(event)}
									{event.allDay ? '' : ` ${zoneLabel(event.timeZone)}`}
								</span>
							</div>
							<div className="flex flex-col gap-1 border-b border-ieee-dark-grey px-6 py-5">
								<span className="font-subheading text-xs tracking-[0.14em] text-ieee-light-grey">
									WHERE
								</span>
								<span className="font-heading text-lg">{where}</span>
								<a
									href={mapsUrl(event.room ?? event.location)}
									target="_blank"
									rel="noreferrer"
									className="font-subheading text-sm text-ieee-bright-yellow hover:underline"
								>
									Open in Maps
								</a>
							</div>
							<div className="flex flex-col gap-1 border-b border-ieee-dark-grey px-6 py-5">
								<span className="font-subheading text-xs tracking-[0.14em] text-ieee-light-grey">
									HOSTED BY
								</span>
								<span className="font-heading text-lg">{facts[2].value}</span>
							</div>
							<div className="flex flex-col gap-3 px-6 py-5">
								<span className="font-subheading text-xs tracking-[0.14em] text-ieee-light-grey">
									SAVE IT
								</span>
								<div className="flex flex-wrap gap-2">
									<a
										href={gcal}
										target="_blank"
										rel="noreferrer"
										className={SMALL_OUTLINE}
									>
										Google Calendar
									</a>
									<a href={icsHref} className={SMALL_OUTLINE}>
										Apple / Outlook (.ics)
									</a>
								</div>
							</div>
						</aside>
					)}

					{event.isPast && event.flyerUrl && (
						<aside className="flex items-start gap-5 self-start">
							<div className="relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-sm border border-ieee-dark-grey">
								<Image
									src={event.flyerUrl}
									alt={`${event.title} flyer`}
									fill
									sizes="112px"
									className="object-cover"
								/>
							</div>
							<p className="font-body text-sm text-ieee-light-grey">
								The flyer for this event.
							</p>
						</aside>
					)}
				</div>

				{event.more.length > 0 && (
					<DetailSection
						title={event.isPast ? 'Coming up next' : 'More coming up'}
						action={
							<Link
								href="/events"
								className="font-heading text-sm text-ieee-bright-yellow hover:underline"
							>
								All events →
							</Link>
						}
					>
						<EventCards events={event.more} />
					</DetailSection>
				)}
			</main>

			<Footer />
		</div>
	);
}
