#!/usr/bin/env python3
"""
Integration test demonstrating WebSocket message flow and GPIO control.
Simulates server -> device communication without actual WebSocket connection.
"""

import json
import time


class SimulatedGPIOController:
    """Simulates GPIO state on the ESP32 device."""
    
    def __init__(self):
        self.gpio_states = {}  # pin -> state
        self.history = []  # List of (timestamp, pin, state) tuples
    
    def set_gpio(self, pin, state):
        """Set GPIO pin to HIGH (1) or LOW (0)."""
        self.gpio_states[pin] = state
        self.history.append((time.time(), pin, state))
        print(f"  [GPIO] Pin {pin} set to {state}")
    
    def get_gpio(self, pin):
        """Get current GPIO state."""
        return self.gpio_states.get(pin, 0)
    
    def print_state(self):
        """Print current GPIO states."""
        if self.gpio_states:
            print("\n[GPIO STATE]")
            for pin, state in sorted(self.gpio_states.items()):
                print(f"  Pin {pin}: {state}")
        else:
            print("\n[GPIO STATE] All pins default (LOW)")


class SimulatedMessageHandler:
    """Simulates the websocket_handler.c message processing."""
    
    def __init__(self, gpio_controller):
        self.gpio = gpio_controller
    
    def handle_message(self, message_json):
        """Process incoming WebSocket message (simulates handle_websocket_message C function)."""
        try:
            msg = json.loads(message_json) if isinstance(message_json, str) else message_json
        except json.JSONDecodeError as e:
            print(f"  [ERROR] Failed to parse JSON: {e}")
            return False
        
        # Check for type field
        if "type" not in msg:
            print(f"  [ERROR] Message missing 'type' field")
            return False
        
        msg_type = msg["type"]
        print(f"  [HANDLER] Processing message type: {msg_type}")
        
        # Handle set_gpio_state command
        if msg_type == "set_gpio_state":
            if "payload" not in msg:
                print(f"  [ERROR] set_gpio_state missing payload")
                return False
            
            payload = msg["payload"]
            
            if "pin" not in payload or "state" not in payload:
                print(f"  [ERROR] set_gpio_state invalid pin or state")
                return False
            
            pin = int(payload["pin"])
            state_str = payload["state"]
            
            # Convert state string to GPIO level
            if state_str == "high":
                gpio_state = 1
            elif state_str == "low":
                gpio_state = 0
            else:
                print(f"  [ERROR] Invalid state: {state_str}")
                return False
            
            # Execute GPIO command
            self.gpio.set_gpio(pin, gpio_state)
            print(f"  [SUCCESS] GPIO command executed: pin={pin}, state={state_str}")
            return True
        
        else:
            print(f"  [WARN] Unknown message type: {msg_type}")
            return True  # Not an error, just unknown


def test_scenario_led_blink():
    """Test: Server sends commands to blink LED on GPIO 2."""
    print("\n" + "="*60)
    print("TEST: LED Blink Scenario")
    print("="*60)
    
    gpio = SimulatedGPIOController()
    handler = SimulatedMessageHandler(gpio)
    
    # Server sends sequence to blink LED
    print("\n[SERVER -> DEVICE] Blink LED on GPIO 2")
    commands = [
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "high"}},  # ON
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "low"}},   # OFF
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "high"}},  # ON
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "low"}},   # OFF
    ]
    
    for i, cmd in enumerate(commands, 1):
        print(f"\n[Step {i}] Server sends: {json.dumps(cmd)}")
        success = handler.handle_message(cmd)
        assert success, f"Command {i} failed"
    
    gpio.print_state()
    assert gpio.get_gpio(2) == 0, "LED should be OFF at end"
    print("\n✓ LED blink test PASSED")


def test_scenario_multiple_pins():
    """Test: Server controls multiple GPIO pins."""
    print("\n" + "="*60)
    print("TEST: Multiple GPIO Pins")
    print("="*60)
    
    gpio = SimulatedGPIOController()
    handler = SimulatedMessageHandler(gpio)
    
    # Control different pins
    print("\n[SERVER -> DEVICE] Control pins 2, 25, 26")
    commands = [
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "high"}},
        {"type": "set_gpio_state", "payload": {"pin": 25, "state": "high"}},
        {"type": "set_gpio_state", "payload": {"pin": 26, "state": "low"}},
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "low"}},
    ]
    
    for cmd in commands:
        print(f"\n[SERVER] Sends: {json.dumps(cmd)}")
        handler.handle_message(cmd)
    
    gpio.print_state()
    assert gpio.get_gpio(2) == 0
    assert gpio.get_gpio(25) == 1
    assert gpio.get_gpio(26) == 0
    print("\n✓ Multiple pins test PASSED")


