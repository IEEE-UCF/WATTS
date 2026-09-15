'use client';
import Link from 'next/link';
import React from 'react';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	//   NavigationMenuList,
	NavigationMenuTrigger,
	//   navigationMenuTriggerStyle,
} from '@watts/ui/navigation-menu';

interface AvatarMenuProps {
	image: string;
	name: string;
	email?: string | null;
	/** Display label — "Administrator", "Officer · Workshop Chair", or omitted for a plain member. */
	role?: string | null;
}

/**
 * Account menu behind the Discord pfp — opens on hover (a Radix NavigationMenu default,
 * not a click-triggered dropdown). Used on the marketing navbar (the only account access
 * on public pages) and the dashboard shell's topbar. Settings + Sign out is the one place
 * sign-out lives outside the bottom of the full /settings form.
 */
const AvatarMenu: React.FC<AvatarMenuProps> = ({ image, name, email, role }) => {
	return (
		<div className="z-100">
			<NavigationMenu viewport={false}>
				<NavigationMenuItem>
					<NavigationMenuTrigger className="h-auto w-auto rounded-full bg-transparent p-0 hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent">
						<Image
							className="h-12 w-12 cursor-pointer rounded-full border border-white object-cover transition-all hover:scale-107"
							src={image}
							alt="Profile"
							width={2000}
							height={2000}
						/>
					</NavigationMenuTrigger>

					<NavigationMenuContent>
						<div className="w-56 overflow-hidden rounded-md bg-ieee-dark-yellow">
							<div className="border-b border-black/15 px-3 py-2.5">
								<div className="truncate font-subheading text-sm text-black">
									{name}
								</div>
								{email && (
									<div className="truncate text-xs text-black/70">{email}</div>
								)}
								{role && (
									<span className="mt-1.5 inline-block rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-black uppercase">
										{role}
									</span>
								)}
							</div>
							<div className="flex flex-col p-1">
								<NavigationMenuLink asChild>
									<Link
										href="/settings"
										className="rounded px-2 py-1.5 font-subheading text-sm text-black transition-all hover:bg-ieee-bright-yellow"
									>
										SETTINGS
									</Link>
								</NavigationMenuLink>

								<button
									type="button"
									onClick={() => void signOut({ callbackUrl: '/' })}
									className="rounded px-2 py-1.5 text-left font-subheading text-sm text-black transition-all hover:bg-ieee-bright-yellow"
								>
									SIGN OUT
								</button>
							</div>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
			</NavigationMenu>
		</div>
	);
};

export { AvatarMenu };
