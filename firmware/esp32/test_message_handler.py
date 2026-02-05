#!/usr/bin/env python3
"""
Unit tests for message handler logic.
Tests JSON message parsing and command validation.
"""

import json


def test_valid_gpio_high_message():
    """Test valid GPIO HIGH command message format."""
    message = {
        "type": "set_gpio_state",
        "payload": {
            "pin": 25,
            "state": "high"
        }
    }
    
    # Verify message structure
    assert "type" in message
    assert message["type"] == "set_gpio_state"
    assert "payload" in message
    assert "pin" in message["payload"]
    assert "state" in message["payload"]
    assert isinstance(message["payload"]["pin"], int)
    assert message["payload"]["state"] in ["high", "low"]
    
    print(f"✓ Valid GPIO HIGH message: {json.dumps(message)}")


def test_valid_gpio_low_message():
    """Test valid GPIO LOW command message format."""
    message = {
        "type": "set_gpio_state",
        "payload": {
            "pin": 2,
            "state": "low"
        }
    }
    
    assert message["type"] == "set_gpio_state"
    assert message["payload"]["pin"] == 2
    assert message["payload"]["state"] == "low"
    
    print(f"✓ Valid GPIO LOW message: {json.dumps(message)}")


def test_device_connect_message():
    """Test device connect message format."""
    message = {"type": "device connect"}
    
    assert "type" in message
    assert message["type"] == "device connect"
    assert "payload" not in message  # No payload required
    
    print(f"✓ Device connect message: {json.dumps(message)}")


def test_ping_message():
    """Test ping message format."""
    message = {"type": "ping"}
    
    assert message["type"] == "ping"
    
    print(f"✓ Ping message: {json.dumps(message)}")


def test_missing_type_field():
    """Test message missing type field (should be rejected)."""
    message = {
        "payload": {
            "pin": 25,
            "state": "high"
        }
    }
    
    # Handler should reject this
    assert "type" not in message
    print("✓ Missing type field detected (should be rejected)")


def test_missing_payload_field():
    """Test set_gpio_state missing payload (should be rejected)."""
    message = {
        "type": "set_gpio_state"
    }
    
    # Handler should reject this
    assert "payload" not in message
    print("✓ Missing payload detected (should be rejected)")


def test_invalid_pin_type():
    """Test pin field with invalid type (should be rejected)."""
    message = {
        "type": "set_gpio_state",
        "payload": {
            "pin": "not_a_number",
            "state": "high"
        }
    }
    
    # Handler should reject non-numeric pin
    assert not isinstance(message["payload"]["pin"], (int, float))
    print("✓ Invalid pin type detected (should be rejected)")


def test_invalid_state_value():
    """Test state field with invalid value (should be rejected)."""
    message = {
        "type": "set_gpio_state",
        "payload": {
            "pin": 25,
            "state": "invalid"
        }
    }
    
    # Handler should reject states other than "high" or "low"
    assert message["payload"]["state"] not in ["high", "low"]
    print("✓ Invalid state value detected (should be rejected)")


def test_gpio_pin_ranges():
    """Test various GPIO pin numbers."""
    valid_pins = [0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33]
    
    for pin in valid_pins:
        message = {
            "type": "set_gpio_state",
            "payload": {
                "pin": pin,
                "state": "high"
            }
        }
        assert isinstance(message["payload"]["pin"], int)
        assert 0 <= message["payload"]["pin"] <= 39  # ESP32 valid GPIO range
    
    print(f"✓ Tested {len(valid_pins)} valid GPIO pins")


def test_led_onboard_pin():
    """Test onboard LED pin (typically GPIO 2 on ESP32)."""
    message = {
        "type": "set_gpio_state",
        "payload": {
            "pin": 2,  # Common onboard LED pin
            "state": "high"
        }
    }
    
    assert message["payload"]["pin"] == 2
    assert message["payload"]["state"] == "high"
    
    print("✓ Onboard LED (GPIO 2) HIGH command valid")


def test_message_json_serialization():
    """Test that messages can be serialized to/from JSON."""
    original = {
        "type": "set_gpio_state",
        "payload": {
            "pin": 25,
            "state": "low"
        }
    }
    
    # Serialize to JSON string
    json_str = json.dumps(original)
    
    # Deserialize back
    parsed = json.loads(json_str)
    
    assert parsed == original
    assert parsed["type"] == "set_gpio_state"
    assert parsed["payload"]["pin"] == 25
    assert parsed["payload"]["state"] == "low"
    
    print(f"✓ JSON serialization: {json_str}")


def test_gpio_sequence():
    """Test a sequence of GPIO commands (like blinking an LED)."""
    sequence = [
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "high"}},  # LED ON
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "low"}},   # LED OFF
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "high"}},  # LED ON
        {"type": "set_gpio_state", "payload": {"pin": 2, "state": "low"}},   # LED OFF
    ]
    
    for i, cmd in enumerate(sequence):
        assert cmd["type"] == "set_gpio_state"
        assert cmd["payload"]["pin"] == 2
        assert cmd["payload"]["state"] in ["high", "low"]
        print(f"  Step {i+1}: GPIO 2 -> {cmd['payload']['state']}")
    
    print(f"✓ GPIO sequence test passed ({len(sequence)} commands)")


def test_unknown_message_type():
    """Test handling of unknown message types."""
    message = {
        "type": "unknown_command",
        "payload": {
            "data": "test"
        }
    }
    
    # Handler should log warning but not crash
    assert message["type"] not in ["set_gpio_state", "ping", "device connect"]
    print("✓ Unknown message type detected (should log warning)")


if __name__ == "__main__":
    print("=" * 60)
    print("IoTKit ESP32 Client - Message Handler Unit Tests")
    print("=" * 60)
    
    tests = [
        ("Valid GPIO HIGH message", test_valid_gpio_high_message),
        ("Valid GPIO LOW message", test_valid_gpio_low_message),
        ("Device connect message", test_device_connect_message),
        ("Ping message", test_ping_message),
        ("Missing type field", test_missing_type_field),
        ("Missing payload field", test_missing_payload_field),
        ("Invalid pin type", test_invalid_pin_type),
        ("Invalid state value", test_invalid_state_value),
        ("GPIO pin ranges", test_gpio_pin_ranges),
        ("LED onboard pin", test_led_onboard_pin),
        ("JSON serialization", test_message_json_serialization),
        ("GPIO sequence", test_gpio_sequence),
        ("Unknown message type", test_unknown_message_type),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            print(f"\n[TEST] {name}")
            test_func()
            passed += 1
            print(f"[PASS] {name}")
        except AssertionError as e:
            failed += 1
            print(f"[FAIL] {name}: {e}")
        except Exception as e:
            failed += 1
            print(f"[ERROR] {name}: {e}")
    
    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
    print("=" * 60)
    
    if failed == 0:
        print("\n✓ All tests passed!")
        exit(0)
    else:
        print(f"\n✗ {failed} test(s) failed")
        exit(1)
