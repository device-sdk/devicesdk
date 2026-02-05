
import type { PinType } from './types';

export const pinsData: PinType[] = [
  // Left side
  { id: 1, gpio: 0, name: 'GP0', position: { top: '5%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['UART0 TX', 'I2C0 SDA'] },
  { id: 2, gpio: 1, name: 'GP1', position: { top: '9.7%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['UART0 RX', 'I2C0 SCL'] },
  { id: 3, name: 'GND', gpio: null, position: { top: '14.4%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 4, gpio: 2, name: 'GP2', position: { top: '19.1%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['I2C1 SDA'] },
  { id: 5, gpio: 3, name: 'GP3', position: { top: '23.8%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['I2C1 SCL'] },
  { id: 6, gpio: 4, name: 'GP4', position: { top: '28.5%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['UART1 TX', 'I2C0 SDA'] },
  { id: 7, gpio: 5, name: 'GP5', position: { top: '33.2%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['UART1 RX', 'I2C0 SCL'] },
  { id: 8, name: 'GND', gpio: null, position: { top: '37.9%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 9, gpio: 6, name: 'GP6', position: { top: '42.6%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 RX', 'I2C1 SDA'] },
  { id: 10, gpio: 7, name: 'GP7', position: { top: '47.3%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 CSn', 'I2C1 SCL'] },
  { id: 11, gpio: 8, name: 'GP8', position: { top: '52.0%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 SCK', 'I2C0 SDA'] },
  { id: 12, gpio: 9, name: 'GP9', position: { top: '56.7%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 TX', 'I2C0 SCL'] },
  { id: 13, name: 'GND', gpio: null, position: { top: '61.4%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 14, gpio: 10, name: 'GP10', position: { top: '66.1%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI1 RX', 'I2C1 SDA'] },
  { id: 15, gpio: 11, name: 'GP11', position: { top: '70.8%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI1 CSn', 'I2C1 SCL'] },
  { id: 16, gpio: 12, name: 'GP12', position: { top: '75.5%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI1 SCK', 'I2C0 SDA'] },
  { id: 17, gpio: 13, name: 'GP13', position: { top: '80.2%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI1 TX', 'I2C0 SCL'] },
  { id: 18, name: 'GND', gpio: null, position: { top: '84.9%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 19, gpio: 14, name: 'GP14', position: { top: '89.6%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['UART0 TX', 'I2C1 SDA'] },
  { id: 20, gpio: 15, name: 'GP15', position: { top: '94.3%', left: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['UART0 RX', 'I2C1 SCL'] },
  
  // Right side
  { id: 40, name: 'VBUS', gpio: null, position: { top: '5%', right: '0' }, mode: 'INPUT', state: 'HIGH', value: 1, functions: ['5V'] },
  { id: 39, name: 'VSYS', gpio: null, position: { top: '9.7%', right: '0' }, mode: 'INPUT', state: 'HIGH', value: 1, functions: ['1.8V-5.5V'] },
  { id: 38, name: 'GND', gpio: null, position: { top: '14.4%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 37, name: '3V3_EN', gpio: null, position: { top: '19.1%', right: '0' }, mode: 'INPUT', state: 'HIGH', value: 1, functions: ['Enable 3.3V'] },
  { id: 36, name: '3V3(OUT)', gpio: null, position: { top: '23.8%', right: '0' }, mode: 'INPUT', state: 'HIGH', value: 1, functions: ['3.3V Output'] },
  { id: 35, name: 'ADC_VREF', gpio: null, position: { top: '28.5%', right: '0' }, mode: 'INPUT', state: 'HIGH', value: 1, functions: ['ADC Reference'] },
  { id: 34, gpio: 28, name: 'GP28', position: { top: '33.2%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['ADC2', 'I2C0 SDA'] },
  { id: 33, name: 'GND', gpio: null, position: { top: '37.9%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 32, gpio: 27, name: 'GP27', position: { top: '42.6%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['ADC1', 'I2C1 SCL'] },
  { id: 31, gpio: 26, name: 'GP26', position: { top: '47.3%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['ADC0', 'I2C1 SDA'] },
  { id: 30, name: 'RUN', gpio: null, position: { top: '52.0%', right: '0' }, mode: 'INPUT', state: 'HIGH', value: 1, functions: ['Reset'] },
  { id: 29, gpio: 22, name: 'GP22', position: { top: '56.7%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: [] },
  { id: 28, name: 'GND', gpio: null, position: { top: '61.4%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 27, gpio: 21, name: 'GP21', position: { top: '66.1%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['I2C0 SDA'] },
  { id: 26, gpio: 20, name: 'GP20', position: { top: '70.8%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['I2C0 SCL'] },
  { id: 25, gpio: 19, name: 'GP19', position: { top: '75.5%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 TX', 'I2C1 SCL'] },
  { id: 24, gpio: 18, name: 'GP18', position: { top: '80.2%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 SCK', 'I2C1 SDA'] },
  { id: 23, name: 'GND', gpio: null, position: { top: '84.9%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['Ground'] },
  { id: 22, gpio: 17, name: 'GP17', position: { top: '89.6%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 CSn', 'I2C0 SCL'] },
  { id: 21, gpio: 16, name: 'GP16', position: { top: '94.3%', right: '0' }, mode: 'INPUT', state: 'LOW', value: 0, functions: ['SPI0 RX', 'I2C0 SDA'] },
  { id: 99, name: 'LED', gpio: null, position: { top: '0', left: '0' }, mode: 'OUTPUT', state: 'LOW', value: 0, functions: ['Onboard LED'] }
];
