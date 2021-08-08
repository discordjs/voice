import { SILENCE_FRAME } from '../../audio/AudioPlayer';
import { AudioReceiveStream, EndBehaviorType } from '../AudioReceiveStream';

jest.useFakeTimers();
const DUMMY_BUFFER = Buffer.allocUnsafe(16);

function stepSilence(stream: AudioReceiveStream, increment: number) {
	stream.push(SILENCE_FRAME);
	jest.advanceTimersByTime(increment);
	expect(stream.readable).toBe(true);
	expect(stream.destroyed).toBe(false);
}

describe('AudioReceiveStream', () => {
	test('Manual end behavior', () => {
		const stream = new AudioReceiveStream({ end: { behavior: EndBehaviorType.Manual } });
		stream.push(DUMMY_BUFFER);
		expect(stream.readable).toBe(true);
		jest.advanceTimersByTime(60_000);
		stream.push(DUMMY_BUFFER);
		expect(stream.readable).toBe(true);
	});

	test('AfterSilence end behavior', () => {
		const duration = 100;
		const increment = 20;

		const stream = new AudioReceiveStream({ end: { behavior: EndBehaviorType.AfterSilence, duration: 100 } });

		for (let i = increment; i < duration / 2; i += increment) {
			stepSilence(stream, increment);
		}

		stream.push(DUMMY_BUFFER);

		for (let i = increment; i < duration; i += increment) {
			stepSilence(stream, increment);
		}

		jest.advanceTimersByTime(increment);
		expect(stream.destroyed).toBe(true);
	});

	test('AfterInactivity end behavior', () => {
		const duration = 100;
		const increment = 20;

		const stream = new AudioReceiveStream({ end: { behavior: EndBehaviorType.AfterInactivity, duration: 100 } });

		for (let i = increment; i < duration / 2; i += increment) {
			stepSilence(stream, increment);
		}

		stream.push(DUMMY_BUFFER);

		for (let i = increment; i < duration; i += increment) {
			stepSilence(stream, increment);
		}

		jest.advanceTimersByTime(increment);
		expect(stream.destroyed).toBe(false);

		jest.advanceTimersByTime(duration - increment);
		expect(stream.destroyed).toBe(true);
	});
});
