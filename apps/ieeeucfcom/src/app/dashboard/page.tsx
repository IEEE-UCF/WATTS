import { Navbar } from '@/components/navbar';
import { EventList } from '@/components/dashboard/event-list';
import { Member_QR_Code } from '@/components/dashboard/member-qr-code';
import { Card, CardHeader, CardTitle } from '@watts/ui/card';

export default function Dashboard() {
	return (
		<div className="flex min-h-screen max-w-screen flex-col overflow-hidden bg-black">
			{/* Navbar – match home/admin spacing */}
			<div className="w-full px-5">
				<Navbar />
			</div>

			{/* Dashboard Content */}
			<main className="flex-1">
				<div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
					{/* Left Panel – Upcoming Events */}
					{/* <section className="flex-1 rounded-xl border border-border bg-card/60 p-4 shadow-lg shadow-black/40 lg:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground lg:text-xl">
              Upcoming Events
            </h2>
            <EventList />
          </section> */}
					<Card className="flex-1 rounded-xl border border-border bg-ieee-black p-4 shadow-lg shadow-black/40 lg:p-6">
						<CardHeader>
							<CardTitle className="mb-1 text-lg font-semibold text-foreground lg:text-xl">
								Your Check-In QR
							</CardTitle>
						</CardHeader>
						<div className="flex justify-center">
							<Member_QR_Code />
						</div>
					</Card>

					{/* Left Panel – Upcoming Events */}
					<Card className="flex-1 rounded-xl border border-border bg-ieee-dark-grey p-4 shadow-lg shadow-black/40 lg:p-6">
						<CardTitle className="-mb-4 text-lg font-semibold text-foreground lg:text-xl">
							Upcoming Events
						</CardTitle>
						<EventList />
					</Card>

					{/* Right Panel – Member QR Code */}
					{/* <section className="flex-1 rounded-xl border border-border bg-card/60 p-4 shadow-lg shadow-black/40 lg:max-w-md lg:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground lg:text-xl">
              Your Check-In QR2
            </h2>
            <div className="flex justify-center">
              <Member_QR_Code />
            </div>
          </section> */}
				</div>
			</main>
		</div>
	);
}
