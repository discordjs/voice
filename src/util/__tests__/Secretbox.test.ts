import { methods } from '../Secretbox';
// eslint-disable-next-line @typescript-eslint/no-empty-function
jest.mock('tweetnacl', () => {}, { virtual: true });

test('Does not throw error with a package installed', () => {
	expect(() => methods.open).not.toThrowError();
});
