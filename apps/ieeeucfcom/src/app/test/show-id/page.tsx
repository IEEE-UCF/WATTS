'use client';
import React from 'react';
import { trpc } from '@/lib/trpc/client';
import { MemberQRCode } from '@/components/qr/member-qr-code';
// import { Navbar } from '@/components/navbar';

const ShowIdPage = () => {
	const { data: session, isLoading, isError } = trpc.auth.getSession.useQuery();

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-xl text-foreground">Loading session data...</p>
			</div>
		);
	}

	if (isError || !session?.user?.discordId) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-xl text-red-400">
					Error loading session or Discord ID not found.
				</p>
			</div>
		);
	}

	const memberData = {
		id: session.user.discordId,
		// Add other member details as needed
		// name: "John Doe",
		// email: "john.doe@email.com",
		// membershipType: "Student",
		// chapter: "UCF",
	};

	const memberInfoString = JSON.stringify(memberData);

	return (
		<div className="min-h-screen bg-background py-8">
			<div className="mx-auto max-w-4xl px-4">
				<h1 className="mb-8 text-center text-3xl font-bold text-foreground">
					QR Code Testing
				</h1>

				<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
					{/* QR Code with IEEE-UCF Logo */}
					<div className="rounded-lg bg-card p-6 shadow-md">
						<h2 className="mb-4 text-xl font-semibold text-foreground">
							QR Code with IEEE-UCF Logo
						</h2>
						<MemberQRCode
							memberInfo={memberInfoString}
							logoUrl="/iconography/ieeeucficon.png"
							variant="plain"
							errorCorrectionLevel="L"
						/>
						<div className="mt-4 text-sm text-muted-foreground">
							<p>
								<strong>Data:</strong> {memberInfoString}
							</p>
						</div>
					</div>

					{/* QR Code with no data sent */}
					<div className="rounded-lg bg-card p-6 shadow-md">
						<h2 className="mb-4 text-xl font-semibold text-foreground">
							QR Code with Icon
						</h2>
						<MemberQRCode
							memberInfo=""
							logoUrl="/iconography/ieeeucficon.png"
							logoSize={40}
							variant="plain"
							errorCorrectionLevel="L"
						/>
						<div className="mt-4 text-sm text-muted-foreground">
							<p>
								<strong>Blank</strong>
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ShowIdPage;
