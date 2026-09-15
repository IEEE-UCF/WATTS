'use client';

import { useState } from 'react';
import { Button } from '@watts/ui/button';
import { GlowButton } from '@/components/ui/glow-button';
import Link from 'next/link';
import { QREventScanner } from '@/components/admin/qr_event_scanner';
import { EventList } from '@/components/dashboard/event-list';
import { FormPopup } from '@/components/dashboard/newEventForm';
import { ThemePlayground } from '@/components/theme-playground';
import { Timer } from '@/components/timer';

export default function ComponentShowcase() {
	const [expandedSection, setExpandedSection] = useState<string | null>('buttons');

	const toggleSection = (section: string) => {
		setExpandedSection(expandedSection === section ? null : section);
	};

	return (
		<div className="min-h-screen bg-ieee-black text-white">
			<ThemePlayground pageName="Component Showcase" />
			{/* Header */}
			<div className="border-b border-ieee-dark-grey bg-ieee-near-black px-6 py-12">
				<div className="mx-auto max-w-6xl">
					<h1 className="mb-2 font-display text-6xl text-ieee-bright-yellow">
						Component Showcase
					</h1>
					<p className="font-body text-xl text-ieee-light-grey">
						Interactive examples of all custom components working together with real
						patterns.
					</p>
				</div>
			</div>

			<div className="mx-auto max-w-6xl px-6 py-12">
				{/* Navigation Cards */}
				<section className="mb-16">
					<h2 className="mb-6 font-heading text-2xl text-ieee-bright-yellow">
						Jump to Component
					</h2>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{[
							{ name: 'Buttons & CTAs', id: 'buttons' },
							{ name: 'Cards & Containers', id: 'cards' },
							{ name: 'Forms & Inputs', id: 'forms' },
							{ name: 'Navigation', id: 'navigation' },
							{ name: 'Status & Feedback', id: 'feedback' },
							{ name: 'Complex Patterns', id: 'complex' },
							{ name: 'Custom Components', id: 'custom' },
						].map((item) => (
							<button
								key={item.id}
								onClick={() => toggleSection(item.id)}
								className={`rounded-lg border p-4 text-left transition-all ${
									expandedSection === item.id
										? 'border-ieee-bright-yellow bg-ieee-dark-yellow text-black'
										: 'border-ieee-dark-grey bg-ieee-near-black hover:border-ieee-grey'
								}`}
							>
								<p
									className={`font-heading text-sm ${expandedSection === item.id ? 'text-black' : 'text-white'}`}
								>
									{item.name}
								</p>
							</button>
						))}
					</div>
				</section>

				{/* Buttons & CTAs */}
				{(expandedSection === 'buttons' || expandedSection === null) && (
					<section className="mb-16">
						<div
							onClick={() => toggleSection('buttons')}
							className="mb-6 flex cursor-pointer items-center justify-between rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-4 transition-colors hover:border-ieee-grey"
						>
							<h2 className="font-heading text-2xl text-ieee-bright-yellow">
								Buttons & CTAs
							</h2>
							<span className="text-ieee-light-grey">↓</span>
						</div>

						{expandedSection === 'buttons' && (
							<div className="space-y-6">
								{/* Primary Button Row */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Primary Action Buttons
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										For the single most important action on a page. Use
										sparingly.
									</p>
									<div className="flex flex-wrap gap-3">
										<Button>Register Now</Button>
										<Button>Join IEEE UCF</Button>
										<Button size="lg">Get Started</Button>
										<Button size="sm">Save</Button>
										<Button disabled>Disabled State</Button>
									</div>
								</div>

								{/* Secondary Buttons */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Secondary & Supporting Buttons
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										Cancel, close, or less important actions. Often paired with
										a primary button.
									</p>
									<div className="flex flex-wrap gap-3">
										<Button variant="secondary">Cancel</Button>
										<Button variant="secondary">Close</Button>
										<Button variant="secondary" size="sm">
											Back
										</Button>
										<Button variant="secondary" disabled>
											Disabled
										</Button>
									</div>
								</div>

								{/* Outline & Ghost Buttons */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Outline & Ghost Buttons
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										Low-emphasis actions and icon buttons. Use for filters,
										toggles, and inline actions.
									</p>
									<div className="flex flex-wrap gap-3">
										<Button variant="outline">Hardware</Button>
										<Button variant="outline">Software</Button>
										<Button variant="outline" size="sm">
											Filter
										</Button>
										<Button variant="ghost">View Details</Button>
										<Button variant="ghost" size="icon">
											×
										</Button>
										<Button variant="ghost" disabled>
											Disabled
										</Button>
									</div>
								</div>

								{/* Destructive Button */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Destructive Action
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										For irreversible actions. Requires user confirmation
										mentally.
									</p>
									<div className="flex flex-wrap gap-3">
										<Button variant="destructive">Sign Out</Button>
										<Button variant="destructive" size="sm">
											Delete
										</Button>
										<Button variant="destructive" disabled>
											Disabled
										</Button>
									</div>
								</div>

								{/* GlowButton */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Marquee CTA — GlowButton
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										High-visibility call-to-action with animated glow. Use
										sparingly for hero sections only.
									</p>
									<div className="flex flex-wrap items-center gap-6">
										<GlowButton>
											<span className="font-heading text-white">
												Get Involved
											</span>
										</GlowButton>
										<GlowButton innerClassName="px-5 py-2">
											<span className="font-heading text-sm text-white">
												LEARN MORE
											</span>
										</GlowButton>
									</div>
								</div>

								{/* Form Action Row Pattern */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Form Action Row Pattern
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										Standard pattern for forms and modals. Primary action on
										right.
									</p>
									<div className="rounded border border-ieee-dark-grey bg-ieee-dark-grey/40 p-4">
										<div className="mb-4 space-y-4">
											<div>
												<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
													Email
												</label>
												<input
													type="email"
													placeholder="you@ucf.edu"
													className="w-full rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white placeholder:text-ieee-grey focus:border-ieee-bright-yellow focus:outline-none"
												/>
											</div>
										</div>
										<div className="flex justify-end gap-2">
											<Button variant="secondary" type="button">
												Cancel
											</Button>
											<Button type="submit">Save Changes</Button>
										</div>
									</div>
								</div>
							</div>
						)}
					</section>
				)}

				{/* Cards & Containers */}
				{(expandedSection === 'cards' || expandedSection === null) && (
					<section className="mb-16">
						<div
							onClick={() => toggleSection('cards')}
							className="mb-6 flex cursor-pointer items-center justify-between rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-4 transition-colors hover:border-ieee-grey"
						>
							<h2 className="font-heading text-2xl text-ieee-bright-yellow">
								Cards & Containers
							</h2>
							<span className="text-ieee-light-grey">↓</span>
						</div>

						{expandedSection === 'cards' && (
							<div className="space-y-6">
								{/* Standard Cards */}
								<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
									<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
										<h3 className="mb-2 font-subheading text-lg text-white">
											Standard Card
										</h3>
										<p className="font-body text-sm text-ieee-light-grey">
											Basic content card with dark background and border. Used
											throughout.
										</p>
									</div>

									<div className="cursor-pointer rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6 transition-transform hover:scale-102 hover:border-ieee-grey">
										<h3 className="mb-2 font-subheading text-lg text-white">
											Hoverable Card
										</h3>
										<p className="font-body text-sm text-ieee-light-grey">
											Scales on hover for interactive feedback. Hover to see
											effect.
										</p>
									</div>

									<div className="rounded-lg border-2 border-ieee-bright-yellow bg-ieee-near-black p-6">
										<h3 className="mb-2 font-subheading text-lg text-white">
											Selected / Active
										</h3>
										<p className="font-body text-sm text-ieee-light-grey">
											Yellow border indicates selection or active state.
										</p>
									</div>

									<div className="cursor-pointer rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6 transition-all hover:bg-ieee-dark-grey/50">
										<h3 className="mb-2 font-subheading text-lg text-white">
											Subtle Hover
										</h3>
										<p className="font-body text-sm text-ieee-light-grey">
											Darkens slightly on hover. Good for less critical
											interactions.
										</p>
									</div>
								</div>

								{/* Event Card */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Event Card Pattern
									</h3>
									<div className="space-y-3 rounded-lg border border-ieee-dark-grey bg-ieee-dark-grey/40 p-6">
										<h4 className="font-subheading text-xl text-white">
											General Meeting
										</h4>
										<div>
											<p className="font-body text-sm text-ieee-light-grey">
												Engineering Building, Room 101
											</p>
											<p className="mt-1 font-body text-xs text-ieee-grey">
												January 15, 2025 • 6:00 PM – 7:30 PM
											</p>
										</div>
										<p className="font-body text-sm text-white">
											Monthly gathering for all IEEE members. Refreshments
											provided.
										</p>
										<Button size="sm" className="w-full">
											Learn More
										</Button>
									</div>
								</div>

								{/* Alert Cards */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">Status Cards</h3>
									<div className="space-y-3">
										<div className="flex items-start gap-3 rounded-lg border border-green-800 bg-green-950 p-4">
											<span className="font-heading text-green-400">✓</span>
											<div>
												<p className="font-heading text-sm text-green-400">
													Success
												</p>
												<p className="font-body text-xs text-green-300">
													Your event has been created.
												</p>
											</div>
										</div>

										<div className="flex items-start gap-3 rounded-lg border border-red-800 bg-red-950 p-4">
											<span className="font-heading text-red-400">✕</span>
											<div>
												<p className="font-heading text-sm text-red-400">
													Error
												</p>
												<p className="font-body text-xs text-red-300">
													Failed to save. Please try again.
												</p>
											</div>
										</div>

										<div className="flex items-start gap-3 rounded-lg border border-ieee-dark-yellow/40 bg-ieee-dark-yellow/10 p-4">
											<span className="font-heading text-ieee-dark-yellow">
												!
											</span>
											<div>
												<p className="font-heading text-sm text-ieee-dark-yellow">
													Warning
												</p>
												<p className="font-body text-xs text-ieee-light-grey">
													Dues are required for this event.
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}
					</section>
				)}

				{/* Forms & Inputs */}
				{(expandedSection === 'forms' || expandedSection === null) && (
					<section className="mb-16">
						<div
							onClick={() => toggleSection('forms')}
							className="mb-6 flex cursor-pointer items-center justify-between rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-4 transition-colors hover:border-ieee-grey"
						>
							<h2 className="font-heading text-2xl text-ieee-bright-yellow">
								Forms & Inputs
							</h2>
							<span className="text-ieee-light-grey">↓</span>
						</div>

						{expandedSection === 'forms' && (
							<div className="space-y-6">
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">Form Fields</h3>
									<form className="max-w-md space-y-4">
										<div>
											<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
												Full Name
											</label>
											<input
												type="text"
												placeholder="John Doe"
												className="w-full rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white transition-colors placeholder:text-ieee-grey focus:border-ieee-bright-yellow focus:ring-1 focus:ring-ieee-bright-yellow focus:outline-none"
											/>
										</div>

										<div>
											<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
												Email Address
											</label>
											<input
												type="email"
												placeholder="you@ucf.edu"
												className="w-full rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white transition-colors placeholder:text-ieee-grey focus:border-ieee-bright-yellow focus:ring-1 focus:ring-ieee-bright-yellow focus:outline-none"
											/>
										</div>

										<div>
											<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
												Event
											</label>
											<select className="w-full rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white transition-colors focus:border-ieee-bright-yellow focus:outline-none">
												<option disabled>Select an event</option>
												<option>General Meeting</option>
												<option>Hackathon</option>
												<option>Workshop</option>
											</select>
										</div>

										<div>
											<label className="mb-1 block font-subheading text-sm text-ieee-light-grey">
												Tell us about yourself
											</label>
											<textarea
												rows={3}
												placeholder="Your message..."
												className="w-full resize-none rounded-sm border border-ieee-grey bg-ieee-dark-grey px-3 py-2 text-white transition-colors placeholder:text-ieee-grey focus:border-ieee-bright-yellow focus:ring-1 focus:ring-ieee-bright-yellow focus:outline-none"
											/>
										</div>

										<div className="space-y-2">
											<div className="flex items-center gap-2">
												<input
													type="checkbox"
													id="terms"
													className="h-4 w-4 rounded border-ieee-grey accent-ieee-dark-yellow"
												/>
												<label
													htmlFor="terms"
													className="font-subheading text-sm text-ieee-light-grey"
												>
													I agree to the terms
												</label>
											</div>

											<div className="flex items-center gap-2">
												<input
													type="checkbox"
													id="newsletter"
													className="h-4 w-4 rounded border-ieee-grey accent-ieee-dark-yellow"
												/>
												<label
													htmlFor="newsletter"
													className="font-subheading text-sm text-ieee-light-grey"
												>
													Subscribe to our newsletter
												</label>
											</div>
										</div>

										<div className="flex justify-end gap-2 pt-4">
											<Button variant="secondary">Cancel</Button>
											<Button type="submit">Submit</Button>
										</div>
									</form>
								</div>
							</div>
						)}
					</section>
				)}

				{/* Navigation */}
				{(expandedSection === 'navigation' || expandedSection === null) && (
					<section className="mb-16">
						<div
							onClick={() => toggleSection('navigation')}
							className="mb-6 flex cursor-pointer items-center justify-between rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-4 transition-colors hover:border-ieee-grey"
						>
							<h2 className="font-heading text-2xl text-ieee-bright-yellow">
								Navigation
							</h2>
							<span className="text-ieee-light-grey">↓</span>
						</div>

						{expandedSection === 'navigation' && (
							<div className="space-y-6">
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Text Navigation Links
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										Simple text links that turn yellow on hover.
									</p>
									<div className="flex flex-wrap gap-4">
										<Link
											href="/"
											className="font-body text-white transition-colors hover:text-ieee-bright-yellow"
										>
											Home
										</Link>
										<Link
											href="/events"
											className="font-body text-white transition-colors hover:text-ieee-bright-yellow"
										>
											Events
										</Link>
										<Link
											href="/projects"
											className="font-body text-white transition-colors hover:text-ieee-bright-yellow"
										>
											Projects
										</Link>
										<Link
											href="/about"
											className="font-body text-white transition-colors hover:text-ieee-bright-yellow"
										>
											About
										</Link>
									</div>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Link as Button (asChild)
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										Navigation links that look like buttons. Use with Next.js
										Link.
									</p>
									<div className="flex flex-wrap gap-3">
										<Button asChild>
											<Link href="/">View Home</Link>
										</Button>
										<Button variant="secondary" asChild>
											<Link href="/style-guide">Style Guide</Link>
										</Button>
										<Button variant="outline" asChild>
											<Link href="/events">Browse Events</Link>
										</Button>
									</div>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Breadcrumb Navigation
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										Hierarchical path showing user location.
									</p>
									<div className="flex items-center gap-2 font-body text-sm">
										<Link
											href="/"
											className="text-white transition-colors hover:text-ieee-bright-yellow"
										>
											Home
										</Link>
										<span className="text-ieee-grey">/</span>
										<Link
											href="/events"
											className="text-white transition-colors hover:text-ieee-bright-yellow"
										>
											Events
										</Link>
										<span className="text-ieee-grey">/</span>
										<span className="text-ieee-light-grey">
											General Meeting
										</span>
									</div>
								</div>
							</div>
						)}
					</section>
				)}

				{/* Status & Feedback */}
				{(expandedSection === 'feedback' || expandedSection === null) && (
					<section className="mb-16">
						<div
							onClick={() => toggleSection('feedback')}
							className="mb-6 flex cursor-pointer items-center justify-between rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-4 transition-colors hover:border-ieee-grey"
						>
							<h2 className="font-heading text-2xl text-ieee-bright-yellow">
								Status & Feedback
							</h2>
							<span className="text-ieee-light-grey">↓</span>
						</div>

						{expandedSection === 'feedback' && (
							<div className="space-y-6">
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">Loading State</h3>
									<div className="flex items-center gap-3">
										<svg
											className="h-6 w-6 animate-spin text-ieee-dark-yellow"
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
											/>
										</svg>
										<span className="font-body text-white">
											Loading your events...
										</span>
									</div>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">Empty State</h3>
									<div className="py-8 text-center">
										<p className="mb-4 font-body text-ieee-light-grey">
											No events found
										</p>
										<Button>Create an Event</Button>
									</div>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Toast Notifications
									</h3>
									<div className="space-y-3">
										<div className="flex animate-in items-start gap-3 rounded-lg border border-green-800 bg-green-950 p-4">
											<span className="font-heading text-green-400">✓</span>
											<p className="font-body text-sm text-green-300">
												Successfully registered for the event!
											</p>
										</div>

										<div className="flex items-start gap-3 rounded-lg border border-red-800 bg-red-950 p-4">
											<span className="font-heading text-red-400">✕</span>
											<p className="font-body text-sm text-red-300">
												Failed to save changes. Please try again.
											</p>
										</div>

										<div className="flex items-start gap-3 rounded-lg border border-ieee-dark-yellow/40 bg-ieee-dark-yellow/10 p-4">
											<span className="font-heading text-ieee-dark-yellow">
												!
											</span>
											<p className="font-body text-sm text-ieee-light-grey">
												This event requires active IEEE membership.{' '}
												<span className="cursor-pointer text-ieee-dark-yellow underline">
													Learn more
												</span>
											</p>
										</div>
									</div>
								</div>
							</div>
						)}
					</section>
				)}

				{/* Complex Patterns */}
				{(expandedSection === 'complex' || expandedSection === null) && (
					<section className="mb-16">
						<div
							onClick={() => toggleSection('complex')}
							className="mb-6 flex cursor-pointer items-center justify-between rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-4 transition-colors hover:border-ieee-grey"
						>
							<h2 className="font-heading text-2xl text-ieee-bright-yellow">
								Complex Patterns
							</h2>
							<span className="text-ieee-light-grey">↓</span>
						</div>

						{expandedSection === 'complex' && (
							<div className="space-y-6">
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Member Profile Card
									</h3>
									<div className="max-w-sm overflow-hidden rounded-lg border border-ieee-dark-grey bg-ieee-dark-grey/40">
										<div className="h-24 bg-gradient-to-r from-ieee-dark-yellow to-ieee-bright-yellow" />
										<div className="relative -mt-12 p-6">
											<div className="mx-auto mb-4 h-24 w-24 rounded-full border-4 border-ieee-near-black bg-ieee-dark-grey" />
											<h4 className="mb-1 text-center font-heading text-lg text-white">
												Jane Doe
											</h4>
											<p className="mb-4 text-center font-body text-sm text-ieee-light-grey">
												Chair • Computer Science
											</p>
											<div className="flex gap-2">
												<Button
													variant="outline"
													size="sm"
													className="flex-1"
												>
													Message
												</Button>
												<Button size="sm" className="flex-1">
													View Profile
												</Button>
											</div>
										</div>
									</div>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Tag / Skill Badge Grid
									</h3>
									<div className="flex flex-wrap gap-2">
										{[
											'Hardware',
											'Software',
											'Web Dev',
											'Machine Learning',
											'Embedded Systems',
											'Design',
											'Testing',
											'DevOps',
										].map((tag) => (
											<span
												key={tag}
												className="cursor-pointer rounded-sm bg-ieee-dark-grey px-3 py-1 font-body text-sm text-white transition-colors hover:bg-ieee-grey"
											>
												{tag}
											</span>
										))}
									</div>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Filter Row with Buttons
									</h3>
									<div className="mb-4 flex flex-wrap gap-2">
										<Button variant="outline">All</Button>
										<Button variant="outline">Hardware</Button>
										<Button variant="outline">Software</Button>
										<Button variant="outline">Active</Button>
										<Button variant="outline">Completed</Button>
									</div>
									<p className="font-body text-sm text-ieee-light-grey">
										Showing 5 of 12 projects
									</p>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Timeline / List Item
									</h3>
									<div className="space-y-4">
										{[
											'January 15 — General Meeting',
											'January 22 — Hackathon',
											'February 5 — Workshop',
										].map((item, i) => (
											<div key={item} className="flex gap-4">
												<div className="flex flex-col items-center">
													<div className="h-3 w-3 rounded-full bg-ieee-dark-yellow" />
													{i < 2 && (
														<div className="h-12 w-0.5 bg-ieee-dark-grey" />
													)}
												</div>
												<div>
													<p className="font-body text-white">{item}</p>
												</div>
											</div>
										))}
									</div>
								</div>

								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-4 font-subheading text-lg">
										Modal / Overlay Pattern
									</h3>
									<p className="mb-4 font-body text-sm text-ieee-light-grey">
										Dark backdrop with light content. Full-screen or centered
										dialog.
									</p>
									<div className="relative rounded-lg bg-black/60 p-8 text-center">
										<div className="mx-auto max-w-sm rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
											<h4 className="mb-2 font-heading text-xl text-white">
												Confirm Action
											</h4>
											<p className="mb-6 font-body text-sm text-ieee-light-grey">
												Are you sure you want to delete this event? This
												cannot be undone.
											</p>
											<div className="flex justify-center gap-2">
												<Button variant="secondary">Cancel</Button>
												<Button variant="destructive">Delete</Button>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}
					</section>
				)}

				{/* Custom Components */}
				{(expandedSection === 'custom' || expandedSection === null) && (
					<section className="mb-16">
						<div
							onClick={() => toggleSection('custom')}
							className="mb-6 flex cursor-pointer items-center justify-between rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-4 transition-colors hover:border-ieee-grey"
						>
							<h2 className="font-heading text-2xl text-ieee-bright-yellow">
								Custom Components
							</h2>
							<span className="text-ieee-light-grey">↓</span>
						</div>

						{expandedSection === 'custom' && (
							<div className="space-y-8">
								{/* QR Event Scanner */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-2 font-subheading text-lg">
										QR Event Scanner
									</h3>
									<p className="mb-6 font-body text-sm text-ieee-light-grey">
										Admin tool for scanning QR codes to mark attendees at
										events. Used on the admin dashboard. Requires an active
										event to record attendance against.
									</p>
									<QREventScanner />
								</div>

								{/* Event List */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-2 font-subheading text-lg">Event List</h3>
									<p className="mb-6 font-body text-sm text-ieee-light-grey">
										Displays all upcoming and past events pulled from the
										database via tRPC. Used on the member dashboard.
									</p>
									<EventList />
								</div>

								{/* Form Popup */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-2 font-subheading text-lg">
										Create Event Form
									</h3>
									<p className="mb-6 font-body text-sm text-ieee-light-grey">
										Modal form for creating new events. Trigger the button below
										to open the full form.
									</p>
									<FormPopup />
								</div>

								{/* Timer */}
								<div className="rounded-lg border border-ieee-dark-grey bg-ieee-near-black p-6">
									<h3 className="mb-2 font-subheading text-lg">
										Countdown Timer
									</h3>
									<p className="mb-6 font-body text-sm text-ieee-light-grey">
										Animated countdown used for events and deadlines. Displays
										days, hours, minutes, and seconds.
									</p>
									<Timer />
								</div>
							</div>
						)}
					</section>
				)}

				{/* Footer */}
				<section className="border-t border-ieee-dark-grey py-12">
					<p className="text-center font-body text-sm text-ieee-grey">
						See{' '}
						<Link
							href="/style-guide"
							className="text-ieee-light-grey hover:text-ieee-bright-yellow"
						>
							/style-guide
						</Link>{' '}
						for color and typography reference. See{' '}
						<Link
							href="/docs"
							className="text-ieee-light-grey hover:text-ieee-bright-yellow"
						>
							docs/COMPONENTS.md
						</Link>{' '}
						for code patterns.
					</p>
				</section>
			</div>
		</div>
	);
}
