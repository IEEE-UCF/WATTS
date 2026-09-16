import { memberRouter } from './routers/member';
import { createTRPCRouter, createCallerFactory } from './trpc';
import { authRouter } from './routers/auth';
import { eventRouter } from './routers/event';
import { eventLabelRouter } from './routers/event-label';
import { officerRouter } from './routers/officer';
import { projectRouter } from './routers/project';
import { projectCategoryRouter } from './routers/project-category';
import { committeeRouter } from './routers/committee';
import { awardRouter } from './routers/award';
import { meetingTimeRouter } from './routers/meetingTime';
import { storageRouter } from './routers/storage';
import { settingsRouter } from './routers/settings';

export const appRouter = createTRPCRouter({
	member: memberRouter,
	auth: authRouter,
	event: eventRouter,
	eventLabel: eventLabelRouter,
	officer: officerRouter,
	project: projectRouter,
	projectCategory: projectCategoryRouter,
	committee: committeeRouter,
	award: awardRouter,
	meetingTime: meetingTimeRouter,
	storage: storageRouter,
	settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);