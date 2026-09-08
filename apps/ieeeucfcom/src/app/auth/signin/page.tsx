import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/database/client";
import { Members } from "@/lib/database/schema";
import { eq } from "drizzle-orm";
import Signinblock from "@/components/signin";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export default async function SignInPage() {
	const session = await getServerSession(authOptions);

	if (session?.user) {
		const [member] = await db
			.select()
			.from(Members)
			.where(eq(Members.userId, session.user.id))
			.limit(1);

		if (member) {
			redirect("/dashboard");
		} else {
			redirect("/auth/register");
		}
	}

	// Local dev only: offer the /api/dev/login bypass so contributors without Discord
	// OAuth credentials can still sign in. Never true in a deployed environment.
	const devLogin =
		process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === 'true';

	return (
		<div className="flex flex-col max-w-screen overflow-x-hidden">
			<div className="relative w-full">
				<div className="flex flex-col w-full relative h-screen items-center [background:radial-gradient(125%_125%_at_50%_10%,#0c0a09_40%,#FFC72C_100%)]">
					<div className="px-5 w-full">
						<Navbar />
					</div>
					<div className="flex flex-1 items-center justify-center w-full">
						<Signinblock devLogin={devLogin} />
					</div>
				</div>
				<Footer />
			</div>
		</div>
	);
}
