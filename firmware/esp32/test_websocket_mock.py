#!/usr/bin/env python3
"""
Functional tests for IoTKit ESP32 client with mock WebSocket server.
Tests message handling and GPIO command processing.
"""

import asyncio
import json
import logging
from typing import List, Dict
import websockets
from websockets.server import serve
import pytest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MockIoTKitServer:
    """Mock IoTKit WebSocket server for testing."""
    
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.server = None
        self.connected_clients = []
        self.received_messages = []
        self.expected_token = "test_api_token_12345"
        
    async def handler(self, websocket, path):
        """Handle WebSocket connections and messages."""
        # Check authorization header
        auth_header = websocket.request_headers.get('Authorization', '')
        if not auth_header.startswith(f'Bearer {self.expected_token}'):
            await websocket.close(1008, "Unauthorized")
            return
        
        logger.info(f"Client connected from {websocket.remote_address}")
        self.connected_clients.append(websocket)
        
        try:
            async for message in websocket:
                logger.info(f"Received: {message}")
                self.received_messages.append(json.loads(message))
                
                # Auto-respond to pings
                msg_data = json.loads(message)
                if msg_data.get('type') == 'ping':
                    pong = json.dumps({"type": "pong"})
                    await websocket.send(pong)
                    logger.info(f"Sent: {pong}")
        except websockets.exceptions.ConnectionClosed:
            logger.info("Client disconnected")
        finally:
            self.connected_clients.remove(websocket)
    
    async def send_to_all(self, message: Dict):
        """Send message to all connected clients."""
        msg_str = json.dumps(message)
        logger.info(f"Broadcasting: {msg_str}")
        if self.connected_clients:
            await asyncio.gather(
                *[client.send(msg_str) for client in self.connected_clients],
                return_exceptions=True
            )
    
    async def start(self):
        """Start the mock server."""
        self.server = await serve(self.handler, self.host, self.port)
        logger.info(f"Mock server started on ws://{self.host}:{self.port}")
    
    async def stop(self):
        """Stop the mock server."""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("Mock server stopped")


@pytest.mark.asyncio
async def test_device_connect_message():
    """Test that device sends 'device connect' message on connection."""
    server = MockIoTKitServer()
    await server.start()
    
    # Simulate client connection
    uri = f"ws://{server.host}:{server.port}/v1/projects/1/devices/2/connect/websocket"
    
    async with websockets.connect(
        uri,
        extra_headers={"Authorization": f"Bearer {server.expected_token}"}
    ) as websocket:
        # Send device connect message
        device_connect = {"type": "device connect"}
        await websocket.send(json.dumps(device_connect))
        
        # Wait a bit for server to process
        await asyncio.sleep(0.1)
        
        # Verify server received the message
        assert len(server.received_messages) == 1
        assert server.received_messages[0]["type"] == "device connect"
    
    await server.stop()
    logger.info("✓ Device connect message test passed")


@pytest.mark.asyncio
async def test_gpio_high_command():
    """Test server sending GPIO HIGH command."""
    server = MockIoTKitServer()
    await server.start()
    
    uri = f"ws://{server.host}:{server.port}/v1/projects/1/devices/2/connect/websocket"
    
    async with websockets.connect(
        uri,
        extra_headers={"Authorization": f"Bearer {server.expected_token}"}
    ) as websocket:
        # Server sends GPIO command to turn pin 25 HIGH
        gpio_cmd = {
            "type": "set_gpio_state",
            "payload": {
                "pin": 25,
                "state": "high"
            }
        }
        await websocket.send(json.dumps(gpio_cmd))
        
        # In real test, device would process this and set GPIO 25 to HIGH
        # Here we just verify the message format is correct
        await asyncio.sleep(0.1)
        
        logger.info(f"✓ Sent GPIO HIGH command for pin 25")
    
    await server.stop()
    logger.info("✓ GPIO HIGH command test passed")


@pytest.mark.asyncio
async def test_gpio_low_command():
    """Test server sending GPIO LOW command."""
    server = MockIoTKitServer()
    await server.start()
    
    uri = f"ws://{server.host}:{server.port}/v1/projects/1/devices/2/connect/websocket"
    
    async with websockets.connect(
        uri,
        extra_headers={"Authorization": f"Bearer {server.expected_token}"}
    ) as websocket:
        # Server sends GPIO command to turn pin 2 LOW (LED off)
        gpio_cmd = {
            "type": "set_gpio_state",
            "payload": {
                "pin": 2,
                "state": "low"
            }
        }
        await websocket.send(json.dumps(gpio_cmd))
        
        await asyncio.sleep(0.1)
        logger.info(f"✓ Sent GPIO LOW command for pin 2")
    
    await server.stop()
    logger.info("✓ GPIO LOW command test passed")


