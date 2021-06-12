import { demuxProbe } from '../demuxProbe';
import { opus as _opus } from 'prism-media';
import { Readable } from 'stream';
import { StreamType } from '../../audio';
import { once } from 'events';

jest.mock('prism-media');

const WebDemuxer = _opus.WebmDemuxer as unknown as jest.Mock<_opus.WebmDemuxer>;
const OggDemuxer = _opus.OggDemuxer as unknown as jest.Mock<_opus.OggDemuxer>;

async function* gen() {
	for (let i = 0; i < 10; i++) {
		yield Buffer.from([i]);
		await nextTick();
	}
}

const expectedOutput = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

async function collectStream(stream: Readable): Promise<Buffer> {
	let output = Buffer.alloc(0);
	await once(stream, 'readable');
	for await (const data of stream) {
		output = Buffer.concat([output, data]);
	}
	return output;
}

function nextTick() {
	return new Promise((resolve) => {
		process.nextTick(resolve);
	});
}

describe('demuxProbe', () => {
	const webmWrite: jest.Mock<(buffer: Buffer) => void> = jest.fn();
	const oggWrite: jest.Mock<(buffer: Buffer) => void> = jest.fn();

	beforeAll(() => {
		WebDemuxer.prototype.write = webmWrite;
		OggDemuxer.prototype.write = oggWrite;
	});

	beforeEach(() => {
		webmWrite.mockReset();
		oggWrite.mockReset();
	});

	test('Defaults to arbitrary', async () => {
		const stream = Readable.from(gen(), { objectMode: false });
		const probe = await demuxProbe(stream);
		expect(probe.type).toBe(StreamType.Arbitrary);
		await expect(collectStream(probe.stream)).resolves.toEqual(expectedOutput);
	});
});