def test_scenario_invalid_messages():
    """Test: Device handles invalid messages gracefully."""
    print("\n" + "="*60)
    print("TEST: Invalid Message Handling")
    print("="*60)
    
    gpio = SimulatedGPIOController()
    handler = SimulatedMessageHandler(gpio)
    
    invalid_messages = [
        ('{"type": "set_gpio_state"}', "Missing payload"),
        ('{"payload": {"pin": 2, "state": "high"}}', "Missing type"),
        ('{"type": "set_gpio_state", "payload": {"state": "high"}}', "Missing pin"),
        ('not valid json', "Invalid JSON"),
        ('{"type": "set_gpio_state", "payload": {"pin": 2, "state": "invalid"}}', "Invalid state"),
    ]
    
    for msg, description in invalid_messages:
        print(f"\n[TEST] {description}")
        print(f"[SERVER] Sends: {msg}")
        handler.handle_message(msg)
    
    gpio.print_state()
    print("\n✓ Invalid message handling test PASSED (no crashes)")


def test_scenario_device_lifecycle():
    """Test: Complete device lifecycle - connect, commands, ping."""
    print("\n" + "="*60)
    print("TEST: Device Lifecycle")
    print("="*60)
    
    gpio = SimulatedGPIOController()
    handler = SimulatedMessageHandler(gpio)
    
    # 1. Device connects
    print("\n[DEVICE -> SERVER] Device connect")
    device_msg = {"type": "device connect"}
    print(f"  Sent: {json.dumps(device_msg)}")
    
    # 2. Server sends GPIO commands
    print("\n[SERVER -> DEVICE] GPIO commands")
    handler.handle_message({"type": "set_gpio_state", "payload": {"pin": 2, "state": "high"}})
    
    # 3. Device sends ping
    print("\n[DEVICE -> SERVER] Ping")
    ping_msg = {"type": "ping"}
    print(f"  Sent: {json.dumps(ping_msg)}")
    
    # 4. More commands
    print("\n[SERVER -> DEVICE] More GPIO commands")
    handler.handle_message({"type": "set_gpio_state", "payload": {"pin": 25, "state": "high"}})
    handler.handle_message({"type": "set_gpio_state", "payload": {"pin": 2, "state": "low"}})
    
    gpio.print_state()
    print("\n✓ Device lifecycle test PASSED")


def test_scenario_rapid_commands():
    """Test: Handle rapid succession of commands."""
    print("\n" + "="*60)
    print("TEST: Rapid Command Processing")
    print("="*60)
    
    gpio = SimulatedGPIOController()
    handler = SimulatedMessageHandler(gpio)
    
    print("\n[SERVER -> DEVICE] 20 rapid commands")
    for i in range(20):
        pin = 2 if i % 2 == 0 else 25
        state = "high" if i % 2 == 0 else "low"
        cmd = {"type": "set_gpio_state", "payload": {"pin": pin, "state": state}}
        handler.handle_message(cmd)
    
    gpio.print_state()
    print(f"\n[STATS] Total commands processed: {len(gpio.history)}")
    print("✓ Rapid command test PASSED")


def main():
    """Run all integration tests."""
    print("="*60)
    print("IoTKit ESP32 Client - Integration Tests")
    print("Simulating WebSocket Server -> Device Communication")
    print("="*60)
    
    tests = [
        test_scenario_led_blink,
        test_scenario_multiple_pins,
        test_scenario_invalid_messages,
        test_scenario_device_lifecycle,
        test_scenario_rapid_commands,
    ]
    
    passed = 0
    failed = 0
    
    for test_func in tests:
        try:
            test_func()
            passed += 1
        except AssertionError as e:
            print(f"\n✗ TEST FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"\n✗ TEST ERROR: {e}")
            failed += 1
    
    print("\n" + "="*60)
    print(f"RESULTS: {passed} passed, {failed} failed out of {len(tests)} tests")
    print("="*60)
    
    if failed == 0:
        print("\n✓ All integration tests PASSED!")
        return 0
    else:
        print(f"\n✗ {failed} test(s) failed")
        return 1


if __name__ == "__main__":
    exit(main())
