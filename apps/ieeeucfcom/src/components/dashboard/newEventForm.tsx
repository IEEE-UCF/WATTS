'use client';
import React, { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

type HostType = 'club' | 'committee' | 'project' | 'member' | '';

interface EventFormData {
	title: string;
	location: string;
	hostType: HostType;
	hostId: string;
	startTime: string;
	endTime: string;
	requiresDues: boolean;
	description: string;
	flyerUrl: string;
	rsvpLink: string;
	needsRoomReservation: boolean;
	manuallyGivenRoom: boolean;
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
		hostId: '',
		startTime: '',
		endTime: '',
		requiresDues: false,
		description: '',
		flyerUrl: '',
		rsvpLink: '',
		needsRoomReservation: false,
		manuallyGivenRoom: false,
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
				hostId: '',
				startTime: '',
				endTime: '',
				requiresDues: false,
				description: '',
				flyerUrl: '',
				rsvpLink: '',
				needsRoomReservation: false,
				manuallyGivenRoom: false,
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
			hostId: '',
			startTime: formatDateTimeLocal(tomorrow.toISOString()),
			endTime: formatDateTimeLocal(dayAfter.toISOString()),
			requiresDues: false,
			description: 'This is a test event created for database insertion testing.',
			flyerUrl: '',
			rsvpLink: '',
			needsRoomReservation: false,
			manuallyGivenRoom: false,
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
			committeeId:
				formData.hostType === 'committee' && formData.hostId ? formData.hostId : undefined,
			flyerUrl: formData.flyerUrl || undefined,
			rsvpLink: formData.rsvpLink || undefined,
			requiresDues: formData.requiresDues,
			needsRoomReservation: formData.needsRoomReservation,
			manuallyGivenRoom: formData.manuallyGivenRoom,
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
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-8 text-black">
						<h2 className="mb-4 text-2xl">Create Event</h2>
						<form onSubmit={handleSubmit}>
							<div className="mb-4">
								<label
									htmlFor="title"
									className="block text-sm font-medium text-gray-700"
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
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="location"
									className="block text-sm font-medium text-gray-700"
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
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="hostType"
									className="block text-sm font-medium text-gray-700"
								>
									Host Type
								</label>
								<select
									name="hostType"
									id="hostType"
									value={formData.hostType}
									onChange={handleChange}
									required
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
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
									className="block text-sm font-medium text-gray-700"
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
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="endTime"
									className="block text-sm font-medium text-gray-700"
								>
									End Time
								</label>
								<input
									type="datetime-local"
									name="endTime"
									id="endTime"
									value={formData.endTime}
									onChange={handleChange}
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="description"
									className="block text-sm font-medium text-gray-700"
								>
									Description
								</label>
								<textarea
									name="description"
									id="description"
									value={formData.description}
									onChange={handleChange}
									rows={3}
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="flyerUrl"
									className="block text-sm font-medium text-gray-700"
								>
									Flyer URL
								</label>
								<input
									type="text"
									name="flyerUrl"
									id="flyerUrl"
									value={formData.flyerUrl}
									onChange={handleChange}
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4">
								<label
									htmlFor="rsvpLink"
									className="block text-sm font-medium text-gray-700"
								>
									RSVP Link
								</label>
								<input
									type="text"
									name="rsvpLink"
									id="rsvpLink"
									value={formData.rsvpLink}
									onChange={handleChange}
									className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm sm:text-sm"
								/>
							</div>
							<div className="mb-4 flex items-center">
								<input
									type="checkbox"
									name="needsRoomReservation"
									id="needsRoomReservation"
									checked={formData.needsRoomReservation}
									onChange={handleChange}
									className="h-4 w-4 rounded border-gray-300 text-indigo-600"
								/>
								<label
									htmlFor="needsRoomReservation"
									className="ml-2 block text-sm text-gray-900"
								>
									Needs SU Room Reservation
								</label>
							</div>
							{formData.needsRoomReservation && (
								<div className="mb-4 ml-6 flex items-center">
									<input
										type="checkbox"
										name="manuallyGivenRoom"
										id="manuallyGivenRoom"
										checked={formData.manuallyGivenRoom}
										onChange={handleChange}
										className="h-4 w-4 rounded border-gray-300 text-indigo-600"
									/>
									<label
										htmlFor="manuallyGivenRoom"
										className="ml-2 block text-sm text-gray-900"
									>
										Room is already confirmed (Skip Tracking)
									</label>
								</div>
							)}
							<div className="mb-4 flex items-center">
								<input
									type="checkbox"
									name="requiresDues"
									id="requiresDues"
									checked={formData.requiresDues}
									onChange={handleChange}
									className="h-4 w-4 rounded border-gray-300 text-indigo-600"
								/>
								<label
									htmlFor="requiresDues"
									className="ml-2 block text-sm text-gray-900"
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
									className="h-4 w-4 rounded border-gray-300 text-indigo-600"
								/>
								<label
									htmlFor="pingCreatorOnUpdate"
									className="ml-2 block text-sm text-gray-900"
								>
									Ping Creator on Discord for updates
								</label>
							</div>
							{createEvent.isError && (
								<p className="mb-4 text-sm text-red-600">
									{createEvent.error.message}
								</p>
							)}
							<div className="flex justify-end">
								<button
									type="button"
									onClick={loadDemoData}
									className="mr-30 rounded-md bg-indigo-600 px-4 py-2 text-white"
								>
									Load Demo Data
								</button>
								<button
									type="button"
									onClick={togglePopup}
									className="mr-2 rounded-md bg-gray-500 px-4 py-2 text-white"
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
