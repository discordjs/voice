/* eslint-disable @typescript-eslint/dot-notation */
import { VoiceReceiver } from '../VoiceReceiver';
import { VoiceConnection as _VoiceConnection, VoiceConnectionStatus } from '../../VoiceConnection';
import { RTP_PACKET } from './fixtures';
import { once } from 'events';
import { createVoiceReceiver } from '..';

jest.mock('../../VoiceConnection');
jest.mock('../SSRCMap');

const VoiceConnection = (_VoiceConnection as unknown) as jest.Mocked<typeof _VoiceConnection>;

function nextTick() {
	return new Promise((resolve) => process.nextTick(resolve));
}

describe('VoiceReceiver', () => {
	let voiceConnection: _VoiceConnection;
	let receiver: VoiceReceiver;

	beforeEach(() => {
		voiceConnection = new VoiceConnection({} as any, {} as any);
		voiceConnection.state = {
			status: VoiceConnectionStatus.Signalling,
		} as any;
		receiver = createVoiceReceiver(voiceConnection);
		receiver['connectionData'] = {
			encryptionMode: 'dummy',
			nonceBuffer: Buffer.alloc(0),
			secretKey: Buffer.alloc(0),
		};
	});

	test('onUdpMessage: RTP packet', async () => {
		receiver['decrypt'] = jest.fn().mockImplementationOnce(() => RTP_PACKET.opusFrame);

		const spy = jest.spyOn(receiver.ssrcMap, 'get');
		spy.mockImplementation(() => ({
			audioSSRC: RTP_PACKET.ssrc,
			userId: '123',
		}));

		const stream = receiver.subscribe(RTP_PACKET.ssrc);

		receiver['onUdpMessage'](RTP_PACKET.packet);
		await nextTick();
		expect(stream.read()).toBe(RTP_PACKET.opusFrame);
	});

	test('onUdpMessage: <8 bytes packet', () => {
		expect(() => receiver['onUdpMessage'](Buffer.alloc(4))).not.toThrow();
	});

	test('onUdpMessage: destroys stream on decrypt failure', async () => {
		receiver['decrypt'] = jest.fn().mockImplementationOnce(() => null);

		const spy = jest.spyOn(receiver.ssrcMap, 'get');
		spy.mockImplementation(() => ({
			audioSSRC: RTP_PACKET.ssrc,
			userId: '123',
		}));

		const stream = receiver.subscribe(RTP_PACKET.ssrc);

		const errorEvent = once(stream, 'error');

		receiver['onUdpMessage'](RTP_PACKET.packet);
		await nextTick();
		await expect(errorEvent).resolves.toMatchObject([expect.any(Error)]);
		expect(receiver.subscriptions.size).toBe(0);
	});

	test('subscribe: only allows one subscribe stream per SSRC', () => {
		const spy = jest.spyOn(receiver.ssrcMap, 'get');
		spy.mockImplementation(() => ({
			audioSSRC: RTP_PACKET.ssrc,
			userId: '123',
		}));

		const stream = receiver.subscribe(RTP_PACKET.ssrc);
		expect(receiver.subscribe(RTP_PACKET.ssrc)).toBe(stream);
	});

	test('subscribe: refuses unknown SSRC or user IDs', () => {
		expect(() => receiver.subscribe(RTP_PACKET.ssrc)).toThrow();
	});
});
