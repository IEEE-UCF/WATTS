'use client';

import { Button } from '@watts/ui/button';
import { GlowButton } from '@/components/ui/glow-button';
import { ThemePlayground } from '@/components/theme-playground';

export default function StyleGuide() {
	return (
		<div className="min-h-screen bg-ieee-black text-white">
			<ThemePlayground pageName="Style Guide" />
			{/* Header */}
			<div className="border-b border-ieee-dark-grey bg-ieee-near-black px-6 py-12">
				<div className="mx-auto max-w-6xl">
					<h1 className="mb-2 font-display text-6xl text-ieee-bright-yellow">
						IEEE UCF Design System
					</h1>
					<p className="font-body text-xl text-ieee-light-grey">
						A complete reference for colors, typography, components, and patterns.
					</p>
				</div>
			</div>

			<div className="mx-auto max-w-6xl px-6 py-12">
				{/* Color Palette */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						Color Palette
					</h2>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{/* Brand Colors */}
						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded border border-ieee-grey bg-ieee-black" />
								<div>
									<p className="font-heading text-sm">IEEE Black</p>
									<p className="font-body text-xs text-ieee-grey">#000000</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded border border-ieee-dark-grey bg-ieee-near-black" />
								<div>
									<p className="font-heading text-sm">Near Black</p>
									<p className="font-body text-xs text-ieee-grey">#0c0a09</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded bg-ieee-warm-dark" />
								<div>
									<p className="font-heading text-sm">Warm Dark</p>
									<p className="font-body text-xs text-ieee-grey">#3d3110</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded bg-ieee-dark-grey" />
								<div>
									<p className="font-heading text-sm">Dark Grey</p>
									<p className="font-body text-xs text-ieee-grey">#2d2d2d</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded bg-ieee-grey" />
								<div>
									<p className="font-heading text-sm">Grey</p>
									<p className="font-body text-xs text-ieee-grey">#75787b</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded bg-ieee-light-grey" />
								<div>
									<p className="font-heading text-sm">Light Grey</p>
									<p className="font-body text-xs text-ieee-grey">#acb1b6</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded border border-ieee-grey bg-ieee-white" />
								<div>
									<p className="font-heading text-sm">White</p>
									<p className="font-body text-xs text-ieee-grey">#ffffff</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded bg-ieee-dark-yellow" />
								<div>
									<p className="font-heading text-sm">Dark Yellow</p>
									<p className="font-body text-xs text-ieee-grey">#ffc72c</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="mb-3 flex items-center gap-3">
								<div className="h-12 w-12 rounded bg-ieee-bright-yellow" />
								<div>
									<p className="font-heading text-sm">Bright Yellow</p>
									<p className="font-body text-xs text-ieee-grey">#ffd100</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* Typography */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						Typography
					</h2>

					<div className="space-y-4">
						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-2 font-display text-4xl text-white">
								Display Font (ExtraBold)
							</p>
							<p className="font-body text-sm text-ieee-grey">
								Open Sans Extra Bold — use for hero titles only
							</p>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-2 font-heading text-3xl text-white">
								Heading Font (Bold)
							</p>
							<p className="font-body text-sm text-ieee-grey">
								Open Sans Bold — page headers, button labels, section titles
							</p>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-2 font-subheading text-2xl text-white">
								Subheading Font (Medium)
							</p>
							<p className="font-body text-sm text-ieee-grey">
								Open Sans Medium — card titles, form labels, accordion triggers
							</p>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-2 font-body text-xl text-white">Body Font (Light)</p>
							<p className="font-body text-sm text-ieee-grey">
								Open Sans Light — body copy, descriptions, nav links
							</p>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-2 font-display-italic text-2xl text-white">
								Display Italic Font
							</p>
							<p className="font-body-italic text-sm text-ieee-grey">
								Open Sans Extra Bold Italic — decorative text
							</p>
						</div>
					</div>
				</section>

				{/* Button Variants */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						Button Variants
					</h2>

					<div className="space-y-6">
						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-4 font-heading text-lg">Default (Primary Action)</p>
							<div className="flex flex-wrap gap-3">
								<Button>Join IEEE UCF</Button>
								<Button size="sm">Small</Button>
								<Button size="lg">Large</Button>
								<Button disabled>Disabled</Button>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-4 font-heading text-lg">
								Secondary (Supporting Action)
							</p>
							<div className="flex flex-wrap gap-3">
								<Button variant="secondary">Cancel</Button>
								<Button variant="secondary" size="sm">
									Small
								</Button>
								<Button variant="secondary" size="lg">
									Large
								</Button>
								<Button variant="secondary" disabled>
									Disabled
								</Button>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-4 font-heading text-lg">Outline (Low-emphasis)</p>
							<div className="flex flex-wrap gap-3">
								<Button variant="outline">Filter Pill</Button>
								<Button variant="outline" size="sm">
									Small
								</Button>
								<Button variant="outline" size="lg">
									Large
								</Button>
								<Button variant="outline" disabled>
									Disabled
								</Button>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-4 font-heading text-lg">Ghost (Icon/subtle)</p>
							<div className="flex flex-wrap gap-3">
								<Button variant="ghost">View Details</Button>
								<Button variant="ghost" size="sm">
									Small
								</Button>
								<Button variant="ghost" size="icon">
									×
								</Button>
								<Button variant="ghost" disabled>
									Disabled
								</Button>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-4 font-heading text-lg">
								Destructive (Sign Out, Delete)
							</p>
							<div className="flex flex-wrap gap-3">
								<Button variant="destructive">Sign Out</Button>
								<Button variant="destructive" size="sm">
									Small
								</Button>
								<Button variant="destructive" size="lg">
									Large
								</Button>
								<Button variant="destructive" disabled>
									Disabled
								</Button>
							</div>
						</div>

						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<p className="mb-4 font-heading text-lg">Link (Hyperlink style)</p>
							<div className="flex flex-wrap gap-3">
								<Button variant="link">Learn More</Button>
								<Button variant="link" size="sm">
									Small
								</Button>
								<Button variant="link" disabled>
									Disabled
								</Button>
							</div>
						</div>
					</div>
				</section>

				{/* Glow Button */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						GlowButton — Marquee CTA
					</h2>

					<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
						<p className="mb-8 font-body text-ieee-light-grey">
							Two-layer animated glow for hero and high-visibility CTAs:
						</p>
						<div className="flex flex-wrap items-center justify-center gap-6">
							<GlowButton>
								<span className="font-heading text-white">Get Involved</span>
							</GlowButton>
							<GlowButton>
								<span className="font-heading text-white">Join IEEE UCF</span>
							</GlowButton>
						</div>
					</div>
				</section>

				{/* Form Elements */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						Form Elements
					</h2>

					<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
						<div className="max-w-sm space-y-4">
							<div>
								<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
									Text Input
								</label>
								<input
									type="text"
									placeholder="Enter your name"
									className="w-full rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white transition-colors placeholder:text-ieee-grey focus:border-ieee-bright-yellow focus:ring-1 focus:ring-ieee-bright-yellow focus:outline-none"
								/>
							</div>

							<div>
								<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
									Select
								</label>
								<select className="w-full rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white transition-colors focus:border-ieee-bright-yellow focus:outline-none">
									<option>Choose an option</option>
									<option>Hardware</option>
									<option>Software</option>
								</select>
							</div>

							<div>
								<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
									Textarea
								</label>
								<textarea
									rows={3}
									placeholder="Tell us about yourself"
									className="w-full resize-none rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white transition-colors placeholder:text-ieee-grey focus:border-ieee-bright-yellow focus:ring-1 focus:ring-ieee-bright-yellow focus:outline-none"
								/>
							</div>

							<div className="flex items-center gap-2">
								<input
									type="checkbox"
									id="checkbox"
									className="h-4 w-4 rounded border-ieee-grey accent-ieee-dark-yellow"
								/>
								<label
									htmlFor="checkbox"
									className="font-subheading text-sm text-ieee-light-grey"
								>
									I agree to the terms
								</label>
							</div>
						</div>
					</div>
				</section>

				{/* Card Examples */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						Card Patterns
					</h2>

					<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
						{/* Standard Card */}
						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<h3 className="mb-2 font-subheading text-xl text-white">
								Standard Card
							</h3>
							<p className="font-body text-sm text-ieee-light-grey">
								Basic dark card with borders. Used throughout the site for content.
							</p>
						</div>

						{/* Hoverable Card */}
						<div className="cursor-pointer rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6 transition-transform hover:scale-102 hover:border-ieee-grey">
							<h3 className="mb-2 font-subheading text-xl text-white">
								Hoverable Card
							</h3>
							<p className="font-body text-sm text-ieee-light-grey">
								Scale on hover. Try hovering over this card.
							</p>
						</div>

						{/* Active/Selected Card */}
						<div className="rounded-lg border-2 border-ieee-bright-yellow bg-ieee-near-black p-6">
							<h3 className="mb-2 font-subheading text-xl text-white">
								Selected State
							</h3>
							<p className="font-body text-sm text-ieee-light-grey">
								Yellow border indicates selection or active state.
							</p>
						</div>

						{/* Event Card Skeleton */}
						<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
							<div className="space-y-3">
								<h3 className="font-subheading text-lg text-white">Event Title</h3>
								<p className="font-body text-sm text-ieee-light-grey">
									Engineering Building, Room 101
								</p>
								<p className="font-body text-xs text-ieee-grey">
									Jan 15, 2025 • 6:00 PM
								</p>
								<Button size="sm">Learn More</Button>
							</div>
						</div>
					</div>
				</section>

				{/* Status & Feedback */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						Status & Feedback
					</h2>

					<div className="space-y-4">
						{/* Success */}
						<div className="flex items-start gap-3 rounded-lg border border-green-800 bg-green-950 p-4">
							<div className="mt-0.5 text-lg text-green-400">✓</div>
							<div>
								<p className="font-heading text-sm text-green-400">Success</p>
								<p className="font-body text-sm text-green-300">
									Your changes have been saved successfully.
								</p>
							</div>
						</div>

						{/* Error */}
						<div className="flex items-start gap-3 rounded-lg border border-red-800 bg-red-950 p-4">
							<div className="mt-0.5 text-lg text-red-400">✕</div>
							<div>
								<p className="font-heading text-sm text-red-400">Error</p>
								<p className="font-body text-sm text-red-300">
									Something went wrong. Please try again.
								</p>
							</div>
						</div>

						{/* Warning */}
						<div className="flex items-start gap-3 rounded-lg border border-ieee-dark-yellow/40 bg-ieee-dark-yellow/10 p-4">
							<div className="mt-0.5 text-lg text-ieee-dark-yellow">!</div>
							<div>
								<p className="font-heading text-sm text-ieee-dark-yellow">
									Warning
								</p>
								<p className="font-body text-sm text-ieee-light-grey">
									Note: Dues are required for this event.
								</p>
							</div>
						</div>
					</div>
				</section>

				{/* Text Hierarchy */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-3xl text-ieee-bright-yellow">
						Text Hierarchy
					</h2>

					<div className="space-y-6 rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
						<div>
							<p className="mb-1 font-subheading text-xs text-ieee-grey">
								PRIMARY CONTENT
							</p>
							<p className="font-body text-lg text-white">
								Main body text and primary content sits on white for maximum
								contrast and readability.
							</p>
						</div>

						<div>
							<p className="mb-1 font-subheading text-xs text-ieee-grey">
								SECONDARY TEXT
							</p>
							<p className="font-body text-base text-ieee-light-grey">
								Supporting information, descriptions, and secondary content use
								light grey for visual hierarchy.
							</p>
						</div>

						<div>
							<p className="mb-1 font-subheading text-xs text-ieee-grey">
								MUTED / METADATA
							</p>
							<p className="font-body text-sm text-ieee-grey">
								Timestamps, tags, and small metadata are muted with darker grey.
							</p>
						</div>

						<div>
							<p className="mb-1 font-subheading text-xs text-ieee-grey">
								BRAND ACCENT
							</p>
							<p className="font-heading text-base text-ieee-dark-yellow">
								Key highlights and brand emphasis use the IEEE yellow.
							</p>
						</div>
					</div>
				</section>

				{/* Footer */}
				<section className="border-t border-ieee-dark-grey py-12">
					<p className="text-center font-body text-sm text-ieee-grey">
						For complete documentation, see{' '}
						<span className="text-ieee-light-grey">docs/STYLING.md</span> and{' '}
						<span className="text-ieee-light-grey">docs/COMPONENTS.md</span>
					</p>
				</section>
			</div>
		</div>
	);
}
