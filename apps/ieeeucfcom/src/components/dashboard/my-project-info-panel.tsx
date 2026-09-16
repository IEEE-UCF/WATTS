'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardTitle } from '@watts/ui/card';
import { TagInput } from '@/components/tag-input';

interface EditableProject {
	id: string;
	title: string;
	hardwareInfo: string | null;
	softwareInfo: string | null;
	skills: string | null;
}

function ProjectInfoEditor({ project }: { project: EditableProject }) {
	const utils = trpc.useUtils();
	const [hardwareInfo, setHardwareInfo] = useState(project.hardwareInfo ?? '');
	const [softwareInfo, setSoftwareInfo] = useState(project.softwareInfo ?? '');
	const [skills, setSkills] = useState(project.skills ?? '');

	const update = trpc.project.updateOwnProjectInfo.useMutation({
		onSuccess: () => {
			void utils.project.myLedProjects.invalidate();
			void utils.project.getAll.invalidate();
		},
	});

	const dirty =
		hardwareInfo !== (project.hardwareInfo ?? '') ||
		softwareInfo !== (project.softwareInfo ?? '') ||
		skills !== (project.skills ?? '');

	return (
		<div className="rounded-md border border-input p-3">
			<div className="mb-2 text-xs font-semibold text-muted-foreground">{project.title}</div>
			<div className="flex flex-col gap-3">
				<TagInput
					label="Hardware skills/tags"
					value={hardwareInfo}
					onChange={setHardwareInfo}
				/>
				<TagInput
					label="Software skills/tags"
					value={softwareInfo}
					onChange={setSoftwareInfo}
				/>
				<TagInput label="Other skills/tags" value={skills} onChange={setSkills} />
			</div>
			<div className="mt-3 flex items-center gap-3">
				<button
					type="button"
					disabled={!dirty || update.isPending}
					onClick={() =>
						update.mutate({ projectId: project.id, hardwareInfo, softwareInfo, skills })
					}
					className="rounded-md bg-ieee-dark-yellow px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
				>
					{update.isPending ? 'Saving…' : 'Save'}
				</button>
				{update.isSuccess && !dirty && (
					<span className="text-xs text-green-400">Saved</span>
				)}
				{update.error && (
					<span className="text-xs text-red-400">{update.error.message}</span>
				)}
			</div>
		</div>
	);
}

/**
 * Non-officer leads can't reach /admin/projects (gated on manage_projects), but they
 * can still keep their own project's hardware/software/skills tags current. Renders
 * nothing for a member who isn't a lead of anything.
 */
export function MyProjectInfoPanel() {
	const { data } = trpc.project.myLedProjects.useQuery();

	if (!data || data.length === 0) return null;

	return (
		<Card className="gap-3 rounded-xl border-border bg-card/60 p-4 shadow-lg shadow-black/40">
			<CardTitle className="text-sm font-semibold text-foreground">
				Edit your project&apos;s info
			</CardTitle>
			<div className="flex flex-col gap-3">
				{data.map((p) => (
					<ProjectInfoEditor key={p.id} project={p} />
				))}
			</div>
		</Card>
	);
}
