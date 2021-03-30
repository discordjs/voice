import { PassThrough } from 'stream';
import { createAudioResource, NO_CONSTRAINT, VOLUME_CONSTRAINT } from '../AudioResource';
import { Edge, findPipeline as _findPipeline, StreamType, TransformerType } from '../TransformerGraph';

jest.mock('prism-media');
jest.mock('../TransformerGraph');

const findPipeline = (_findPipeline as unknown) as jest.MockedFunction<typeof _findPipeline>;

beforeEach(() => {
	findPipeline.mockReset();
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
				transformer: () => new PassThrough(),
				type: TransformerType.InlineVolume,
			});
		}
		return base as any[];
	});
});

describe('createAudioResource', () => {
	test('Creates a resource from string path', () => {
		const resource = createAudioResource('mypath.mp3');
		expect(findPipeline).toHaveBeenCalledWith(StreamType.Arbitrary, NO_CONSTRAINT);
		expect(resource.volume).toBeUndefined();
	});
});
