/**
 * IEEE Member QR Scanner Page
 *
 * This page provides the UI for scanning IEEE member QR codes for event check-in.
 * It uses the useMemberScanner hook for business logic and state management.
 *
 * Dependencies:
 * - @yudiel/react-qr-scanner: React wrapper for QR code scanning
 * - useMemberScanner: Custom hook for scanner logic
 * - Requires HTTPS for camera access (use npm run dev:https)
 *
 * Features:
 * - Live camera QR code scanning
 * - Member information display after scan
 * - Session-based check-in history
 * - Haptic feedback on successful scan
 *
 * To use
 * - Run the development server with HTTPS: npm run dev:https
 * - Navigate to /scan-qr to access the scanner page
 * - Scan member qr code found on /test-qr page
 */

'use client';
import React from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useMemberScanner } from '@/components/pg/memberqrcode-scan';
import { trpc } from '@/lib/trpc/client';

export default function ScanQRPage() {
	// ============================================
	// HOOK - Get scanner logic and state
	// ============================================
	const {
		isScanning,
		memberInfo,
		error,
		scanHistory,
		handleScan,
		handleError,
		resetScanner,
		clearHistory,
		setIsScanning,
	} = useMemberScanner();

	const [apiStatus, setApiStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>(
		'idle',
	);
	const [apiError, setApiError] = React.useState<string | null>(null);
	const [selectedEventId, setSelectedEventId] = React.useState<string>('');

	const {
		data: eventsData,
		isLoading: eventsLoading,
		error: eventsError,
	} = trpc.event.getAll.useQuery();
	const events = eventsData ?? [];

	const addAttendee = trpc.event.addAttendee.useMutation({
		onSuccess: () => setApiStatus('success'),
		onError: (err) => {
			setApiStatus('error');
			setApiError(err.message || 'Failed to add attendee.');
		},
	});

	React.useEffect(() => {
		if (memberInfo && selectedEventId) {
			setApiStatus('loading');
			setApiError(null);
			addAttendee.mutate({ eventId: selectedEventId, discordId: memberInfo.id });
		}
		// addAttendee is intentionally omitted from deps — its reference changes every render
	}, [memberInfo, selectedEventId]);

	// ============================================
	// RENDER / UI
	// ============================================

	return (
		<div className="min-h-screen bg-background p-4">
			<div className="mx-auto max-w-2xl">
				{/* ========== HEADER ========== */}
				<div className="mb-4 rounded-lg bg-card p-6 shadow-md">
					<h1 className="mb-2 text-center text-2xl font-bold text-foreground">
						IEEE Member Check-In
					</h1>
					<p className="mb-4 text-center text-sm text-muted-foreground">
						Select an event and scan member QR codes to check in.
					</p>

					{eventsLoading ? (
						<p className="text-center text-muted-foreground-dim">Loading events...</p>
					) : eventsError ? (
						<p className="text-center text-red-400">{eventsError.message}</p>
					) : (
						<div className="mx-auto max-w-xs">
							<label
								htmlFor="event-select"
								className="mb-1 block text-sm font-medium text-muted-foreground"
							>
								Select Event
							</label>
							<select
								id="event-select"
								value={selectedEventId}
								onChange={(e) => setSelectedEventId(e.target.value)}
								className="block w-full rounded-md border border-input bg-card py-2 pr-10 pl-3 text-base text-foreground focus:border-ring focus:ring-ring focus:outline-none sm:text-sm"
							>
								<option value="" disabled>
									-- Please choose an event --
								</option>
								{events.map((event) => (
									<option key={event.id} value={event.id}>
										{event.title}
									</option>
								))}
							</select>
						</div>
					)}
				</div>

				{/* ========== SCANNER SECTION ========== */}
				{/* Only show if isScanning is true, otherwise show results */}
				{isScanning ? (
					<div className="mb-4 rounded-lg bg-card p-6 shadow-md">
						<div className="mb-4">
							<h2 className="mb-2 text-lg font-semibold text-foreground">
								Camera Scanner
							</h2>
							<p className="mb-4 text-sm text-muted-foreground">
								Point camera at member&apos;s QR code
							</p>
						</div>

						{/* Show error message if camera access fails */}
						{error ? (
							<div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
								<p className="text-red-300">{error}</p>
							</div>
						) : (
							<div className="relative mx-auto aspect-square max-w-md overflow-hidden rounded-lg border-4 border-blue-500">
								<Scanner
									onScan={handleScan}
									onError={handleError}
									constraints={{
										facingMode: 'environment',
									}}
									styles={{
										container: {
											width: '100%',
											height: '100%',
										},
									}}
								/>
								<div className="pointer-events-none absolute inset-0">
									<div className="absolute top-1/2 left-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 transform rounded-lg border-2 border-white"></div>
								</div>
							</div>
						)}

						<div className="mt-4 text-center">
							<button
								onClick={() => setIsScanning(false)}
								className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground hover:bg-secondary/80"
							>
								Cancel
							</button>
						</div>
					</div>
				) : (
					/* ========== MEMBER INFO DISPLAY ========== */
					memberInfo && (
						<div className="mb-4 rounded-lg bg-card p-6 shadow-md">
							{apiStatus === 'loading' && (
								<div className="mb-4 text-center">
									<div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/15">
										<svg
											className="h-8 w-8 animate-spin text-blue-400"
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
											></circle>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
									</div>
									<h2 className="mb-2 text-xl font-bold text-blue-400">
										Checking In...
									</h2>
								</div>
							)}

							{apiStatus === 'success' && (
								<div className="mb-4 text-center">
									<div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
										<svg
											className="h-8 w-8 text-green-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M5 13l4 4L19 7"
											/>
										</svg>
									</div>
									<h2 className="mb-2 text-xl font-bold text-green-400">
										Check-In Successful!
									</h2>
								</div>
							)}

							{apiStatus === 'error' && (
								<div className="mb-4 text-center">
									<div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
										<svg
											className="h-8 w-8 text-red-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												d="M6 18L18 6M6 6l12 12"
											></path>
										</svg>
									</div>
									<h2 className="mb-2 text-xl font-bold text-red-400">
										Check-In Failed
									</h2>
									<p className="text-red-300">{apiError}</p>
								</div>
							)}

							<div className="mb-4 rounded-lg bg-secondary p-4">
								<h3 className="mb-2 font-semibold text-foreground">
									Member Information:
								</h3>
								<div className="space-y-2">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Member ID:</span>
										<span className="font-mono font-semibold text-foreground">
											{memberInfo.id}
										</span>
									</div>
									{memberInfo.data && (
										<>
											{memberInfo.data.name && (
												<div className="flex justify-between">
													<span className="text-muted-foreground">
														Name:
													</span>
													<span className="font-semibold text-foreground">
														{memberInfo.data.name}
													</span>
												</div>
											)}
											{memberInfo.data.chapter && (
												<div className="flex justify-between">
													<span className="text-muted-foreground">
														Chapter:
													</span>
													<span className="font-semibold text-foreground">
														{memberInfo.data.chapter}
													</span>
												</div>
											)}
										</>
									)}
									<div className="flex justify-between">
										<span className="text-muted-foreground">Time:</span>
										<span className="font-semibold text-foreground">
											{memberInfo.timestamp}
										</span>
									</div>
								</div>
							</div>

							<button
								onClick={resetScanner}
								className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
							>
								Scan Next Member
							</button>
						</div>
					)
				)}

				{/* ========== SCAN HISTORY ========== */}
				{scanHistory.length > 0 && (
					<div className="rounded-lg bg-card p-6 shadow-md">
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-lg font-semibold text-foreground">
								Check-In History ({scanHistory.length})
							</h2>
							<button
								onClick={clearHistory}
								className="text-sm text-red-400 hover:text-red-300"
							>
								Clear
							</button>
						</div>

						<div className="max-h-64 space-y-2 overflow-y-auto">
							{scanHistory.map((member, index) => (
								<div
									key={index}
									className="flex items-center justify-between rounded-lg bg-secondary p-3"
								>
									<div>
										<p className="font-semibold text-foreground">
											{member.data?.name ||
												`Member ${member.id.slice(0, 8)}...`}
										</p>
										<p className="text-xs text-muted-foreground-dim">
											{member.timestamp}
										</p>
									</div>
									<div className="text-green-400">
										<svg
											className="h-5 w-5"
											fill="currentColor"
											viewBox="0 0 20 20"
										>
											<path
												fillRule="evenodd"
												d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
												clipRule="evenodd"
											/>
										</svg>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* ========== IDLE STATE ========== */}
				{!isScanning && !memberInfo && (
					<div className="rounded-lg bg-card p-6 text-center shadow-md">
						<p className="mb-4 text-muted-foreground">
							{selectedEventId
								? 'Ready to scan for the selected event.'
								: 'Please select an event to begin scanning.'}
						</p>
						<button
							onClick={resetScanner}
							disabled={!selectedEventId}
							className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-muted-foreground-dim"
						>
							Start Scanning
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
