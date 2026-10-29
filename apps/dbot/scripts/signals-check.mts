/**
 * Validation for website → bot signals: the @watts/bot-signals envelope (sign, verify,
 * reject), SignalHandler delivery (debounce, coalescing, no overlapping runs) and
 * SignalRouter dispatch (fail closed, replay). No Discord or database needed:
 *
 *   pnpm --filter @watts/bot check:signals
 *
 * Exits non-zero if any case fails.
 */
import { decodeEnvelope, encodeEnvelope, type Signal, type SignalPayload } from '@watts/bot-signals';
import { SignalHandler } from '../src/structs/SignalHandler.ts';
import { SignalRouter } from '../src/modules/signals/SignalRouter.ts';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
	console.log(`${ok ? '  PASS' : '✗ FAIL'}  ${label}${detail && !ok ? `\n         ${detail}` : ''}`);
	if (!ok) failures++;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SECRET = 'check-secret';
const test: Signal = { type: 'bot.test', payload: { requestedBy: 'Check' } };

// ---------------------------------------------------------------------------
console.log('\nenvelope\n');

const text = encodeEnvelope([test], SECRET);
const ok = decodeEnvelope(text, SECRET);
check('round trip', ok.ok && ok.envelope.signals[0]?.type === 'bot.test', JSON.stringify(ok));

const reason = (r: ReturnType<typeof decodeEnvelope>) => (r.ok ? 'ok' : r.reason);
check('wrong secret → bad signature', reason(decodeEnvelope(text, 'other')) === 'bad signature');

const tampered = text.replace('"Check"', '"Mallory"');
check('tampered payload → bad signature', reason(decodeEnvelope(tampered, SECRET)) === 'bad signature');

const stale = encodeEnvelope([test], SECRET, { ts: Date.now() - 10 * 60 * 1000 });
check('10-minute-old envelope → stale', reason(decodeEnvelope(stale, SECRET)).startsWith('stale'));

check('not JSON → rejected', reason(decodeEnvelope('sync', SECRET)) === 'not JSON');

const unknown = encodeEnvelope([test, { type: 'nope.future', payload: {} } as unknown as Signal], SECRET);
const unknownResult = decodeEnvelope(unknown, SECRET);
check(
	'unknown type dropped, rest kept',
	unknownResult.ok &&
		unknownResult.envelope.signals.length === 1 &&
		unknownResult.dropped[0]?.reason === 'unknown type',
	JSON.stringify(unknownResult),
);

const invalid = encodeEnvelope([{ type: 'bot.test', payload: { requestedBy: 42 } } as unknown as Signal], SECRET);
const invalidResult = decodeEnvelope(invalid, SECRET);
check(
	'invalid payload dropped',
	invalidResult.ok && invalidResult.envelope.signals.length === 0 && invalidResult.dropped[0]?.reason === 'invalid payload',
);

let tooBig = false;
try {
	encodeEnvelope([{ type: 'bot.test', payload: { requestedBy: 'x'.repeat(80) } }], SECRET);
	encodeEnvelope(Array.from({ length: 40 }, () => test), SECRET);
} catch {
	tooBig = true;
}
check('oversized envelope throws', tooBig);

// ---------------------------------------------------------------------------
console.log('\nSignalHandler delivery\n');

const logger = { log() {}, success() {}, warn() {}, fail(msg: string) { console.log(`         (logger.fail) ${msg}`); } };
const fakeClient: any = { logger, config: { signals: { webhookId: '123', secret: SECRET } } };

class Recorder extends SignalHandler<'bot.test'> {
	runs: SignalPayload<'bot.test'>[][] = [];
	runMs = 0;
	constructor(debounceMs: number) {
		super(fakeClient, { type: 'bot.test', debounceMs });
	}
	async run(payloads: SignalPayload<'bot.test'>[]) {
		this.runs.push(payloads);
		if (this.runMs) await wait(this.runMs);
	}
}

const burst = new Recorder(50);
burst.enqueue({ requestedBy: 'a' });
burst.enqueue({ requestedBy: 'b' });
burst.enqueue({ requestedBy: 'c' });
await wait(120);
check('3 signals inside the debounce window → 1 run with 3 payloads', burst.runs.length === 1 && burst.runs[0]?.length === 3, JSON.stringify(burst.runs));

const overlap = new Recorder(10);
overlap.runMs = 80;
overlap.enqueue({ requestedBy: 'first' });
await wait(30); // first run is in flight
overlap.enqueue({ requestedBy: 'during-1' });
overlap.enqueue({ requestedBy: 'during-2' });
await wait(250);
check(
	'signals during a run → exactly one more run, after it',
	overlap.runs.length === 2 && overlap.runs[1]?.length === 2,
	JSON.stringify(overlap.runs),
);

const off = new Recorder(0);
off.enabled = false;
off.enqueue({ requestedBy: 'x' });
await wait(20);
check('disabled handler ignores signals', off.runs.length === 0);

// ---------------------------------------------------------------------------
console.log('\nSignalRouter\n');

const routed = new Recorder(0);
fakeClient.signals = new Map([['bot.test', [routed]]]);
const router = new SignalRouter(fakeClient);

const once = encodeEnvelope([test], SECRET);
router.receive(once);
router.receive(once);
await wait(20);
check('valid envelope dispatched once; replay rejected', routed.runs.length === 1 && router.stats.rejected === 1, JSON.stringify(router.stats));

router.receive(encodeEnvelope([test], 'forged'));
await wait(20);
check('forged envelope not dispatched', routed.runs.length === 1 && router.stats.rejected === 2);

fakeClient.config.signals.secret = '';
router.receive(encodeEnvelope([test], SECRET));
await wait(20);
check('no secret configured → fails closed', routed.runs.length === 1 && router.stats.rejected === 3);

const msg = (webhookId: string | null): any => ({ webhookId });
fakeClient.config.signals.secret = SECRET;
check('message from another webhook is not a signal', !router.isSignalMessage(msg('999')));
check('ordinary message is not a signal', !router.isSignalMessage(msg(null)));
check('message from the signal webhook is a signal', router.isSignalMessage(msg('123')));

// ---------------------------------------------------------------------------
console.log(failures ? `\n✗ ${failures} failed\n` : '\n✓ all passed\n');
process.exit(failures ? 1 : 0);
