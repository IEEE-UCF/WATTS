import Link from 'next/link';
import type { PublicContentPage } from '@watts/core/site-content';
import { Footer } from '@/components/footer';
import { CtaBand } from '@/components/pg/detail/cta-band';
import { DetailGallery, type GalleryImage } from '@/components/pg/detail/detail-gallery';
import { DetailSection, Prose, TagGroup } from '@/components/pg/detail/detail-section';
import { EventCards, EventRows } from '@/components/pg/detail/event-list';
import { FactsBar, type Fact } from '@/components/pg/detail/facts-bar';
import { JoinProjectButton } from '@/components/pg/detail/join-project-button';
import { Avatar, PeopleGrid } from '@/components/pg/detail/people-grid';
import { PosterHero, type HeroImage, type HeroTag } from '@/components/pg/detail/poster-hero';
import { shortDate } from '@/lib/event-dates';

const OUTLINE_BUTTON =
	'inline-block rounded-xs border border-white px-6 py-[15px] font-heading text-sm text-white transition-colors hover:border-ieee-bright-yellow hover:text-ieee-bright-yellow';

/** Curated gallery first; projects fall back to their older `photo_urls`. */
function galleryOf(page: PublicContentPage): GalleryImage[] {
	if (page.gallery.length > 0) {
		return page.gallery.map((a) => ({
			key: a.id,
			url: a.url,
			alt: a.alt ?? page.title,
			animated: a.kind === 'animated',
		}));
	}
	return page.legacyPhotoUrls.map((url, i) => ({
		key: url,
		url,
		alt: `${page.title} photo ${i + 1}`,
	}));
}

/** Hero image: the chosen cover, else the first gallery photo (a project's main photo). */
function heroOf(page: PublicContentPage, gallery: GalleryImage[]): HeroImage | null {
	if (page.hero) {
		return {
			url: page.hero.url,
			alt: page.hero.alt ?? page.title,
			animated: page.hero.kind === 'animated',
		};
	}
	const first = gallery[0];
	return first ? { url: first.url, alt: first.alt, animated: first.animated } : null;
}

/**
 * Public layout for /projects/[slug] and /committees/[slug] (also the editor's
 * preview). Poster hero, a strip of facts filled in from the record, the hand-written
 * body, then team, gallery and a call to action. Sections with no data are left out.
 */
