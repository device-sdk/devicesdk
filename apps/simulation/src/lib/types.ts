export type PinMode = 'INPUT' | 'OUTPUT';
export type PinState = 'HIGH' | 'LOW';

export interface PinType {
  id: number;
  gpio: number | null;
  name: string;
  position: { top: string; left?: string; right?: string };
  mode: PinMode;
  state: PinState;
  value: number; // 0 for LOW, 1 for HIGH
  functions: string[];
}

export interface LogEntry {
  timestamp: string;
  message: string;
}

export type Protocol = 'SPI' | 'I2C' | 'UART' | 'ADC';

export type SensorType = 'DHT22' | 'Push Button' | 'SSD1306 OLED';

export interface SensorInfo {
    name: SensorType;
    protocol: Protocol;
    pins: { [key: string]: string }; // e.g., { 'SDA': 'I2C SDA', 'SCL': 'I2C SCL' }
}

export interface ConnectedSensor {
    type: SensorType;
    pins: { [key: string]: number }; // e.g., { 'SDA': 2, 'SCL': 3 }
}
