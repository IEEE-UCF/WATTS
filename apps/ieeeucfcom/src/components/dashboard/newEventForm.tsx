'use client';
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

type HostType = 'club' | 'committee' | 'project' | 'member' | '';

const ROOM_RESERVATION_STATUSES = ['none', 'unsubmitted', 'pending', 'confirmed', 'rejected'] as const;
type RoomReservationStatus = (typeof ROOM_RESERVATION_STATUSES)[number];
const ROOM_RESERVATION_LABELS: Record<RoomReservationStatus, string> = {
	none: 'Not needed',
	unsubmitted: 'Unsubmitted',
	pending: 'Pending',
	confirmed: 'Confirmed',
	rejected: 'Rejected',
};

interface EventFormData {
	title: string;
	location: string;
	hostType: HostType;
	startTime: string;
	endTime: string;
	requiresDues: boolean;
	description: string;
	flyerUrl: string;
	rsvpLink: string;
	roomReservationStatus: RoomReservationStatus;
	roomReservationRoom: string;
	roomReservationNumber: string;
	pingCreatorOnUpdate: boolean;
}

const formatDateTimeLocal = (isoString: string | null | undefined): string => {
	if (!isoString) return '';
	try {
		return isoString.slice(0, 16);
	} catch {
		return '';
	}
};

