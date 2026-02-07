// PWM Motor/Servo Control Example
// This template demonstrates PWM output for motor or servo control
// Can be used for DC motors with PWM, servo motors, LED dimming, etc.

import { WorkerEntrypoint } from "cloudflare:workers";

const MOTOR_PIN = 15; // PWM capable pin
const SERVO_PIN = 16; // PWM capable pin for servo

// Servo configuration (typical values)
const SERVO_FREQ = 50; // 50Hz for standard servos
const SERVO_MIN_DUTY = 2.5; // 2.5% duty = 0 degrees
const SERVO_MAX_DUTY = 12.5; // 12.5% duty = 180 degrees

// Motor configuration
const MOTOR_FREQ = 1000; // 1kHz PWM for DC motor

// Convert angle (0-180) to duty cycle percentage
function angleToDuty(angle) {
	return SERVO_MIN_DUTY + (angle / 180) * (SERVO_MAX_DUTY - SERVO_MIN_DUTY);
}

export default class extends WorkerEntrypoint {
	async onDeviceConnect() {
		this.env.logger.info("Motor/Servo controller connected");

		// Initialize motor at 0% speed
		await this.env.DEVICE.setPwmState(MOTOR_PIN, MOTOR_FREQ, 0);
		this.env.logger.info("Motor initialized at 0% speed");

		// Initialize servo at center position (90 degrees)
		await this.env.DEVICE.setPwmState(SERVO_PIN, SERVO_FREQ, angleToDuty(90));
		this.env.logger.info("Servo initialized at 90 degrees");
	}

	async onDeviceDisconnect() {
		this.env.logger.info("Motor/Servo controller disconnected");

		// Safety: stop motor on disconnect
		await this.env.DEVICE.setPwmState(MOTOR_PIN, MOTOR_FREQ, 0);
	}

	async onMessage(message) {
		this.env.logger.debug("Received:", message);

		// Example: respond to custom commands in messages
		// You could extend this to handle external API calls
	}

	// Helper methods that could be called from external triggers

	async setMotorSpeed(speedPercent) {
		// Clamp speed to 0-100%
		const speed = Math.max(0, Math.min(100, speedPercent));
		await this.env.DEVICE.setPwmState(MOTOR_PIN, MOTOR_FREQ, speed);
		this.env.logger.info(`Motor speed set to ${speed}%`);
	}

	async setServoAngle(angle) {
		// Clamp angle to 0-180 degrees
		const clampedAngle = Math.max(0, Math.min(180, angle));
		const duty = angleToDuty(clampedAngle);
		await this.env.DEVICE.setPwmState(SERVO_PIN, SERVO_FREQ, duty);
		this.env.logger.info(`Servo angle set to ${clampedAngle} degrees`);
	}

	async sweepServo() {
		this.env.logger.info("Starting servo sweep...");

		// Sweep from 0 to 180 and back
		for (let angle = 0; angle <= 180; angle += 10) {
			await this.env.DEVICE.setPwmState(
				SERVO_PIN,
				SERVO_FREQ,
				angleToDuty(angle),
			);
			await new Promise((r) => setTimeout(r, 100));
		}
		for (let angle = 180; angle >= 0; angle -= 10) {
			await this.env.DEVICE.setPwmState(
				SERVO_PIN,
				SERVO_FREQ,
				angleToDuty(angle),
			);
			await new Promise((r) => setTimeout(r, 100));
		}

		this.env.logger.info("Servo sweep complete");
	}
}
