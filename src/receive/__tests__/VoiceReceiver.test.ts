/* eslint-disable @typescript-eslint/dot-notation */
import { VoiceReceiver } from '../VoiceReceiver';
import { VoiceConnection as _VoiceConnection, VoiceConnectionStatus } from '../../VoiceConnection';
import { RTP_PACKET } from './fixtures';
import { once } from 'events';
import { createVoiceReceiver } from '..';
import { VoiceOPCodes } from 'discord-api-types/v8/gateway';

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

	describe('onWsPacket', () => {
		test('CLIENT_DISCONNECT packet', () => {
			const spy = jest.spyOn(receiver.ssrcMap, 'delete');
			receiver['onWsPacket']({
				op: VoiceOPCodes.ClientDisconnect,
				d: {
					user_id: '123abc',
				},
			});
			expect(spy).toHaveBeenCalledWith('123abc');
		});

		test('SPEAKING packet', () => {
			const spy = jest.spyOn(receiver.ssrcMap, 'update');
			receiver['onWsPacket']({
				op: VoiceOPCodes.Speaking,
				d: {
					ssrc: 123,
					user_id: '123abc',
					speaking: 1,
				},
			});
			expect(spy).toHaveBeenCalledWith({
				audioSSRC: 123,
				userId: '123abc',
			});
		});

		test('CLIENT_CONNECT packet', () => {
			const spy = jest.spyOn(receiver.ssrcMap, 'update');
			receiver['onWsPacket']({
				op: VoiceOPCodes.ClientConnect,
				d: {
					audio_ssrc: 123,
					video_ssrc: 43,
					user_id: '123abc',
				},
			});
			expect(spy).toHaveBeenCalledWith({
				audioSSRC: 123,
				videoSSRC: 43,
				userId: '123abc',
			});
			receiver['onWsPacket']({
				op: VoiceOPCodes.ClientConnect,
				d: {
					audio_ssrc: 123,
					video_ssrc: 0,
					user_id: '123abc',
				},
			});
			expect(spy).toHaveBeenCalledWith({
				audioSSRC: 123,
				videoSSRC: undefined,
				userId: '123abc',
			});
		});
	});
});