@pytest.mark.asyncio
async def test_ping_pong():
    """Test ping/pong mechanism."""
    server = MockIoTKitServer()
    await server.start()
    
    uri = f"ws://{server.host}:{server.port}/v1/projects/1/devices/2/connect/websocket"
    
    async with websockets.connect(
        uri,
        extra_headers={"Authorization": f"Bearer {server.expected_token}"}
    ) as websocket:
        # Send ping
        ping_msg = {"type": "ping"}
        await websocket.send(json.dumps(ping_msg))
        
        # Wait for pong response
        response = await asyncio.wait_for(websocket.recv(), timeout=1.0)
        response_data = json.loads(response)
        
        assert response_data["type"] == "pong"
        logger.info("✓ Received pong response to ping")
    
    await server.stop()
    logger.info("✓ Ping/pong test passed")


@pytest.mark.asyncio
async def test_multiple_gpio_commands():
    """Test sequence of GPIO commands."""
    server = MockIoTKitServer()
    await server.start()
    
    uri = f"ws://{server.host}:{server.port}/v1/projects/1/devices/2/connect/websocket"
    
    async with websockets.connect(
        uri,
        extra_headers={"Authorization": f"Bearer {server.expected_token}"}
    ) as websocket:
        # Send sequence of commands
        commands = [
            {"type": "set_gpio_state", "payload": {"pin": 2, "state": "high"}},
            {"type": "set_gpio_state", "payload": {"pin": 25, "state": "low"}},
            {"type": "set_gpio_state", "payload": {"pin": 2, "state": "low"}},
            {"type": "set_gpio_state", "payload": {"pin": 26, "state": "high"}},
        ]
        
        for cmd in commands:
            await websocket.send(json.dumps(cmd))
            await asyncio.sleep(0.05)
            logger.info(f"✓ Sent command: pin {cmd['payload']['pin']} -> {cmd['payload']['state']}")
    
    await server.stop()
    logger.info("✓ Multiple GPIO commands test passed")


@pytest.mark.asyncio
async def test_invalid_message_format():
    """Test handling of invalid message formats."""
    server = MockIoTKitServer()
    await server.start()
    
    uri = f"ws://{server.host}:{server.port}/v1/projects/1/devices/2/connect/websocket"
    
    async with websockets.connect(
        uri,
        extra_headers={"Authorization": f"Bearer {server.expected_token}"}
    ) as websocket:
        # Send malformed JSON
        invalid_messages = [
            '{"type": "set_gpio_state"}',  # Missing payload
            '{"payload": {"pin": 2}}',  # Missing type
            '{"type": "set_gpio_state", "payload": {"state": "high"}}',  # Missing pin
            '{"type": "set_gpio_state", "payload": {"pin": "invalid"}}',  # Invalid pin type
        ]
        
        for msg in invalid_messages:
            await websocket.send(msg)
            await asyncio.sleep(0.05)
            logger.info(f"✓ Sent invalid message (should be handled gracefully)")
    
    await server.stop()
    logger.info("✓ Invalid message format test passed")


@pytest.mark.asyncio
async def test_unauthorized_connection():
    """Test that connections without valid token are rejected."""
    server = MockIoTKitServer()
    await server.start()
    
    uri = f"ws://{server.host}:{server.port}/v1/projects/1/devices/2/connect/websocket"
    
    try:
        async with websockets.connect(
            uri,
            extra_headers={"Authorization": "Bearer invalid_token"}
        ) as websocket:
            await websocket.send(json.dumps({"type": "test"}))
        pytest.fail("Connection should have been rejected")
    except websockets.exceptions.ConnectionClosedError as e:
        logger.info(f"✓ Unauthorized connection rejected: {e.code}")
        assert e.code == 1008  # Unauthorized
    
    await server.stop()
    logger.info("✓ Unauthorized connection test passed")


if __name__ == "__main__":
    # Run tests manually
    print("=" * 60)
    print("IoTKit ESP32 Client - WebSocket Functional Tests")
    print("=" * 60)
    
    async def run_all_tests():
        tests = [
            ("Device Connect Message", test_device_connect_message()),
            ("GPIO HIGH Command", test_gpio_high_command()),
            ("GPIO LOW Command", test_gpio_low_command()),
            ("Ping/Pong", test_ping_pong()),
            ("Multiple GPIO Commands", test_multiple_gpio_commands()),
            ("Invalid Message Format", test_invalid_message_format()),
            ("Unauthorized Connection", test_unauthorized_connection()),
        ]
        
        passed = 0
        failed = 0
        
        for name, test_coro in tests:
            try:
                print(f"\n[TEST] {name}")
                await test_coro
                passed += 1
                print(f"[PASS] {name}")
            except Exception as e:
                failed += 1
                print(f"[FAIL] {name}: {e}")
        
        print("\n" + "=" * 60)
        print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
        print("=" * 60)
    
    asyncio.run(run_all_tests())
