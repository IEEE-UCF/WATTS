'use client';

import React from 'react';
import { trpc } from '@/lib/trpc/client';

export function AddAttendeeButton() {
	const [selectedEventId, setSelectedEventId] = React.useState('');
	const [discordId, setDiscordId] = React.useState('391510831050784774');

	const { data: events = [], isLoading: eventsLoading } = trpc.event.getAll.useQuery();

	const addAttendee = trpc.event.addAttendee.useMutation({
		onSuccess: () => alert('Successfully added attendee!'),
		onError: (err) => alert(`Failed to add attendee: ${err.message}`),
	});

	return (
		<div className="mb-4 flex w-full max-w-sm flex-col gap-3">
			<select
				value={selectedEventId}
				onChange={(e) => setSelectedEventId(e.target.value)}
				className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
				disabled={eventsLoading}
			>
				<option value="" disabled>
					{eventsLoading ? 'Loading events...' : '-- Select an event --'}
				</option>
				{events.map((event) => (
					<option key={event.id} value={event.id}>
						{event.title}
					</option>
				))}
			</select>
			<input
				type="text"
				value={discordId}
				onChange={(e) => setDiscordId(e.target.value)}
				placeholder="Discord ID"
				className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
			/>
			<button
				onClick={() => addAttendee.mutate({ eventId: selectedEventId, discordId })}
				disabled={addAttendee.isPending || !selectedEventId || !discordId}
				className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{addAttendee.isPending ? 'Adding...' : 'Add Test Attendee'}
			</button>
		</div>
	);
}
