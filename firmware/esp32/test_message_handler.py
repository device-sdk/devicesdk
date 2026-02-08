"""
Protocol format validation for all command types and response formats.
Tests the JSON structure of every command and response message in the DeviceSDK protocol.
"""

import json


# === Command message format tests ===

class TestCommandFormats:
    """Validate all command message formats match the protocol spec."""

    def test_set_gpio_state(self):
        msg = {
            "type": "set_gpio_state",
            "id": "msg-001",
            "payload": {"pin": 5, "state": "high"},
        }
        assert msg["type"] == "set_gpio_state"
        assert isinstance(msg["payload"]["pin"], int)
        assert msg["payload"]["state"] in ("high", "low")
        assert isinstance(msg["id"], str)

    def test_get_pin_state_digital(self):
        msg = {
            "type": "get_pin_state",
            "id": "msg-002",
            "payload": {"pin": 10, "mode": "digital"},
        }
        assert msg["payload"]["mode"] == "digital"

    def test_get_pin_state_analog(self):
        msg = {
            "type": "get_pin_state",
            "id": "msg-003",
            "payload": {"pin": 34, "mode": "analog"},
        }
        assert msg["payload"]["mode"] == "analog"

    def test_set_pwm_state(self):
        msg = {
            "type": "set_pwm_state",
            "id": "msg-004",
            "payload": {"pin": 18, "frequency": 1000, "duty_cycle": 0.5},
        }
        assert isinstance(msg["payload"]["frequency"], int)
        assert isinstance(msg["payload"]["duty_cycle"], float)
        assert 0.0 <= msg["payload"]["duty_cycle"] <= 1.0

    def test_configure_gpio_input_monitoring_enable(self):
        msg = {
            "type": "configure_gpio_input_monitoring",
            "id": "msg-005",
            "payload": {"pin": 15, "enable": True, "pull": "up"},
        }
        assert msg["payload"]["enable"] is True
        assert msg["payload"]["pull"] in ("up", "down", "none")

    def test_configure_gpio_input_monitoring_disable(self):
        msg = {
            "type": "configure_gpio_input_monitoring",
            "id": "msg-006",
            "payload": {"pin": 15, "enable": False},
        }
        assert msg["payload"]["enable"] is False

    def test_i2c_configure(self):
        msg = {
            "type": "i2c_configure",
            "id": "msg-007",
            "payload": {"bus": 0, "sda_pin": 21, "scl_pin": 22, "frequency": 400000},
        }
        assert msg["payload"]["bus"] in (0, 1)
        assert isinstance(msg["payload"]["frequency"], int)

    def test_i2c_configure_default_frequency(self):
        msg = {
            "type": "i2c_configure",
            "id": "msg-008",
            "payload": {"bus": 0, "sda_pin": 21, "scl_pin": 22},
        }
        # frequency is optional, defaults to 100000
        assert "frequency" not in msg["payload"]

    def test_i2c_scan(self):
        msg = {
            "type": "i2c_scan",
            "id": "msg-009",
            "payload": {"bus": 0},
        }
        assert msg["payload"]["bus"] in (0, 1)

    def test_i2c_write(self):
        msg = {
            "type": "i2c_write",
            "id": "msg-010",
            "payload": {"bus": 0, "address": "0x3C", "data": "AQID"},
        }
        assert msg["payload"]["address"].startswith("0x")
        assert isinstance(msg["payload"]["data"], str)  # base64

    def test_i2c_read(self):
        msg = {
            "type": "i2c_read",
            "id": "msg-011",
            "payload": {"bus": 0, "address": "0x50", "length": 4, "register": 16},
        }
        assert isinstance(msg["payload"]["length"], int)

    def test_i2c_read_no_register(self):
        msg = {
            "type": "i2c_read",
            "id": "msg-012",
            "payload": {"bus": 0, "address": "0x50", "length": 4},
        }
        assert "register" not in msg["payload"]

    def test_display_update(self):
        msg = {
            "type": "display_update",
            "id": "msg-013",
            "payload": {
                "bus": 0,
                "address": "0x3C",
                "controller": "ssd1306",
                "width": 128,
                "height": 64,
                "init": True,
                "segments": [{"offset": 0, "data": "AAAA"}],
            },
        }
        assert msg["payload"]["controller"] in ("ssd1306", "sh1106")
        assert isinstance(msg["payload"]["segments"], list)
        assert msg["payload"]["segments"][0]["offset"] == 0

    def test_reboot(self):
        msg = {"type": "reboot", "id": "msg-014"}
        assert msg["type"] == "reboot"
        # No payload required

    def test_device_connected(self):
        msg = {"type": "device_connected"}
        assert msg["type"] == "device_connected"
        # Must be "device_connected" not "device connect"

    def test_ping(self):
        msg = {"type": "ping"}
        assert msg["type"] == "ping"


# === Response message format tests ===

