import EventEmitter from 'events';
import { VoiceConnection, VoiceConnectionStatus } from '../../VoiceConnection';
import { entersState } from '../entersState';

function createFakeVoiceConnection(status = VoiceConnectionStatus.Signalling) {
	const vc = new EventEmitter() as any;
	vc.state = { status };
	return vc as VoiceConnection;
}

beforeEach(() => {
	jest.useFakeTimers();
});

describe('entersState', () => {
	test('Returns the target once the state has been entered before timeout', async () => {
		jest.useRealTimers();
		const vc = createFakeVoiceConnection();
		process.nextTick(() => vc.emit(VoiceConnectionStatus.Ready, null as any, null as any));
		const result = await entersState(vc, VoiceConnectionStatus.Ready, 1000);
		expect(result).toBe(vc);
	});

	test('Rejects once the timeout is exceeded', async () => {
		const vc = createFakeVoiceConnection();
		const promise = entersState(vc, VoiceConnectionStatus.Ready, 1000);
		jest.runAllTimers();
		await expect(promise).rejects.toThrowError();
	});

	test('Returns the target once the state has been entered before signal is aborted', async () => {
		jest.useRealTimers();
		const vc = createFakeVoiceConnection();
		const ac = new AbortController();
		process.nextTick(() => vc.emit(VoiceConnectionStatus.Ready, null as any, null as any));
		const result = await entersState(vc, VoiceConnectionStatus.Ready, ac.signal);
		expect(result).toBe(vc);
	});

	test('Rejects once the signal is aborted', async () => {
		const vc = createFakeVoiceConnection();
		const ac = new AbortController();
		const promise = entersState(vc, VoiceConnectionStatus.Ready, ac.signal);
		ac.abort();
		await expect(promise).rejects.toThrowError();
	});

	test('Resolves immediately when target already in desired state', async () => {
		const vc = createFakeVoiceConnection();
		await expect(entersState(vc, VoiceConnectionStatus.Signalling, 1000)).resolves.toBe(vc);
	});
});
