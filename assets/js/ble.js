import { DEVICE } from './config.js';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const ACK_ERRORS = {
  0: 'OK',
  1: 'Đồng hồ đang bận',
  2: 'Đồng hồ chưa sẵn sàng',
  3: 'Lệnh không hợp lệ',
  4: 'Độ dài gói không hợp lệ',
  5: 'Offset dữ liệu không hợp lệ',
  6: 'Không xóa được Flash',
  7: 'Không ghi được Flash',
  8: 'CRC không khớp',
  9: 'TNF1 không hợp lệ',
  10: 'Giao diện không đúng kích thước màn',
  11: 'Màn E-Ink bận quá thời gian',
  12: 'Chưa có nhiệt độ',
  13: 'Lỗi ADC nhiệt độ',
  14: 'Nhiệt độ ngoài phạm vi',
  15: 'Nhiệt độ chưa hiệu chỉnh',
  16: 'OTA không hợp lệ'
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function findPattern(target, pattern) {
  outer: for (let i = 0; i <= target.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) if (target[i + j] !== pattern[j]) continue outer;
    return i;
  }
  return -1;
}

export class TnvaBle {
  constructor(log = () => {}) {
    this.log = log;
    this.device = null;
    this.server = null;
    this.longValue = null;
    this.adcValue = null;
    this.ctrlPoint = null;
    this.disconnectListeners = new Set();
  }

  get connected() {
    return Boolean(this.device?.gatt?.connected && this.longValue);
  }

  onDisconnect(callback) {
    this.disconnectListeners.add(callback);
    return () => this.disconnectListeners.delete(callback);
  }

