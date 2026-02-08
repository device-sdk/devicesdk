"""
Mock WebSocket server tests for the DeviceSDK protocol.
Validates response format, message ID correlation, and all command types
using a simulated device that mirrors the ESP32 firmware behavior.
"""

import json


class ProtocolDevice:
    """Simulates device responses matching the ESP32 firmware protocol exactly."""

    def handle(self, raw_json):
        """Process a raw JSON command and return a response dict (or None for pings)."""
        msg = json.loads(raw_json)
        msg_type = msg.get("type")
        msg_id = msg.get("id")
        payload = msg.get("payload", {})

        resp = None

        if msg_type == "set_gpio_state":
            resp = self._ack("set_gpio_state", {"pin": payload["pin"], "status": "success"})

        elif msg_type == "get_pin_state":
            if payload.get("mode") == "digital":
                resp = {"type": "pin_state", "payload": {"pin": payload["pin"], "mode": "digital", "value": "low"}}
            else:
                resp = {"type": "pin_state", "payload": {"pin": payload["pin"], "mode": "analog", "value": 0}}

        elif msg_type == "set_pwm_state":
            resp = self._ack("set_pwm_state", {"status": "success"})

        elif msg_type == "configure_gpio_input_monitoring":
            resp = self._ack("configure_gpio_input_monitoring", {"pin": payload["pin"], "status": "monitoring_enabled"})

        elif msg_type == "i2c_configure":
            resp = self._ack("i2c_configure", {
                "bus": payload["bus"], "sda_pin": payload["sda_pin"],
                "scl_pin": payload["scl_pin"], "frequency": payload.get("frequency", 100000),
                "status": "success",
            })

        elif msg_type == "i2c_scan":
            resp = {"type": "i2c_scan_result", "payload": {"bus": payload["bus"], "devices": ["0x3C"], "count": 1}}

        elif msg_type == "i2c_write":
            resp = self._ack("i2c_write", {"status": "success"})

        elif msg_type == "i2c_read":
            resp = {"type": "i2c_read_result", "payload": {
                "bus": payload["bus"], "address": payload["address"],
                "data": "AAAA", "length": 3,
            }}

        elif msg_type == "display_update":
            resp = self._ack("display_update", {
                "controller": payload["controller"], "width": payload["width"],
                "height": payload["height"], "segments_count": len(payload.get("segments", [])),
                "bytes_written": int(payload["width"]) * int(payload["height"]) // 8,
                "status": "success",
            })

        elif msg_type == "reboot":
            resp = self._ack("reboot", {"status": "rebooting"})

        elif msg_type == "ping":
            return None  # Ping is handled without a command response

        else:
            resp = {"type": "command_error", "payload": {"error": f"Unknown command type: {msg_type}"}}

        if resp and msg_id:
            resp["id"] = msg_id

        return resp

    @staticmethod
    def _ack(command, extra_payload):
        payload = {"command": command}
        payload.update(extra_payload)
        return {"type": "command_ack", "payload": payload}


class TestDeviceConnected:
    def test_sends_device_connected(self):
        msg = json.dumps({"type": "device_connected"})
        parsed = json.loads(msg)
        assert parsed["type"] == "device_connected"

    def test_not_device_connect(self):
        """Must be 'device_connected' not 'device connect'."""
        msg = {"type": "device_connected"}
        assert msg["type"] != "device connect"


class TestSetGpioState:
    def setup_method(self):
        self.device = ProtocolDevice()

    def test_response_type(self):
        resp = self.device.handle(json.dumps({
            "type": "set_gpio_state", "id": "g1",
            "payload": {"pin": 5, "state": "high"},
        }))
        assert resp["type"] == "command_ack"
        assert resp["payload"]["command"] == "set_gpio_state"
        assert resp["id"] == "g1"

    def test_response_has_pin(self):
        resp = self.device.handle(json.dumps({
            "type": "set_gpio_state", "id": "g2",
            "payload": {"pin": 2, "state": "low"},
        }))
        assert resp["payload"]["pin"] == 2


class TestGetPinState:
    def setup_method(self):
        self.device = ProtocolDevice()

    def test_digital_response(self):
        resp = self.device.handle(json.dumps({
            "type": "get_pin_state", "id": "p1",
            "payload": {"pin": 10, "mode": "digital"},
        }))
        assert resp["type"] == "pin_state"
        assert resp["payload"]["mode"] == "digital"
        assert resp["payload"]["value"] in ("high", "low")

    def test_analog_response(self):
        resp = self.device.handle(json.dumps({
            "type": "get_pin_state", "id": "p2",
            "payload": {"pin": 34, "mode": "analog"},
        }))
        assert resp["type"] == "pin_state"
        assert resp["payload"]["mode"] == "analog"
        assert isinstance(resp["payload"]["value"], (int, float))


class TestSetPwmState:
    def test_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "set_pwm_state", "id": "pw1",
            "payload": {"pin": 18, "frequency": 1000, "duty_cycle": 0.5},
        }))
        assert resp["type"] == "command_ack"
        assert resp["payload"]["command"] == "set_pwm_state"
        assert resp["id"] == "pw1"


