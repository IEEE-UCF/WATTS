'use client';
import Link from 'next/link';
import React from 'react';
import Image from 'next/image';
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
	image: string; // Define the type for the image prop
}

const AvatarMenu: React.FC<AvatarMenuProps> = ({ image }) => {
	return (
		<div className="z-100">
			<NavigationMenu>
				<NavigationMenuItem>
					<NavigationMenuTrigger>
						<Image
							className="h-12 w-12 cursor-pointer rounded-full border border-white object-cover transition-all hover:scale-107"
							src={image}
							alt="Profile"
							width={2000}
							height={2000}
						/>
					</NavigationMenuTrigger>

					<NavigationMenuContent>
						<div className="grid w-fit gap-4 rounded-md bg-[var(--ieee-dark-yellow)]">
							<div className="flex flex-col">
								<NavigationMenuLink asChild>
									<Link
										href="/dashboard"
										className="m-1 flex-row items-center gap-2 font-[subheading-font] text-white transition-all hover:bg-[var(--ieee-bright-yellow)]"
									>
										DASHBOARD
									</Link>
								</NavigationMenuLink>

								<NavigationMenuLink asChild>
									<Link
										href="/settings"
										className="m-1 flex-row items-center gap-2 font-[subheading-font] text-white transition-all hover:bg-[var(--ieee-bright-yellow)]"
									>
										SETTINGS
									</Link>
								</NavigationMenuLink>
							</div>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
			</NavigationMenu>
		</div>
	);
};

export { AvatarMenu };