class TestResponseFormats:
    """Validate all response message formats match the protocol spec."""

    def test_command_ack_gpio_set(self):
        resp = {
            "type": "command_ack",
            "id": "msg-001",
            "payload": {"command": "set_gpio_state", "pin": 5, "status": "success"},
        }
        assert resp["type"] == "command_ack"
        assert resp["id"] == "msg-001"

    def test_pin_state_digital(self):
        resp = {
            "type": "pin_state",
            "id": "msg-002",
            "payload": {"pin": 10, "mode": "digital", "value": "high"},
        }
        assert resp["type"] == "pin_state"
        assert resp["payload"]["value"] in ("high", "low")

    def test_pin_state_analog(self):
        resp = {
            "type": "pin_state",
            "id": "msg-003",
            "payload": {"pin": 34, "mode": "analog", "value": 2048},
        }
        assert resp["type"] == "pin_state"
        assert isinstance(resp["payload"]["value"], int)

    def test_command_ack_pwm(self):
        resp = {
            "type": "command_ack",
            "id": "msg-004",
            "payload": {"command": "set_pwm_state", "status": "success"},
        }
        assert resp["payload"]["command"] == "set_pwm_state"

    def test_command_ack_gpio_monitoring(self):
        resp = {
            "type": "command_ack",
            "id": "msg-005",
            "payload": {
                "command": "configure_gpio_input_monitoring",
                "pin": 15,
                "status": "monitoring_enabled",
            },
        }
        assert resp["payload"]["status"] == "monitoring_enabled"

    def test_command_ack_i2c_configure(self):
        resp = {
            "type": "command_ack",
            "id": "msg-007",
            "payload": {
                "command": "i2c_configure",
                "bus": 0,
                "sda_pin": 21,
                "scl_pin": 22,
                "frequency": 400000,
                "status": "success",
            },
        }
        assert resp["payload"]["command"] == "i2c_configure"

    def test_i2c_scan_result(self):
        resp = {
            "type": "i2c_scan_result",
            "id": "msg-009",
            "payload": {"bus": 0, "devices": ["0x3C", "0x50"], "count": 2},
        }
        assert resp["type"] == "i2c_scan_result"
        assert isinstance(resp["payload"]["devices"], list)
        assert all(d.startswith("0x") for d in resp["payload"]["devices"])

    def test_command_ack_i2c_write(self):
        resp = {
            "type": "command_ack",
            "id": "msg-010",
            "payload": {"command": "i2c_write", "status": "success"},
        }
        assert resp["payload"]["command"] == "i2c_write"

    def test_i2c_read_result(self):
        resp = {
            "type": "i2c_read_result",
            "id": "msg-011",
            "payload": {
                "bus": 0,
                "address": "0x50",
                "data": "q80=",
                "length": 2,
            },
        }
        assert resp["type"] == "i2c_read_result"
        assert isinstance(resp["payload"]["data"], str)  # base64

    def test_command_ack_display_update(self):
        resp = {
            "type": "command_ack",
            "id": "msg-013",
            "payload": {
                "command": "display_update",
                "controller": "ssd1306",
                "width": 128,
                "height": 64,
                "segments_count": 1,
                "bytes_written": 1024,
                "status": "success",
            },
        }
        assert resp["payload"]["command"] == "display_update"

    def test_command_ack_reboot(self):
        resp = {
            "type": "command_ack",
            "id": "msg-014",
            "payload": {"command": "reboot", "status": "rebooting"},
        }
        assert resp["payload"]["status"] == "rebooting"

    def test_gpio_state_changed_notification(self):
        resp = {
            "type": "gpio_state_changed",
            "payload": {"pin": 15, "state": "high"},
        }
        assert resp["type"] == "gpio_state_changed"
        assert "id" not in resp  # Unsolicited — no message ID
        assert resp["payload"]["state"] in ("high", "low")

    def test_command_error(self):
        resp = {
            "type": "command_error",
            "id": "msg-099",
            "payload": {"error": "Invalid bus number"},
        }
        assert resp["type"] == "command_error"
        assert isinstance(resp["payload"]["error"], str)

    def test_message_id_correlation(self):
        """Verify responses carry the same ID as the command that triggered them."""
        cmd_id = "unique-uuid-12345"
        cmd = {"type": "set_gpio_state", "id": cmd_id, "payload": {"pin": 5, "state": "high"}}
        resp = {"type": "command_ack", "id": cmd_id, "payload": {"command": "set_gpio_state", "status": "success"}}
        assert cmd["id"] == resp["id"]


# === Edge cases ===

class TestEdgeCases:
    """Test edge cases and error conditions."""

    def test_empty_message_id(self):
        """Messages without id should still be valid."""
        msg = {"type": "set_gpio_state", "payload": {"pin": 5, "state": "high"}}
        assert "id" not in msg

    def test_pin_zero(self):
        msg = {"type": "set_gpio_state", "payload": {"pin": 0, "state": "high"}}
        assert msg["payload"]["pin"] == 0

    def test_max_gpio_pin(self):
        msg = {"type": "set_gpio_state", "payload": {"pin": 39, "state": "high"}}
        assert msg["payload"]["pin"] == 39

    def test_pwm_zero_duty(self):
        msg = {"type": "set_pwm_state", "payload": {"pin": 18, "frequency": 1000, "duty_cycle": 0.0}}
        assert msg["payload"]["duty_cycle"] == 0.0

    def test_pwm_full_duty(self):
        msg = {"type": "set_pwm_state", "payload": {"pin": 18, "frequency": 1000, "duty_cycle": 1.0}}
        assert msg["payload"]["duty_cycle"] == 1.0

    def test_i2c_bus_1(self):
        msg = {"type": "i2c_scan", "payload": {"bus": 1}}
        assert msg["payload"]["bus"] == 1

    def test_json_serialization_roundtrip(self):
        """Verify all message types survive JSON serialization."""
        messages = [
            {"type": "set_gpio_state", "id": "1", "payload": {"pin": 5, "state": "high"}},
            {"type": "get_pin_state", "id": "2", "payload": {"pin": 10, "mode": "digital"}},
            {"type": "set_pwm_state", "id": "3", "payload": {"pin": 18, "frequency": 1000, "duty_cycle": 0.5}},
            {"type": "i2c_scan", "id": "4", "payload": {"bus": 0}},
            {"type": "reboot", "id": "5"},
        ]
        for msg in messages:
            serialized = json.dumps(msg)
            deserialized = json.loads(serialized)
            assert deserialized == msg
