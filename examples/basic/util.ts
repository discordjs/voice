/**
 * Returns a Promise that rejects after a specified time.
 * 
 * @param time The number of milliseconds to wait before throwing
 * @param message The message to construct the error with
 */
export function errorAfter(time: number, message: string) {
	return new Promise((resolve, reject) => {
		setTimeout(() => reject(new Error(message)), time);
	});
}