export function ContentPageView({ page }: { page: PublicContentPage }) {
	const gallery = galleryOf(page);
	const hero = heroOf(page, gallery);
	const project = page.project;
	const isCommittee = page.type === 'committee';
	const isCurrent = project?.status !== 'past';
	const committee = page.committee;
	const chair = committee?.chair ?? null;
	const leads = project?.team.filter((p) => p.isLead) ?? [];
	// A lone photo is already the hero; don't repeat it as a one-tile gallery.
	const showGallery =
		gallery.length > 1 || (gallery.length === 1 && gallery[0].url !== hero?.url);

	const tags: HeroTag[] = [{ label: isCommittee ? 'Committee' : 'Project', tone: 'solid' }];
	if (project) tags.push({ label: isCurrent ? 'Current' : 'Past project', tone: 'outline' });
	if (project?.category) tags.push({ label: project.category, tone: 'muted' });

	const leadNames = page.leadNames.join(', ');
	const facts: Fact[] = isCommittee
		? [
				{
					label: 'Chair',
					value: chair?.name ?? leadNames,
					leading: chair ? <Avatar person={chair} size="sm" /> : undefined,
				},
				{
					label: 'Members',
					value: committee?.memberCount
						? `${committee.memberCount} on the committee`
						: null,
				},
				{
					label: 'Next event',
					value: committee?.upcoming[0]
						? `${shortDate(committee.upcoming[0])} · ${committee.upcoming[0].title}`
						: null,
				},
			]
		: [
				{
					label: leads.length > 1 ? 'Project leads' : 'Project lead',
					value: leadNames,
					leading: leads[0] ? <Avatar person={leads[0]} size="sm" /> : undefined,
				},
				{
					label: 'Team',
					value: project?.team.length
						? `${project.team.length} member${project.team.length === 1 ? '' : 's'}`
						: null,
				},
				{ label: 'Category', value: project?.category },
				{ label: 'Status', value: isCurrent ? 'Active' : 'Completed' },
			];

	const hasTags = Boolean(
		project && (project.skills.length || project.hardware.length || project.software.length),
	);
	const hasAside = hasTags || Boolean(chair);

	const heroActions = isCommittee ? (
		<Link
			href={page.applyUrl ?? '/connect'}
			className="inline-block rounded-xs bg-ieee-bright-yellow px-9 py-4 font-display text-sm tracking-[0.08em] text-black hover:bg-ieee-dark-yellow"
		>
			APPLY
		</Link>
	) : isCurrent ? (
		<>
			<JoinProjectButton projectId={page.id} />
			<Link href="/projects" className={OUTLINE_BUTTON}>
				All projects
			</Link>
		</>
	) : (
		<Link href="/projects" className={OUTLINE_BUTTON}>
			All projects
		</Link>
	);

	return (
		<div className="flex min-h-screen max-w-screen flex-col overflow-x-hidden bg-black text-white">
			<PosterHero
				image={hero}
				tags={tags}
				title={page.title}
				tagline={page.tagline}
				actions={heroActions}
			/>

			<FactsBar facts={facts} />

			<main className="flex flex-1 flex-col gap-16 pt-14 pb-20 md:gap-20 md:pt-18">
				<div className="mx-auto grid w-full max-w-6xl gap-12 px-6 md:px-10 lg:grid-cols-3 lg:gap-14">
					<div
						className={`flex flex-col gap-5 ${hasAside ? 'lg:col-span-2' : 'lg:col-span-3'}`}
					>
						<h2 className="font-heading text-xs tracking-[0.16em] text-ieee-bright-yellow uppercase md:text-sm">
							{isCommittee ? 'About' : 'Overview'}
						</h2>
						<Prose text={page.body} />
					</div>
					{project && hasTags && (
						<aside className="flex flex-col gap-6">
							<TagGroup
								label="Skills you'll use"
								tags={project.skills}
								tone="skill"
							/>
							<TagGroup label="Hardware" tags={project.hardware} tone="hardware" />
							<TagGroup label="Software" tags={project.software} tone="software" />
						</aside>
					)}
					{chair && (
						<aside className="flex flex-col items-start gap-4 self-start rounded-sm border border-ieee-dark-grey bg-ieee-near-black p-7">
							<span className="font-subheading text-xs tracking-[0.14em] text-ieee-light-grey">
								CHAIR
							</span>
							<Avatar person={chair} size="lg" />
							<div className="flex flex-col">
								<span className="font-heading text-xl">{chair.name}</span>
								{chair.detail && (
									<span className="font-body text-sm text-[#d6d8da]">
										{chair.detail}
									</span>
								)}
							</div>
							{chair.bio && (
								<p className="font-body text-sm leading-relaxed text-[#d6d8da]">
									{chair.bio}
								</p>
							)}
							{chair.linkedinUrl && (
								<a
									href={chair.linkedinUrl}
									target="_blank"
									rel="noreferrer"
									className="font-heading text-sm text-ieee-bright-yellow hover:underline"
								>
									LinkedIn
								</a>
							)}
						</aside>
					)}
				</div>

				{committee && committee.upcoming.length > 0 && (
					<DetailSection title="Upcoming">
						<EventRows events={committee.upcoming} />
					</DetailSection>
				)}

				{committee && committee.past.length > 0 && (
					<DetailSection title="Past events">
						<EventCards events={committee.past} showAttendance />
					</DetailSection>
				)}

				{project && project.team.length > 0 && (
					<DetailSection title="The team">
						<PeopleGrid
							people={project.team}
							trailing={
								isCurrent ? (
									<>
										<div className="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-ieee-grey font-display text-3xl text-ieee-bright-yellow md:size-28">
											+
										</div>
										<span className="font-heading text-sm text-ieee-bright-yellow md:text-base">
											You?
										</span>
										<span className="font-body text-xs text-ieee-light-grey md:text-sm">
											Request to join below
										</span>
									</>
								) : undefined
							}
						/>
					</DetailSection>
				)}

				{showGallery && (
					<DetailSection title="Gallery">
						<DetailGallery images={gallery} />
					</DetailSection>
				)}

				{isCommittee ? (
					<CtaBand
						title="Want to help run this committee?"
						subtitle="Applications are reviewed by the chair."
						action={
							<Link
								href={page.applyUrl ?? '/connect'}
								className="inline-block rounded-xs bg-black px-8 py-4 font-display text-sm tracking-[0.08em] text-ieee-bright-yellow"
							>
								APPLY
							</Link>
						}
					/>
				) : (
					isCurrent && (
						<CtaBand
							title="Want to build this with us?"
							subtitle="The project lead reviews every request."
							action={<JoinProjectButton projectId={page.id} variant="inverse" />}
						/>
					)
				)}
			</main>

			<Footer />
		</div>
	);
}
