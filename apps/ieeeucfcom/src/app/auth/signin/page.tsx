import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/database/client';
import { Members } from '@watts/db/schema';
import { eq } from 'drizzle-orm';
import Signinblock from '@/components/signin';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export default async function SignInPage() {
	const session = await getServerSession(authOptions);

	if (session?.user) {
		const [member] = await db
			.select()
			.from(Members)
			.where(eq(Members.userId, session.user.id))
			.limit(1);

		if (member) {
			redirect('/dashboard');
		} else {
			redirect('/auth/register');
		}
	}

	return (
		<div className="flex max-w-screen flex-col overflow-x-hidden">
			<div className="relative w-full">
				<div className="relative flex h-screen w-full flex-col items-center [background:radial-gradient(125%_125%_at_50%_10%,#0c0a09_40%,#FFC72C_100%)]">
					<div className="w-full px-5">
						<Navbar />
					</div>
					<div className="flex w-full flex-1 items-center justify-center">
						<Signinblock />
					</div>
				</div>
				<Footer />
			</div>
		</div>
	);
}
