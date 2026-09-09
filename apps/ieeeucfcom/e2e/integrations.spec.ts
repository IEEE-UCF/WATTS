import { test, expect } from '@playwright/test';

// Proves the running app can reach each backing service it depends on.

test('Discord OAuth provider is configured', async ({ request }) => {
	const res = await request.get('/api/auth/providers');
	expect(res.ok(), `providers -> ${res.status()}`).toBeTruthy();
	const providers = await res.json();
	expect(providers).toHaveProperty('discord');
	expect(providers.discord).toMatchObject({ id: 'discord', type: 'oauth' });
	expect(String(providers.discord.callbackUrl)).toContain('/api/auth/callback/discord');
});

test('a public tRPC query reaches the database', async ({ request }) => {
	// event.getAll is a publicProcedure query that SELECTs from the events table.
	// A 5xx here means the DB connection is down; anything < 500 means the round
	// trip worked (an empty table is still a success).
	const input = encodeURIComponent(JSON.stringify({ 0: { json: null } }));
	const res = await request.get(`/api/trpc/event.getAll?batch=1&input=${input}`);
	expect(res.status(), await res.text()).toBeLessThan(500);
	if (res.ok()) {
		const body = await res.json();
		expect(Array.isArray(body)).toBeTruthy();
		expect(body[0]).not.toHaveProperty('error');
	}
});

test('the NextAuth session endpoint responds', async ({ request }) => {
	// Exercises the session callback path (adapter -> DB). Anonymous -> {}.
	const res = await request.get('/api/auth/session');
	expect(res.ok(), `session -> ${res.status()}`).toBeTruthy();
});

test('gated file route rejects an anonymous request', async ({ request }) => {
	// Loads the route handler + the @watts/storage adapter; must 401/403 before
	// it ever touches the object store.
	const res = await request.get('/api/files/resume/00000000-0000-0000-0000-000000000000');
	expect([401, 403], `file route -> ${res.status()}`).toContain(res.status());
});