export const FormPopup: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [formData, setFormData] = useState<EventFormData>({
		title: '',
		location: '',
		hostType: '',
		startTime: '',
		endTime: '',
		requiresDues: false,
		description: '',
		flyerUrl: '',
		rsvpLink: '',
		roomReservationStatus: 'none',
		roomReservationRoom: '',
		roomReservationNumber: '',
		pingCreatorOnUpdate: false,
	});

	const utils = trpc.useUtils();

	const createEvent = trpc.event.create.useMutation({
		onSuccess: () => {
			void utils.event.getAll.invalidate();
			setIsOpen(false);
			setFormData({
				title: '',
				location: '',
				hostType: '',
				startTime: '',
				endTime: '',
				requiresDues: false,
				description: '',
				flyerUrl: '',
				rsvpLink: '',
				roomReservationStatus: 'none',
				roomReservationRoom: '',
				roomReservationNumber: '',
				pingCreatorOnUpdate: false,
			});
		},
		onError: (err) => {
			console.error('Failed to create event:', err);
		},
	});

	const togglePopup = () => setIsOpen(!isOpen);

	const loadDemoData = () => {
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const dayAfter = new Date(Date.now() + 25 * 60 * 60 * 1000);
		setFormData({
			title: 'Demo Event - Test Insertion',
			location: 'Virtual / Online',
			hostType: 'committee',
			startTime: formatDateTimeLocal(tomorrow.toISOString()),
			endTime: formatDateTimeLocal(dayAfter.toISOString()),
			requiresDues: false,
			description: 'This is a test event created for database insertion testing.',
			flyerUrl: '',
			rsvpLink: '',
			roomReservationStatus: 'none',
			roomReservationRoom: '',
			roomReservationNumber: '',
			pingCreatorOnUpdate: false,
		});
	};

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
	) => {
		const { name, value, type } = e.target;
		const key = name as keyof EventFormData;
		if (type === 'checkbox') {
			setFormData((prev) => ({ ...prev, [key]: (e.target as HTMLInputElement).checked }));
		} else {
			setFormData((prev) => ({ ...prev, [key]: value }));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		await createEvent.mutateAsync({
			title: formData.title,
			description: formData.description,
			location: formData.location,
			startTime: new Date(formData.startTime).toISOString(),
			endTime: formData.endTime ? new Date(formData.endTime).toISOString() : undefined,
			flyerUrl: formData.flyerUrl || undefined,
			rsvpLink: formData.rsvpLink || undefined,
			requiresDues: formData.requiresDues,
			roomReservationStatus: formData.roomReservationStatus,
			roomReservationRoom:
				formData.roomReservationStatus === 'none' ? undefined : formData.roomReservationRoom || undefined,
			roomReservationNumber:
				formData.roomReservationStatus === 'none' ? undefined : formData.roomReservationNumber || undefined,
			pingCreatorOnUpdate: formData.pingCreatorOnUpdate,
		});
	};

	return (
		<div>
			<button
				onClick={togglePopup}
				className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
			>
				Create Event
			</button>
			{isOpen && (
				// Slide-over drawer, not a centered dialog — keeps the event list in place
				// behind it instead of swapping the whole screen for the form.
				<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
					<div className="absolute inset-y-0 right-0 h-full w-full max-w-lg overflow-y-auto border-l border-border bg-card p-8 text-foreground shadow-2xl shadow-black/60">
						<h2 className="mb-4 text-2xl">Create Event</h2>
						<form onSubmit={handleSubmit}>
							<div className="mb-4">
								<label
									htmlFor="title"
									className="block text-sm font-medium text-muted-foreground"
								>
									Title
								</label>
								<input
									type="text"
									name="title"
									id="title"
									value={formData.title}
									onChange={handleChange}
									required
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="location"
									className="block text-sm font-medium text-muted-foreground"
								>
									Location
								</label>
								<input
									type="text"
									name="location"
									id="location"
									value={formData.location}
									onChange={handleChange}
									required
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="hostType"
									className="block text-sm font-medium text-muted-foreground"
								>
									Host Type
								</label>
								<select
									name="hostType"
									id="hostType"
									value={formData.hostType}
									onChange={handleChange}
									required
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								>
									<option value="">Select Host Type</option>
									<option value="club">Club</option>
									<option value="committee">Committee</option>
									<option value="project">Project</option>
									<option value="member">Member</option>
								</select>
							</div>
							<div className="mb-4">
								<label
									htmlFor="startTime"
									className="block text-sm font-medium text-muted-foreground"
								>
									Start Time
								</label>
								<input
									type="datetime-local"
									name="startTime"
									id="startTime"
									value={formData.startTime}
									onChange={handleChange}
									required
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="endTime"
									className="block text-sm font-medium text-muted-foreground"
								>
									End Time
								</label>
								<input
									type="datetime-local"
									name="endTime"
									id="endTime"
									value={formData.endTime}
									onChange={handleChange}
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="description"
									className="block text-sm font-medium text-muted-foreground"
								>
									Description
								</label>
								<textarea
									name="description"
									id="description"
									value={formData.description}
									onChange={handleChange}
									rows={3}
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="flyerUrl"
									className="block text-sm font-medium text-muted-foreground"
								>
									Flyer URL
								</label>
								<input
									type="text"
									name="flyerUrl"
									id="flyerUrl"
									value={formData.flyerUrl}
									onChange={handleChange}
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="rsvpLink"
									className="block text-sm font-medium text-muted-foreground"
								>
									RSVP Link
								</label>
								<input
									type="text"
									name="rsvpLink"
									id="rsvpLink"
									value={formData.rsvpLink}
									onChange={handleChange}
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="roomReservationStatus"
									className="block text-sm font-medium text-muted-foreground"
								>
									SU Room Reservation
								</label>
								<select
									name="roomReservationStatus"
									id="roomReservationStatus"
									value={formData.roomReservationStatus}
									onChange={handleChange}
									className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
								>
									{ROOM_RESERVATION_STATUSES.map((s) => (
										<option key={s} value={s}>
											{ROOM_RESERVATION_LABELS[s]}
										</option>
									))}
								</select>
							</div>
							{formData.roomReservationStatus !== 'none' && (
								<div className="mb-4 ml-6 grid grid-cols-2 gap-3">
									<div>
										<label
											htmlFor="roomReservationRoom"
											className="block text-sm font-medium text-muted-foreground"
										>
											Room (optional)
										</label>
										<input
											type="text"
											name="roomReservationRoom"
											id="roomReservationRoom"
											value={formData.roomReservationRoom}
											onChange={handleChange}
											className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
										/>
									</div>
									<div>
										<label
											htmlFor="roomReservationNumber"
											className="block text-sm font-medium text-muted-foreground"
										>
											Reservation # (optional)
										</label>
										<input
											type="text"
											name="roomReservationNumber"
											id="roomReservationNumber"
											value={formData.roomReservationNumber}
											onChange={handleChange}
											className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-foreground shadow-sm sm:text-sm"
										/>
									</div>
								</div>
							)}
							<div className="mb-4 flex items-center">
								<input
									type="checkbox"
									name="requiresDues"
									id="requiresDues"
									checked={formData.requiresDues}
									onChange={handleChange}
									className="h-4 w-4 rounded border-input bg-card text-indigo-600"
								/>
								<label
									htmlFor="requiresDues"
									className="ml-2 block text-sm text-foreground"
								>
									Requires Dues
								</label>
							</div>
							<div className="mb-4 flex items-center">
								<input
									type="checkbox"
									name="pingCreatorOnUpdate"
									id="pingCreatorOnUpdate"
									checked={formData.pingCreatorOnUpdate}
									onChange={handleChange}
									className="h-4 w-4 rounded border-input bg-card text-indigo-600"
								/>
								<label
									htmlFor="pingCreatorOnUpdate"
									className="ml-2 block text-sm text-foreground"
								>
									Ping Creator on Discord for updates
								</label>
							</div>
							{createEvent.isError && (
								<p className="mb-4 text-sm text-red-400">
									{createEvent.error.message}
								</p>
							)}
							<div className="flex justify-end">
								<button
									type="button"
									onClick={loadDemoData}
									className="mr-3 rounded-md bg-indigo-600 px-4 py-2 text-white"
								>
									Load Demo Data
								</button>
								<button
									type="button"
									onClick={togglePopup}
									className="mr-2 rounded-md bg-muted-foreground-dim px-4 py-2 text-white"
								>
									Close
								</button>
								<button
									type="submit"
									disabled={createEvent.isPending}
									className="rounded-md bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
								>
									{createEvent.isPending ? 'Submitting...' : 'Submit'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
};