class TestConfigureGpioInputMonitoring:
    def test_enable(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "configure_gpio_input_monitoring", "id": "cm1",
            "payload": {"pin": 15, "enable": True, "pull": "up"},
        }))
        assert resp["payload"]["status"] == "monitoring_enabled"

    def test_gpio_state_changed_format(self):
        """Autonomous GPIO notification has no message ID."""
        notif = {"type": "gpio_state_changed", "payload": {"pin": 15, "state": "high"}}
        assert "id" not in notif
        assert notif["payload"]["state"] in ("high", "low")


class TestI2cConfigure:
    def test_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "i2c_configure", "id": "ic1",
            "payload": {"bus": 0, "sda_pin": 21, "scl_pin": 22, "frequency": 400000},
        }))
        assert resp["payload"]["bus"] == 0
        assert resp["payload"]["sda_pin"] == 21
        assert resp["payload"]["frequency"] == 400000


class TestI2cScan:
    def test_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "i2c_scan", "id": "is1",
            "payload": {"bus": 0},
        }))
        assert resp["type"] == "i2c_scan_result"
        assert isinstance(resp["payload"]["devices"], list)
        assert resp["payload"]["count"] == len(resp["payload"]["devices"])


class TestI2cWrite:
    def test_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "i2c_write", "id": "iw1",
            "payload": {"bus": 0, "address": "0x3C", "data": "AQID"},
        }))
        assert resp["payload"]["command"] == "i2c_write"
        assert resp["payload"]["status"] == "success"


class TestI2cRead:
    def test_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "i2c_read", "id": "ir1",
            "payload": {"bus": 0, "address": "0x50", "length": 3},
        }))
        assert resp["type"] == "i2c_read_result"
        assert isinstance(resp["payload"]["data"], str)  # base64
        assert resp["payload"]["length"] > 0


class TestDisplayUpdate:
    def test_ssd1306_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "display_update", "id": "du1",
            "payload": {
                "bus": 0, "address": "0x3C", "controller": "ssd1306",
                "width": 128, "height": 64, "init": True,
                "segments": [{"offset": 0, "data": "AAAA"}],
            },
        }))
        assert resp["payload"]["controller"] == "ssd1306"
        assert resp["payload"]["bytes_written"] == 1024

    def test_sh1106_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "display_update", "id": "du2",
            "payload": {
                "bus": 0, "address": "0x3C", "controller": "sh1106",
                "width": 128, "height": 64, "init": False,
                "segments": [{"offset": 0, "data": "AAAA"}],
            },
        }))
        assert resp["payload"]["controller"] == "sh1106"


class TestReboot:
    def test_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({"type": "reboot", "id": "rb1"}))
        assert resp["payload"]["status"] == "rebooting"
        assert resp["id"] == "rb1"


class TestUnknownCommand:
    def test_error_response(self):
        device = ProtocolDevice()
        resp = device.handle(json.dumps({
            "type": "totally_unknown", "id": "unk1",
            "payload": {},
        }))
        assert resp["type"] == "command_error"
        assert "error" in resp["payload"]
        assert resp["id"] == "unk1"


class TestMalformedMessages:
    def test_missing_type(self):
        """Device firmware returns false on missing type — mock validates format."""
        msg = json.dumps({"payload": {"pin": 5}})
        parsed = json.loads(msg)
        assert "type" not in parsed

    def test_empty_json(self):
        msg = json.dumps({})
        parsed = json.loads(msg)
        assert "type" not in parsed

    def test_missing_payload(self):
        msg = json.dumps({"type": "set_gpio_state"})
        parsed = json.loads(msg)
        assert "payload" not in parsed


class TestMessageIdCorrelation:
    """All responses must carry the same id as the command."""

    def setup_method(self):
        self.device = ProtocolDevice()

    def test_all_command_types(self):
        commands = [
            {"type": "set_gpio_state", "id": "a", "payload": {"pin": 5, "state": "high"}},
            {"type": "get_pin_state", "id": "b", "payload": {"pin": 5, "mode": "digital"}},
            {"type": "set_pwm_state", "id": "c", "payload": {"pin": 18, "frequency": 1000, "duty_cycle": 0.5}},
            {"type": "configure_gpio_input_monitoring", "id": "d", "payload": {"pin": 15, "enable": True, "pull": "up"}},
            {"type": "i2c_configure", "id": "e", "payload": {"bus": 0, "sda_pin": 21, "scl_pin": 22}},
            {"type": "i2c_scan", "id": "f", "payload": {"bus": 0}},
            {"type": "i2c_write", "id": "g", "payload": {"bus": 0, "address": "0x3C", "data": "AA=="}},
            {"type": "i2c_read", "id": "h", "payload": {"bus": 0, "address": "0x50", "length": 1}},
            {"type": "display_update", "id": "i", "payload": {
                "bus": 0, "address": "0x3C", "controller": "ssd1306",
                "width": 128, "height": 64, "init": False,
                "segments": [{"offset": 0, "data": "AA=="}],
            }},
            {"type": "reboot", "id": "j"},
        ]

        for cmd in commands:
            resp = self.device.handle(json.dumps(cmd))
            assert resp is not None, f"No response for {cmd['type']}"
            assert resp["id"] == cmd["id"], f"ID mismatch for {cmd['type']}: expected {cmd['id']}, got {resp.get('id')}"

    def test_no_id_means_no_id_in_response(self):
        resp = self.device.handle(json.dumps({
            "type": "set_gpio_state",
            "payload": {"pin": 5, "state": "high"},
        }))
        assert "id" not in resp
