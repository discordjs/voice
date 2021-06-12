import { Readable } from 'stream';
import { opus } from 'prism-media';
import { noop } from './util';
import { StreamType } from '..';

/**
 * Takes an Opus Head, and verifies whether the associated Opus audio is suitable to play in a Discord voice channel.
 * @param opusHead The Opus Head to validate
 * @returns true if suitable to play in a Discord voice channel, false otherwise
 */
export function validateDiscordOpusHead(opusHead: Buffer): boolean {
	const channels = opusHead.readUInt8(9);
	const sampleRate = opusHead.readUInt32LE(12);
	return channels === 2 && sampleRate === 48000;
}

export interface ProbeInfo {
	stream: Readable;
	type: StreamType;
}

/**
 * Attempt to probe a readable stream to figure out whether it can be demuxed using an Ogg or WebM Opus demuxer.
 * @param stream The readable stream to probe
 * @param probeSize The number of bytes to attempt to read before giving up on the probe
 * @param validator The Opus Head validator function
 * @experimental
 */
export function demuxProbe(
	stream: Readable,
	probeSize = 1024,
	validator = validateDiscordOpusHead,
): Promise<ProbeInfo> {
	return new Promise((resolve, reject) => {
		// Preconditions
		if (stream.readableObjectMode) reject(new Error('Cannot probe a readable stream in object mode'));
		if (stream.readableEnded) reject(new Error('Cannot probe a stream that has ended'));

		let readBuffer = Buffer.alloc(0);

		let resolved: StreamType | undefined = undefined;

		const finish = (type: StreamType) => {
			stream.off('data', onData);
			stream.off('close', onClose);
			stream.off('end', onClose);
			stream.pause();
			resolved = type;
			if (stream.readableEnded) {
				resolve({
					stream: Readable.from(readBuffer),
					type,
				});
			} else {
				if (readBuffer.length > 0) {
					stream.push(readBuffer);
				}
				resolve({
					stream,
					type,
				});
			}
		};

		const foundHead = (type: StreamType) => (head: Buffer) => {
			if (validator(head)) {
				finish(type);
			}
		};

		const webm = new opus.WebmDemuxer();
		webm.once('error', noop);
		webm.on('head', foundHead(StreamType.WebmOpus));

		const ogg = new opus.OggDemuxer();
		ogg.once('error', noop);
		ogg.on('head', foundHead(StreamType.OggOpus));

		const onClose = () => {
			if (!resolved) {
				finish(StreamType.Arbitrary);
			}
		};

		const onData = (buffer: Buffer) => {
			readBuffer = Buffer.concat([readBuffer, buffer]);

			webm.write(buffer);
			ogg.write(buffer);

			if (readBuffer.length >= probeSize) {
				stream.off('data', onData);
				stream.pause();
				process.nextTick(onClose);
			}
		};

		stream.on('data', onData);
		stream.once('close', onClose);
		stream.once('end', onClose);
		stream.once('error', reject);
	});
}
