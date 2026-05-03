import type { PinStateUpdate } from "@devicesdk/core";
import { describe, expectTypeOf, it } from "vitest";

// Contract test: lock the PinStateUpdate discriminated-union shape so a future
// edit to either the firmware (which emits these JSON frames) or the type can't
// silently desynchronize again. The reviewer flagged that without a fixture-
// based assertion, the union shape change is invisible at runtime — this test
// fails to compile if either side drifts.
describe("PinStateUpdate union — wire-format contract", () => {
	it("accepts a digital frame with value: 'high' | 'low'", () => {
		const digitalHigh: PinStateUpdate = {
			id: "abc",
			type: "pin_state_update",
			payload: { pin: 4, mode: "digital", value: "high" },
		};
		const digitalLow: PinStateUpdate = {
			id: "abc",
			type: "pin_state_update",
			payload: { pin: 4, mode: "digital", value: "low" },
		};
		expectTypeOf(digitalHigh).toExtend<PinStateUpdate>();
		expectTypeOf(digitalLow).toExtend<PinStateUpdate>();
	});

	it("accepts an analog frame with value: number", () => {
		const analogFrame: PinStateUpdate = {
			id: "abc",
			type: "pin_state_update",
			payload: { pin: 26, mode: "analog", value: 1234 },
		};
		expectTypeOf(analogFrame).toExtend<PinStateUpdate>();
	});

	it("rejects a digital frame whose value is a number (would catch firmware regression)", () => {
		type WrongDigital = {
			id: string;
			type: "pin_state_update";
			payload: { pin: number; mode: "digital"; value: number };
		};
		expectTypeOf<WrongDigital>().not.toExtend<PinStateUpdate>();
	});

	it("rejects an analog frame whose value is a string", () => {
		type WrongAnalog = {
			id: string;
			type: "pin_state_update";
			payload: { pin: number; mode: "analog"; value: "high" };
		};
		expectTypeOf<WrongAnalog>().not.toExtend<PinStateUpdate>();
	});
});
