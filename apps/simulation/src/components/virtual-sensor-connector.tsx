'use client'

import { useState, useMemo } from 'react';
import type { PinType, SensorType, SensorInfo, ConnectedSensor, Protocol } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MemoryStick, Trash2 } from 'lucide-react';

const SENSOR_PRESETS: SensorInfo[] = [
  {
    name: 'DHT22',
    protocol: 'I2C',
    pins: { 'SDA': 'I2C SDA', 'SCL': 'I2C SCL' },
  },
  {
    name: 'SSD1306 OLED',
    protocol: 'SPI',
    pins: { 'SCK': 'SPI SCK', 'MOSI': 'SPI TX', 'CS': 'SPI CSn' },
  },
  {
    name: 'Push Button',
    protocol: 'ADC',
    pins: { 'ADC Pin': 'ADC' },
  },
];

interface VirtualSensorConnectorProps {
  pins: PinType[];
  connectedSensors: ConnectedSensor[];
  onConnectSensor: (sensor: ConnectedSensor) => void;
  onDisconnectSensor: (sensorType: string) => void;
  addLog: (message: string) => void;
}

export default function VirtualSensorConnector({ pins, connectedSensors, onConnectSensor, onDisconnectSensor, addLog }: VirtualSensorConnectorProps) {
  const [selectedSensorType, setSelectedSensorType] = useState<SensorType | ''>('');
  const [pinSelections, setPinSelections] = useState<Record<string, number | ''>>({});

  const selectedSensorInfo = useMemo(() => {
    return SENSOR_PRESETS.find(p => p.name === selectedSensorType);
  }, [selectedSensorType]);

  const getPinsByFunction = (funcSubstring: string) => {
    const parts = funcSubstring.trim().split(/\s+/);
    return pins.filter(p => 
      p.gpio !== null && parts.every(part => p.functions.some(f => f.includes(part)))
    ).sort((a, b) => a.gpio! - b.gpio!);
  };

  const handleSensorTypeChange = (value: string) => {
    setSelectedSensorType(value as SensorType);
    setPinSelections({}); // Reset pin selections when sensor type changes
  };

  const handlePinSelectionChange = (pinRole: string, pinGpio: string) => {
    setPinSelections(prev => ({ ...prev, [pinRole]: parseInt(pinGpio, 10) }));
  };
  
  const handleConnect = () => {
    if (!selectedSensorInfo) {
        addLog('Error: No sensor type selected.');
        return;
    }

    const requiredPins = Object.keys(selectedSensorInfo.pins);
    const selectedPins = Object.keys(pinSelections).filter(p => pinSelections[p] !== '');
    
    if (requiredPins.length !== selectedPins.length) {
        addLog(`Error: Please select all required pins for ${selectedSensorInfo.name}.`);
        return;
    }

    onConnectSensor({
        type: selectedSensorInfo.name,
        pins: pinSelections as Record<string, number>,
    });

    // Reset form
    setSelectedSensorType('');
    setPinSelections({});
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virtual Sensor Connector</CardTitle>
        <CardDescription>Connect virtual sensors to the board pins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
            <Label>Connected Sensors</Label>
            <div className="flex flex-wrap gap-2">
                {connectedSensors.length > 0 ? connectedSensors.map(sensor => (
                    <div key={sensor.type} className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                        <span className="text-sm font-medium">{sensor.type}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDisconnectSensor(sensor.type)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                )) : <p className="text-sm text-muted-foreground">No sensors connected.</p>}
            </div>
        </div>

        <div className="space-y-2">
            <Label htmlFor="sensor-type">Sensor Type</Label>
            <Select onValueChange={handleSensorTypeChange} value={selectedSensorType}>
                <SelectTrigger id="sensor-type">
                    <SelectValue placeholder="Select a sensor to connect" />
                </SelectTrigger>
                <SelectContent>
                    {SENSOR_PRESETS.map(preset => (
                        <SelectItem key={preset.name} value={preset.name}>{preset.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        {selectedSensorInfo && (
            <div className="grid grid-cols-2 gap-4">
                {Object.entries(selectedSensorInfo.pins).map(([pinRole, pinFunction]) => {
                    const availablePins = getPinsByFunction(pinFunction);
                    return (
                        <div key={pinRole} className="space-y-2">
                            <Label htmlFor={`pin-${pinRole}`}>{pinRole}</Label>
                            <Select onValueChange={(value) => handlePinSelectionChange(pinRole, value)}>
                                <SelectTrigger id={`pin-${pinRole}`}>
                                    <SelectValue placeholder={`Select ${pinRole}`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {availablePins.map(pin => (
                                        <SelectItem key={pin.id} value={String(pin.gpio)}>GP{pin.gpio}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )
                })}
            </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleConnect} disabled={!selectedSensorInfo || Object.keys(pinSelections).length === 0}>
            <MemoryStick className="mr-2 h-4 w-4" />
            Connect Sensor
        </Button>
      </CardFooter>
    </Card>
  );
}