  async connect() {
    if (!navigator.bluetooth) throw new Error('Trình duyệt không hỗ trợ Web Bluetooth');
    this.log('Chọn thiết bị');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: DEVICE.namePrefix }],
      optionalServices: [DEVICE.service]
    });
    if (!device.name?.startsWith(DEVICE.namePrefix)) throw new Error('Sai thiết bị');
    return this.attach(device);
  }

  async reconnectGranted() {
    if (!navigator.bluetooth?.getDevices) return null;
    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find(item => item.name?.startsWith(DEVICE.namePrefix));
    if (!device) return null;
    return this.attach(device);
  }

  async attach(device) {
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => this.handleDisconnect(), { once: true });
    this.server = await device.gatt.connect();
    const service = await this.server.getPrimaryService(DEVICE.service);
    this.longValue = await service.getCharacteristic(DEVICE.characteristic);
    try { this.adcValue = await service.getCharacteristic(0xff02); } catch { this.adcValue = null; }
    try { this.ctrlPoint = await service.getCharacteristic(0xff03); } catch { this.ctrlPoint = null; }
    this.log(`Đã kết nối ${device.name}`);
    return this.readStatus();
  }

  handleDisconnect() {
    this.log('Đã ngắt kết nối');
    this.server = null;
    this.longValue = null;
    this.adcValue = null;
    this.ctrlPoint = null;
    for (const callback of this.disconnectListeners) callback();
  }

  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    else this.handleDisconnect();
  }

  async readStatus() {
    if (!this.connected) throw new Error('Chưa kết nối');
    const rawTime = await this.longValue.readValue();
    const time = {
      year: rawTime.byteLength >= 2 ? rawTime.getUint16(0, true) : 0,
      month: rawTime.byteLength >= 3 ? rawTime.getUint8(2) : 0,
      day: rawTime.byteLength >= 4 ? rawTime.getUint8(3) : 0,
      hour: rawTime.byteLength >= 5 ? rawTime.getUint8(4) : 0,
      minute: rawTime.byteLength >= 6 ? rawTime.getUint8(5) : 0,
      second: rawTime.byteLength >= 7 ? rawTime.getUint8(6) : 0,
      faceId: rawTime.byteLength >= 12 ? rawTime.getUint8(11) : 0,
      faceCount: rawTime.byteLength >= 13 ? rawTime.getUint8(12) : 0,
      customValid: rawTime.byteLength >= 14 ? rawTime.getUint8(13) : 0,
      temperature: rawTime.byteLength >= 16 && rawTime.getUint16(14, true) !== 0x8000
        ? rawTime.getInt16(14, true) / 10
        : null,
      bootState: rawTime.byteLength >= 17 ? rawTime.getUint8(16) : null,
      firmware: rawTime.byteLength >= 20
        ? `${rawTime.getUint8(17)}.${rawTime.getUint8(18)}.${rawTime.getUint8(19)}`
        : null,
      model: rawTime.byteLength > 20
        ? new TextDecoder().decode(new Uint8Array(rawTime.buffer, rawTime.byteOffset + 20, rawTime.byteLength - 20))
        : null
    };
    let voltage = null;
    if (this.adcValue) {
      const rawVoltage = await this.adcValue.readValue();
      if (rawVoltage.byteLength >= 2) voltage = rawVoltage.getUint16(0, true) / 1000;
    }
    return { name: this.device.name, time, voltage, temperature: time.temperature };
  }

  async syncTime() {
    if (!this.connected) throw new Error('Chưa kết nối');
    const now = new Date();
    let lunarMonth = 1;
    let lunarDay = 1;
    let lunarYear = now.getFullYear();
    try {
      let text = now.toLocaleDateString('zh-CN-u-ca-chinese', { month: 'numeric', day: 'numeric' });
      const leap = text.startsWith('闰') ? 128 : 0;
      if (leap) text = text.slice(1);
      const parsed = text.split('-').map(Number);
      lunarMonth = leap + parsed[0];
      lunarDay = parsed[1];
      lunarYear = Number.parseInt(now.toLocaleDateString('zh-CN-u-ca-chinese', { year: 'numeric' }), 10);
    } catch {
      lunarMonth = now.getMonth() + 1;
      lunarDay = now.getDate();
    }
    const packet = new Uint8Array(12);
    packet.set([
      0x91,
      now.getFullYear() & 0xff,
      now.getFullYear() >> 8,
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getDay(),
      Math.max(0, lunarYear - 2020),
      Math.max(0, lunarMonth - 1),
      lunarDay
    ]);
    await this.writePacket(packet);
    await this.waitAck(0x91, 0, 1800);
    const status = await this.readStatus();
    const deviceTime = new Date(
      status.time.year,
      status.time.month,
      status.time.day,
      status.time.hour,
      status.time.minute
    );
    if (Math.abs(deviceTime.getTime() - Date.now()) > 120000) {
      throw new Error('Đồng hồ trả thời gian không khớp');
    }
    this.log('Đã đồng bộ thời gian và nhận ACK');
  }

  async toggleHourFormat() {
    if (!this.connected) throw new Error('Chưa kết nối');
    await this.longValue.writeValue(new Uint8Array([0x90]));
    this.log('Đã đổi 12 / 24 giờ');
  }

  async selectFace(faceId) {
    if (!this.connected) throw new Error('Chưa kết nối');
    const status = await this.readStatus();
    if (faceId < 0 || faceId >= (status.time.faceCount || 0)) {
      throw new Error('Firmware chưa hỗ trợ mặt này');
    }
    const packet = new Uint8Array([
      0x99, faceId, 0x54, 0x4e, 0x56, 0x41, 0x46, 0x41, 0x43, 0x45, 0x06, 0x00
    ]);
    await this.writePacket(packet);
    await delay(3400);
    let next = await this.readStatus();
    if (next.time.faceId !== faceId) {
      packet[0] = 0x93;
      await this.writePacket(packet);
      await delay(3400);
      next = await this.readStatus();
    }
    if (next.time.faceId !== faceId) throw new Error('Đồng hồ chưa xác nhận đổi mặt');
    this.log(`Đã chọn mặt ${faceId + 1}`);
    return next;
  }

  async writePacket(bytes) {
    if (this.longValue.writeValueWithResponse) {
      await this.longValue.writeValueWithResponse(bytes);
    } else {
      await this.longValue.writeValue(bytes);
    }
  }

  async waitAck(command, expectedOffset, timeoutMs = 2500) {
    if (!this.ctrlPoint) throw new Error('Firmware/web thiếu FF03 ACK');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.ctrlPoint.readValue();
      if (value.byteLength >= 12 &&
          value.getUint8(11) === 0xa5 &&
          value.getUint8(10) === 1 &&
          value.getUint8(0) === command) {
        const code = value.getUint8(1);
        const nextOffset = value.getUint32(4, true);
        if (code !== 0) {
          const error = new Error(ACK_ERRORS[code] || `Lỗi firmware ${code}`);
          error.ackCode = code;
          throw error;
        }
        if (nextOffset === expectedOffset) return { nextOffset, bootState: value.getUint8(2) };
      }
      await delay(60);
    }
    const error = new Error(`Hết thời gian chờ ACK 0x${command.toString(16)}`);
    error.ackTimeout = true;
    throw error;
  }

  async writeAcked(packet, command, expectedOffset, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await this.writePacket(packet);
      try {
        return await this.waitAck(command, expectedOffset);
      } catch (error) {
        lastError = error;
        if (!error.ackTimeout || attempt === retries) throw error;
        this.log(`Thử lại ACK 0x${command.toString(16)} (${attempt + 1}/${retries})`);
      }
    }
    throw lastError;
  }

  async uploadFace(packageBytes, onProgress = () => {}) {
    if (!this.connected) throw new Error('Chưa kết nối');
    if (!this.ctrlPoint) throw new Error('Firmware chưa hỗ trợ FF03 ACK');
    if (packageBytes.length < 20 || packageBytes.length > 4096) {
      throw new Error('Gói TNF1 phải từ 20 byte đến 4 KB');
    }
    const checksum = crc32(packageBytes);
    const begin = new Uint8Array(12);
    const view = new DataView(begin.buffer);
    begin[0] = 0x94;
    view.setUint32(1, packageBytes.length, true);
    view.setUint32(5, checksum, true);
    begin[9] = 2;
    await this.writeAcked(begin, 0x94, 0);
    const chunkSize = 120;
    for (let offset = 0; offset < packageBytes.length; offset += chunkSize) {
      const chunk = packageBytes.slice(offset, offset + chunkSize);
      const packet = new Uint8Array(5 + chunk.length);
      const packetView = new DataView(packet.buffer);
      packet[0] = 0x95;
      packetView.setUint32(1, offset, true);
      packet.set(chunk, 5);
      await this.writeAcked(packet, 0x95, offset + chunk.length);
      onProgress(Math.min(100, Math.round(((offset + chunk.length) / packageBytes.length) * 100)));
    }
    try {
      await this.writeAcked(new Uint8Array([0x96]), 0x96, packageBytes.length, 0);
    } catch (error) {
      if (!error.ackTimeout) throw error;
      const fallback = await this.readStatus();
      if (!fallback.time.customValid || fallback.time.faceId !== 6) throw error;
      this.log('Mất ACK 0x96 nhưng FF01 xác nhận TNF1 đã lưu');
    }
    await delay(120);
    let status = await this.readStatus();
    for (let retry = 0; retry < 5 &&
         (!status.time.customValid || status.time.faceId !== 6); retry++) {
      await delay(120);
      status = await this.readStatus();
    }
    if (!status.time.customValid || status.time.faceId !== 6) throw new Error('Đồng hồ không xác nhận giao diện đã lưu');
    this.log('Đã lưu giao diện vào Flash');
  }

  async updateFirmware(file, onProgress = () => {}) {
    if (!this.connected) throw new Error('Chưa kết nối');
    if (!file.name?.toLowerCase().endsWith('.bin')) {
      throw new Error('OTA recovery chỉ nhận raw application .bin, không nhận .img/full Flash');
    }
    const firm = new Uint8Array(await file.arrayBuffer());
    if (firm.length === 0 || firm.length > 0xffff) {
      throw new Error('Sai loại file: OTA V12 chỉ nhận raw application tối đa 65535 byte; tuyệt đối không chọn full Flash backup');
    }
    const magic = new Uint8Array([0x79, 0x13, 0xa5, 0xf9, 0x86, 0xec, 0x5a, 0x06]);
    const position = findPattern(firm, magic);
    if (position < 0) throw new Error('Firmware không hợp lệ');
    const version = firm[position + 9] * 256 + firm[position + 8];
    const checksum = crc32(firm);
    const begin = new Uint8Array(136);
    new DataView(begin.buffer).setUint16(2, firm.length, true);
    begin[0] = 0xa0;
    await this.longValue.writeValue(begin);
    let sent = 0;
    const total = firm.length + 64;
    const packet = new Uint8Array(136);
    const view = new DataView(packet.buffer);
    for (let offset = 0; offset < total; offset += 256) {
      packet.fill(0xff);
      if (offset === 0) {
        view.setUint32(8, 0x00aa5170, true);
        view.setUint32(12, firm.length, true);
        view.setUint32(16, checksum, true);
        view.setUint32(36, 0xa50f0000 + version, true);
        packet[40] = 0;
        packet[0] = 0xa2;
        packet.set(firm.slice(sent, sent + 64), 72);
        await this.longValue.writeValue(packet);
        sent += 64;
      } else {
        packet[0] = 0xa2;
        packet.set(firm.slice(sent, sent + 128), 8);
        await this.longValue.writeValue(packet);
        sent += 128;
      }
      packet.fill(0xff);
      packet[0] = 0xa3;
      packet.set(firm.slice(sent, sent + 128), 8);
      await this.longValue.writeValue(packet);
      sent += 128;
      onProgress(Math.min(100, Math.round((sent / total) * 100)));
    }
    const finish = new Uint8Array(136);
    finish[0] = 0xa4;
    await this.longValue.writeValue(finish);
    this.log('Đã gửi firmware');
  }
}

export { crc32 };
