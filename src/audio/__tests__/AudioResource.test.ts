import { opus, VolumeTransformer } from 'prism-media';
import { PassThrough } from 'stream';
import { createAudioResource, NO_CONSTRAINT, VOLUME_CONSTRAINT } from '../AudioResource';
import { Edge, findPipeline as _findPipeline, StreamType, TransformerType } from '../TransformerGraph';

jest.mock('prism-media');
jest.mock('../TransformerGraph');

const findPipeline = (_findPipeline as unknown) as jest.MockedFunction<typeof _findPipeline>;

beforeAll(() => {
	findPipeline.mockImplementation((from: StreamType, constraint: (path: Edge[]) => boolean) => {
		const base = [
			{
				cost: 1,
				transformer: () => new PassThrough(),
				type: TransformerType.FFmpegPCM,
			},
		];
		if (constraint === VOLUME_CONSTRAINT) {
			base.push({
				cost: 1,
				transformer: () => new VolumeTransformer({} as any),
				type: TransformerType.InlineVolume,
			});
		}
		return base as any[];
	});
});

beforeEach(() => {
	findPipeline.mockClear();
});

describe('createAudioResource', () => {
	test('Creates a resource from string path', () => {
		const resource = createAudioResource('mypath.mp3');
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Arbitrary, NO_CONSTRAINT);
		expect(resource.volume).toBeUndefined();
	});

	test('Creates a resource from string path (volume)', () => {
		const resource = createAudioResource('mypath.mp3', { inlineVolume: true });
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Arbitrary, VOLUME_CONSTRAINT);
		expect(resource.volume).toBeInstanceOf(VolumeTransformer);
	});

	test('Only infers type if not explicitly given', () => {
		const resource = createAudioResource(new opus.Encoder(), { inputType: StreamType.Arbitrary });
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Arbitrary, NO_CONSTRAINT);
		expect(resource.volume).toBeUndefined();
	});

	test('Infers from opus.Encoder', () => {
		const resource = createAudioResource(new opus.Encoder(), { inlineVolume: true });
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Opus, VOLUME_CONSTRAINT);
		expect(resource.volume).toBeInstanceOf(VolumeTransformer);
	});

	test('Infers from opus.OggDemuxer', () => {
		const resource = createAudioResource(new opus.OggDemuxer());
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Opus, NO_CONSTRAINT);
		expect(resource.volume).toBeUndefined();
	});

	test('Infers from opus.WebmDemuxer', () => {
		const resource = createAudioResource(new opus.WebmDemuxer());
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Opus, NO_CONSTRAINT);
		expect(resource.volume).toBeUndefined();
	});

	test('Infers from opus.Decoder', () => {
		const resource = createAudioResource(new opus.Decoder());
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Raw, NO_CONSTRAINT);
		expect(resource.volume).toBeUndefined();
	});

	test('Infers from VolumeTransformer', () => {
		const stream = new VolumeTransformer({} as any);
		const resource = createAudioResource(stream, { inlineVolume: true });
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Raw, NO_CONSTRAINT);
		expect(resource.volume).toBe(stream);
	});

	test('Falls back to Arbitrary for unknown stream type', () => {
		const resource = createAudioResource(new PassThrough());
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Arbitrary, NO_CONSTRAINT);
		expect(resource.volume).toBeUndefined();
	});
});
