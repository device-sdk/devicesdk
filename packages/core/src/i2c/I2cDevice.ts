import type { I2cBatchWriteCommand } from '../index.js';

export interface I2cDeviceOptions {
	bus?: number;
	address: string;
}

/**
 * Base class for I2C devices that batches write operations
 * to minimize network round-trips.
 */
export class I2cDevice {
	protected bus: number;
	protected address: string;
	protected pendingWrites: string[][] = [];

	constructor(options: I2cDeviceOptions) {
		this.bus = options.bus ?? 0;
		this.address = options.address;
	}

	/**
	 * Queue a write operation (hex bytes like ["0x00", "0xAF"])
	 */
	protected queueWrite(data: string[]): this {
		this.pendingWrites.push(data);
		return this;
	}

	/**
	 * Clear all pending writes
	 */
	protected clearQueue(): this {
		this.pendingWrites = [];
		return this;
	}

	/**
	 * Generate a batch write command from all queued writes
	 */
	toBatchCommand(): Omit<I2cBatchWriteCommand, 'id'> {
		return {
			type: 'i2c_batch_write',
			payload: {
				bus: this.bus,
				address: this.address,
				writes: [...this.pendingWrites],
			},
		};
	}
}
