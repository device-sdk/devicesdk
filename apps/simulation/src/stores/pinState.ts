import { defineStore } from "pinia";
import { ref } from "vue";
import type {
	InputMonitoring,
	PinMode,
	PinState,
	PwmConfig,
} from "@/lib/types";

function defaultState(): PinState {
	return {
		mode: "digital_input",
		digitalState: "low",
		monitoring: { enabled: false, pull: "none" },
	};
}

type DigitalChangeHandler = (
	gpio: number,
	oldState: "high" | "low",
	newState: "high" | "low",
) => void;

export const usePinStateStore = defineStore("pinState", () => {
	const states = ref<Record<number, PinState>>({});
	const digitalChangeHandlers = new Set<DigitalChangeHandler>();

	function ensure(gpio: number): PinState {
		if (!states.value[gpio]) {
			states.value[gpio] = defaultState();
		}
		return states.value[gpio];
	}

	function get(gpio: number): PinState {
		return states.value[gpio] ?? defaultState();
	}

	function setMode(gpio: number, mode: PinMode) {
		const s = ensure(gpio);
		s.mode = mode;
		if (mode === "pwm_output" && !s.pwm) {
			s.pwm = { frequency: 1000, dutyCycle: 0.5 };
		}
		if (mode === "analog_input" && !s.analog) {
			s.analog = { voltage: 0, raw: 0 };
		}
		if (mode === "digital_input" && !s.monitoring) {
			s.monitoring = { enabled: false, pull: "none" };
		}
	}

	function setDigital(gpio: number, next: "high" | "low") {
		const s = ensure(gpio);
		const old = s.digitalState;
		s.digitalState = next;
		if (old !== next) {
			for (const h of digitalChangeHandlers) h(gpio, old, next);
		}
	}

	function setPwm(gpio: number, pwm: PwmConfig) {
		const s = ensure(gpio);
		s.mode = "pwm_output";
		s.pwm = pwm;
	}

	function setAnalog(gpio: number, voltage: number) {
		const s = ensure(gpio);
		s.mode = "analog_input";
		const raw = Math.round((voltage / 3.3) * 4095);
		s.analog = { voltage, raw };
	}

	function setMonitoring(gpio: number, monitoring: InputMonitoring) {
		const s = ensure(gpio);
		s.mode = "digital_input";
		s.monitoring = monitoring;
		// When monitoring is enabled, rest the pin at the pull level.
		// Pull-up → pin idles HIGH; pull-down → pin idles LOW.
		if (monitoring.enabled && monitoring.pull !== "none") {
			const restingState = monitoring.pull === "up" ? "high" : "low";
			if (s.digitalState !== restingState) {
				setDigital(gpio, restingState);
			}
		}
	}

	function onDigitalChange(handler: DigitalChangeHandler): () => void {
		digitalChangeHandlers.add(handler);
		return () => digitalChangeHandlers.delete(handler);
	}

	function resetAll() {
		states.value = {};
	}

	return {
		states,
		get,
		ensure,
		setMode,
		setDigital,
		setPwm,
		setAnalog,
		setMonitoring,
		onDigitalChange,
		resetAll,
	};
});
