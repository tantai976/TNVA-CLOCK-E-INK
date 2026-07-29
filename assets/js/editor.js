import { DEVICE } from './config.js';

const DYNAMIC_TYPES = new Set(['time', 'date', 'weekday', 'lunar', 'voltage', 'battery', 'analog']);
const TYPE_LABELS = {
  text: 'Chữ', time: 'Giờ', date: 'Ngày', weekday: 'Thứ', lunar: 'Âm lịch',
  voltage: 'Điện áp', battery: 'Pin', analog: 'Đồng hồ kim', image: 'Ảnh', line: 'Đường', rect: 'Khung'
};
const FONT_STACKS = {
  pixel: 'ui-monospace, "Courier New", monospace',
  sans: 'Arial, sans-serif',
  condensed: '"Arial Narrow", "Roboto Condensed", sans-serif',
  mono: '"Courier New", monospace',
  serif: 'Georgia, serif'
};
const FONT_IDS = { pixel: 0, sans: 1, condensed: 2, mono: 3, serif: 4 };
const HANDLE_SIZE = 4;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value, step = 1) { return Math.round(value / step) * step; }
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function crc32Bytes(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const DEVICE_DYNAMIC_TYPE = { time:1, date:2, weekday:3, lunar:4, voltage:5, battery:6, analog:7 };
function deviceFontId(item) {
  const size = Number(item.fontSize || 12);
  if (item.type === 'time' || item.type === 'voltage') {
    if (size >= 55) return 4;
    if (size >= 34) return 3;
  }
  if (size >= 16) return 2;
  if (size >= 11) return 1;
  return 0;
}
function deviceAlign(value) { return value === 'center' ? 1 : value === 'right' ? 2 : 0; }
function slugify(text) {
  return (text || 'giao-dien').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'giao-dien';
}

function defaultProject(width = 212, height = 104) {
  return {
    id: uid(),
    format: 'TNVA_PROJECT',
    version: 3,
    title: 'Giao diện mới',
    author: '',
    width,
    height,
    background: '#f4f1e6',
    elements: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function defaultsFor(type, width, height) {
  const base = {
    id: uid(), type, name: TYPE_LABELS[type] || type,
    x: 10, y: 10, w: 60, h: 18, visible: true,
    font: 'pixel', fontSize: 12, weight: 700, align: 'left',
    color: '#000000', text: '', lineWidth: 1,
    threshold: 150, contrast: 1.15, invert: false, dither: 'ordered',
    imageScale: 1, imageOffsetX: 0, imageOffsetY: 0, imageData: '',
    format: '', showSeconds: false
  };
  switch (type) {
    case 'text': return { ...base, text: 'Nội dung', w: 110, h: 22, font: 'sans', fontSize: 15 };
    case 'time': return { ...base, x: 44, y: 30, w: 110, h: 34, font: 'pixel', fontSize: 30, align: 'center', format: 'HH:mm' };
    case 'date': return { ...base, x: 10, y: 8, w: 100, h: 16, format: 'dd/MM/yyyy' };
    case 'weekday': return { ...base, x: 10, y: 78, w: 70, h: 16, format: 'Thứ bảy' };
    case 'lunar': return { ...base, x: 90, y: 78, w: 90, h: 16, format: 'ÂL 10/06' };
    case 'voltage': return { ...base, x: width - 48, y: height - 16, w: 45, h: 14, format: '3.8V', align: 'right' };
    case 'battery': return { ...base, x: width - 28, y: 5, w: 24, h: 12 };
    case 'analog': return { ...base, x: width - 62, y: 17, w: 54, h: 54 };
    case 'image': return { ...base, x: 20, y: 15, w: Math.min(120, width - 40), h: Math.min(70, height - 30), name: 'Ảnh' };
    case 'line': return { ...base, x: 15, y: 50, w: 100, h: 1, lineWidth: 1 };
    case 'rect': return { ...base, x: 15, y: 15, w: 80, h: 45, lineWidth: 1 };
    default: return base;
  }
}

function dynamicSample(element) {
  switch (element.type) {
    case 'time': return element.showSeconds ? '21:44:08' : '21:44';
    case 'date': return element.format || '27/07/2026';
    case 'weekday': return element.format || 'Thứ bảy';
    case 'lunar': return element.format || 'ÂL 10/06';
    case 'voltage': return element.format || '3.8V';
    default: return '';
  }
}

function legacyFont(font) {
  if (typeof font === 'string') {
    const name = font.toLowerCase();
    if (name.includes('mono')) return 'mono';
    if (name.includes('serif') || name.includes('abril')) return 'serif';
    if (name.includes('condensed')) return 'condensed';
    return 'sans';
  }
  return ({0:'pixel',1:'sans',2:'condensed',3:'mono',4:'serif'})[Number(font)] || 'pixel';
}
function legacyFontSize(object) {
  if (object.fontSize) return clamp(Number(object.fontSize), 5, 80);
  if (object.size) return clamp(Number(object.size), 5, 80);
  return Number(object.font) === 0 ? 10 : Number(object.font) === 2 ? 14 : 12;
}
function legacyBitmapDataUrl(object) {
  const width = Math.max(1, Number(object.width || 1));
  const height = Math.max(1, Number(object.height || 1));
  const bits = Array.isArray(object.dataImg) ? object.dataImg : [];
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const black = Boolean(bits[i]);
    const value = black ? 0 : 255;
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
function legacyTextWidth(text, size) {
  return Math.max(16, Math.round(String(text || '').length * size * .58));
}

export class FaceEditor {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.onChange = options.onChange || (() => {});
    this.onSelection = options.onSelection || (() => {});
    this.onPackage = options.onPackage || (() => {});
    this.project = defaultProject();
    this.selectedId = null;
    this.zoom = 4;
    this.grid = true;
    this.bw = true;
    this.snap = true;
    this.history = [];
    this.future = [];
    this.imageCache = new Map();
    this.drag = null;
    this.rendering = false;
    this.bindCanvas();
    this.resizeCanvas();
    this.render();
  }

  bindCanvas() {
    this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    window.addEventListener('pointermove', event => this.pointerMove(event));
    window.addEventListener('pointerup', event => this.pointerUp(event));
    this.canvas.addEventListener('dblclick', event => {
      const point = this.point(event);
      const element = this.hitElement(point.x, point.y);
      if (element?.type === 'text') {
        this.selectedId = element.id;
        this.onSelection(element.id, element, { editText: true });
      }
    });
  }

  setZoom(value) {
    this.zoom = clamp(value, 1.5, 7);
    this.canvas.style.width = `${this.project.width * this.zoom}px`;
    this.canvas.style.height = `${this.project.height * this.zoom}px`;
    this.render();
  }

  setGrid(value) { this.grid = Boolean(value); this.render(); }
  setBw(value) { this.bw = Boolean(value); this.render(); }

  resizeCanvas() {
    this.canvas.width = this.project.width;
    this.canvas.height = this.project.height;
    this.canvas.style.width = `${this.project.width * this.zoom}px`;
    this.canvas.style.height = `${this.project.height * this.zoom}px`;
  }

  setProfile(profile) {
    const target = DEVICE.profiles[profile];
    if (!target) return;
    this.commit();
    const sx = target.width / this.project.width;
    const sy = target.height / this.project.height;
    for (const element of this.project.elements) {
      element.x = Math.round(element.x * sx);
      element.y = Math.round(element.y * sy);
      element.w = Math.max(1, Math.round(element.w * sx));
      element.h = Math.max(1, Math.round(element.h * sy));
      element.fontSize = Math.max(5, Math.round(element.fontSize * Math.min(sx, sy)));
    }
    this.project.width = target.width;
    this.project.height = target.height;
    this.resizeCanvas();
    this.changed();
  }

  newProject(profile = '212x104') {
    const target = DEVICE.profiles[profile] || DEVICE.profiles['212x104'];
    this.project = defaultProject(target.width, target.height);
    this.history = [];
    this.future = [];
    this.selectedId = null;
    this.resizeCanvas();
    this.changed();
  }

  loadProject(project) {
    if (!project || !Array.isArray(project.elements)) throw new Error('File không hợp lệ');
    this.project = { ...defaultProject(project.width || 212, project.height || 104), ...clone(project) };
    this.selectedId = null;
    this.history = [];
    this.future = [];
    this.resizeCanvas();
    this.preloadImages();
    this.changed();
  }

  exportProject() { return clone(this.project); }

  async addImage(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('Không phải file ảnh');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const image = await this.loadImage(dataUrl);
    this.commit();
    const element = defaultsFor('image', this.project.width, this.project.height);
    element.imageData = dataUrl;
    element.name = file.name.replace(/\.[^.]+$/, '') || 'Ảnh';
    const fit = Math.min(element.w / image.naturalWidth, element.h / image.naturalHeight);
    element.imageScale = fit;
    element.sourceW = image.naturalWidth;
    element.sourceH = image.naturalHeight;
    this.project.elements.push(element);
    this.selectedId = element.id;
    this.changed();
    return element;
  }

  addElement(type) {
    this.commit();
    const element = defaultsFor(type, this.project.width, this.project.height);
    this.project.elements.push(element);
    this.selectedId = element.id;
    this.changed();
    return element;
  }

  select(id) {
    this.selectedId = id;
    this.render();
    this.onSelection(id, this.selected);
  }

  get selected() { return this.project.elements.find(item => item.id === this.selectedId) || null; }

  updateSelected(patch, commit = true) {
    const element = this.selected;
    if (!element) return;
    if (commit) this.commit();
    Object.assign(element, patch);
    this.normalizeElement(element);
    this.changed();
  }

  normalizeElement(element) {
    element.w = clamp(Math.round(element.w), 1, this.project.width);
    element.h = clamp(Math.round(element.h), 1, this.project.height);
    element.x = clamp(Math.round(element.x), -element.w + 2, this.project.width - 2);
    element.y = clamp(Math.round(element.y), -element.h + 2, this.project.height - 2);
    element.fontSize = clamp(Math.round(element.fontSize || 10), 5, 80);
    element.lineWidth = clamp(Math.round(element.lineWidth || 1), 1, 8);
  }

  deleteSelected() {
    if (!this.selected) return;
    this.commit();
    this.project.elements = this.project.elements.filter(item => item.id !== this.selectedId);
    this.selectedId = null;
    this.changed();
  }

  duplicateSelected() {
    const element = this.selected;
    if (!element) return;
    this.commit();
    const copy = clone(element);
    copy.id = uid();
    copy.name = `${element.name} copy`;
    copy.x += 4;
    copy.y += 4;
    this.project.elements.push(copy);
    this.selectedId = copy.id;
    this.changed();
  }

  moveLayer(direction) {
    const index = this.project.elements.findIndex(item => item.id === this.selectedId);
    if (index < 0) return;
    const target = clamp(index + direction, 0, this.project.elements.length - 1);
    if (target === index) return;
    this.commit();
    const [element] = this.project.elements.splice(index, 1);
    this.project.elements.splice(target, 0, element);
    this.changed();
  }

  commit() {
    const snapshot = JSON.stringify(this.project);
    if (this.history.at(-1) !== snapshot) this.history.push(snapshot);
    if (this.history.length > 60) this.history.shift();
    this.future = [];
  }

  undo() {
    if (!this.history.length) return;
    this.future.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.history.pop());
    this.selectedId = null;
    this.resizeCanvas();
    this.changed(false);
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.future.pop());
    this.selectedId = null;
    this.resizeCanvas();
    this.changed(false);
  }

  changed(render = true) {
    this.project.updatedAt = new Date().toISOString();
    if (render) this.render();
    this.onChange(this.exportProject());
    this.onSelection(this.selectedId, this.selected);
    requestAnimationFrame(() => this.reportPackage());
  }

  async reportPackage() {
    try {
      const compiled = await this.compile();
      this.onPackage(compiled.packageBytes.length, DEVICE.profiles[`${this.project.width}x${this.project.height}`]?.maxPackageBytes || 0);
    } catch { this.onPackage(0, 0); }
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.canvas.width / rect.width,
      y: (event.clientY - rect.top) * this.canvas.height / rect.height
    };
  }

  pointerDown(event) {
    if (event.button !== 0) return;
    const point = this.point(event);
    const selected = this.selected;
    const handle = selected ? this.hitHandle(point.x, point.y, selected) : null;
    const element = handle ? selected : this.hitElement(point.x, point.y);
    if (!element) {
      this.select(null);
      return;
    }
    this.select(element.id);
    this.commit();
    this.drag = {
      pointerId: event.pointerId,
      mode: handle ? 'resize' : 'move',
      handle,
      startX: point.x,
      startY: point.y,
      origin: clone(element)
    };
    this.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  pointerMove(event) {
    if (!this.drag) return;
    const element = this.selected;
    if (!element) return;
    const point = this.point(event);
    let dx = point.x - this.drag.startX;
    let dy = point.y - this.drag.startY;
    const step = this.snap ? 1 : 0.25;
    dx = round(dx, step); dy = round(dy, step);
    if (this.drag.mode === 'move') {
      element.x = this.drag.origin.x + dx;
      element.y = this.drag.origin.y + dy;
    } else {
      const h = this.drag.handle;
      let x = this.drag.origin.x, y = this.drag.origin.y, w = this.drag.origin.w, height = this.drag.origin.h;
      if (h.includes('e')) w += dx;
      if (h.includes('s')) height += dy;
      if (h.includes('w')) { x += dx; w -= dx; }
      if (h.includes('n')) { y += dy; height -= dy; }
      if (w < 4) { if (h.includes('w')) x -= 4 - w; w = 4; }
      if (height < 4) { if (h.includes('n')) y -= 4 - height; height = 4; }
      Object.assign(element, { x, y, w, h: height });
    }
    this.normalizeElement(element);
    this.render();
    this.onSelection(this.selectedId, element);
  }

  pointerUp(event) {
    if (!this.drag) return;
    this.canvas.releasePointerCapture?.(event.pointerId);
    this.drag = null;
    this.changed();
  }

  hitElement(x, y) {
    for (let i = this.project.elements.length - 1; i >= 0; i--) {
      const element = this.project.elements[i];
      if (!element.visible) continue;
      if (x >= element.x && x <= element.x + element.w && y >= element.y && y <= element.y + element.h) return element;
    }
    return null;
  }

  handlePoints(element) {
    const x = element.x, y = element.y, x2 = x + element.w, y2 = y + element.h, cx = x + element.w / 2, cy = y + element.h / 2;
    return { nw:[x,y], n:[cx,y], ne:[x2,y], e:[x2,cy], se:[x2,y2], s:[cx,y2], sw:[x,y2], w:[x,cy] };
  }

  hitHandle(x, y, element) {
    for (const [name, point] of Object.entries(this.handlePoints(element))) {
      if (Math.abs(x - point[0]) <= HANDLE_SIZE && Math.abs(y - point[1]) <= HANDLE_SIZE) return name;
    }
    return null;
  }

  preloadImages() {
    for (const element of this.project.elements) if (element.type === 'image' && element.imageData) this.loadImage(element.imageData).then(() => this.render());
  }

  loadImage(dataUrl) {
    const cached = this.imageCache.get(dataUrl);
    if (cached instanceof HTMLImageElement) return Promise.resolve(cached);
    if (cached) return cached;
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        this.imageCache.set(dataUrl, image);
        resolve(image);
      };
      image.onerror = () => reject(new Error('Không đọc được ảnh'));
      image.src = dataUrl;
    });
    this.imageCache.set(dataUrl, promise);
    return promise;
  }

  render() {
    if (this.rendering) return;
    this.rendering = true;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = this.project.background || '#f4f1e6';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const element of this.project.elements) if (element.visible) this.drawElement(ctx, element, { bw: this.bw });
    if (this.grid) this.drawGrid(ctx);
    if (this.selected) this.drawSelection(ctx, this.selected);
    ctx.restore();
    this.rendering = false;
  }

  drawGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(60,70,80,.14)';
    ctx.lineWidth = .3;
    for (let x = 0; x <= this.project.width; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.project.height); ctx.stroke(); }
    for (let y = 0; y <= this.project.height; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.project.width, y); ctx.stroke(); }
    ctx.restore();
  }

  drawSelection(ctx, element) {
    ctx.save();
    ctx.strokeStyle = '#2b7cff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = .7;
    ctx.setLineDash([2, 1]);
    ctx.strokeRect(element.x - .5, element.y - .5, element.w + 1, element.h + 1);
    ctx.setLineDash([]);
    for (const point of Object.values(this.handlePoints(element))) {
      ctx.fillRect(point[0] - 1.4, point[1] - 1.4, 2.8, 2.8);
      ctx.strokeRect(point[0] - 1.4, point[1] - 1.4, 2.8, 2.8);
    }
    ctx.restore();
  }

  drawElement(ctx, element, options = {}) {
    switch (element.type) {
      case 'text': return this.drawText(ctx, element, element.text || '');
      case 'time': case 'date': case 'weekday': case 'lunar': case 'voltage':
        return this.drawText(ctx, element, dynamicSample(element));
      case 'battery': return this.drawBattery(ctx, element);
      case 'analog': return this.drawAnalog(ctx, element);
      case 'line': return this.drawLine(ctx, element);
      case 'rect': return this.drawRect(ctx, element);
      case 'image': return this.drawImage(ctx, element, options);
    }
  }

  drawText(ctx, element, text) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(element.x, element.y, element.w, element.h);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.font = `${element.weight || 400} ${element.fontSize || 12}px ${FONT_STACKS[element.font] || FONT_STACKS.pixel}`;
    ctx.textBaseline = 'middle';
    const lines = String(text).split('\n');
    const lineHeight = (element.fontSize || 12) * 1.12;
    const totalHeight = lineHeight * lines.length;
    let y = element.y + element.h / 2 - totalHeight / 2 + lineHeight / 2;
    for (const line of lines) {
      let x = element.x;
      if (element.align === 'center') { ctx.textAlign = 'center'; x = element.x + element.w / 2; }
      else if (element.align === 'right') { ctx.textAlign = 'right'; x = element.x + element.w; }
      else ctx.textAlign = 'left';
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
    ctx.restore();
  }

  drawLine(ctx, element) {
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = element.lineWidth || 1;
    ctx.beginPath();
    ctx.moveTo(element.x, element.y);
    ctx.lineTo(element.x + element.w, element.y + element.h);
    ctx.stroke();
    ctx.restore();
  }

  drawRect(ctx, element) {
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = element.lineWidth || 1;
    ctx.strokeRect(element.x + .5, element.y + .5, Math.max(1, element.w - 1), Math.max(1, element.h - 1));
    ctx.restore();
  }

  drawBattery(ctx, element) {
    const x = element.x, y = element.y, w = element.w - 2, h = element.h;
    ctx.save();
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, Math.max(4, w - 1), Math.max(4, h - 1));
    ctx.fillRect(x + w, y + h * .3, 2, h * .4);
    ctx.fillRect(x + 2, y + 2, Math.max(1, (w - 5) * .68), Math.max(1, h - 4));
    ctx.restore();
  }

  drawAnalog(ctx, element) {
    const cx = element.x + element.w / 2, cy = element.y + element.h / 2;
    const radius = Math.max(3, Math.min(element.w, element.h) / 2 - 3);
    ctx.save(); ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineWidth = 1;
    for (let hour = 0; hour < 12; hour++) {
      const angle = hour * Math.PI / 6 - Math.PI / 2;
      const outerX = cx + Math.cos(angle) * radius;
      const outerY = cy + Math.sin(angle) * radius;
      const inner = radius - (hour % 3 === 0 ? 4 : 2);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner); ctx.lineTo(outerX, outerY); ctx.stroke();
    }
    const minute = 44, hour = 21;
    let angle = minute * Math.PI / 30 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * (radius - 4), cy + Math.sin(angle) * (radius - 4)); ctx.stroke();
    angle = ((hour % 12) + minute / 60) * Math.PI / 6 - Math.PI / 2;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * (radius * .52), cy + Math.sin(angle) * (radius * .52)); ctx.stroke();
    ctx.fillRect(cx - 1, cy - 1, 2, 2); ctx.restore();
  }

  drawImage(ctx, element, options = {}) {
    if (!element.imageData) return;
    const cached = this.imageCache.get(element.imageData);
    if (!(cached instanceof HTMLImageElement)) {
      this.loadImage(element.imageData).then(() => this.render()).catch(() => {});
      return;
    }
    const image = cached;
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(element.w)); off.height = Math.max(1, Math.round(element.h));
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    offCtx.fillStyle = '#fff'; offCtx.fillRect(0, 0, off.width, off.height);
    const scale = element.imageScale || Math.min(off.width / image.naturalWidth, off.height / image.naturalHeight);
    const drawW = image.naturalWidth * scale, drawH = image.naturalHeight * scale;
    const dx = (off.width - drawW) / 2 + (element.imageOffsetX || 0);
    const dy = (off.height - drawH) / 2 + (element.imageOffsetY || 0);
    offCtx.drawImage(image, dx, dy, drawW, drawH);
    const processed = this.processImage(offCtx.getImageData(0, 0, off.width, off.height), element, options.bw !== false);
    offCtx.putImageData(processed, 0, 0);
    ctx.drawImage(off, element.x, element.y, element.w, element.h);
  }

  processImage(imageData, element, forceBw = true) {
    const data = imageData.data;
    const contrast = Number(element.contrast || 1);
    const threshold = Number(element.threshold || 150);
    const invert = Boolean(element.invert);
    const width = imageData.width;
    const values = new Float32Array(width * imageData.height);
    for (let i = 0; i < values.length; i++) {
      const offset = i * 4;
      let gray = .299 * data[offset] + .587 * data[offset + 1] + .114 * data[offset + 2];
      gray = (gray - 128) * contrast + 128;
      if (invert) gray = 255 - gray;
      values[i] = clamp(gray, 0, 255);
    }
    if (forceBw) {
      if (element.dither === 'floyd') {
        for (let y = 0; y < imageData.height; y++) for (let x = 0; x < width; x++) {
          const index = y * width + x;
          const old = values[index]; const next = old < threshold ? 0 : 255; const error = old - next; values[index] = next;
          if (x + 1 < width) values[index + 1] += error * 7 / 16;
          if (y + 1 < imageData.height) {
            if (x > 0) values[index + width - 1] += error * 3 / 16;
            values[index + width] += error * 5 / 16;
            if (x + 1 < width) values[index + width + 1] += error / 16;
          }
        }
      } else if (element.dither === 'ordered') {
        const matrix = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
        for (let y = 0; y < imageData.height; y++) for (let x = 0; x < width; x++) {
          const index = y * width + x;
          const local = threshold + (matrix[y % 4][x % 4] - 7.5) * 8;
          values[index] = values[index] < local ? 0 : 255;
        }
      } else {
        for (let i = 0; i < values.length; i++) values[i] = values[i] < threshold ? 0 : 255;
      }
    }
    for (let i = 0; i < values.length; i++) {
      const offset = i * 4; const value = clamp(Math.round(values[i]), 0, 255);
      data[offset] = data[offset + 1] = data[offset + 2] = value; data[offset + 3] = 255;
    }
    return imageData;
  }

  async renderToCanvas({ includeDynamic = true, includeSelection = false, oneBit = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = this.project.width; canvas.height = this.project.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const element of this.project.elements) {
      if (!element.visible) continue;
      if (!includeDynamic && DYNAMIC_TYPES.has(element.type)) continue;
      if (element.type === 'image') {
        if (!element.imageData) continue;
        const image = await this.loadImage(element.imageData);
        const off = document.createElement('canvas'); off.width = Math.max(1, Math.round(element.w)); off.height = Math.max(1, Math.round(element.h));
        const offCtx = off.getContext('2d', { willReadFrequently: true });
        offCtx.fillStyle = '#fff'; offCtx.fillRect(0,0,off.width,off.height);
        const scale = element.imageScale || Math.min(off.width / image.naturalWidth, off.height / image.naturalHeight);
        const drawW = image.naturalWidth * scale, drawH = image.naturalHeight * scale;
        offCtx.drawImage(image, (off.width-drawW)/2+(element.imageOffsetX||0), (off.height-drawH)/2+(element.imageOffsetY||0), drawW, drawH);
        const processed = this.processImage(offCtx.getImageData(0,0,off.width,off.height), element, oneBit);
        offCtx.putImageData(processed,0,0); ctx.drawImage(off,element.x,element.y,element.w,element.h);
      } else this.drawElement(ctx, element, { bw: oneBit });
    }
    if (oneBit) {
      const image = ctx.getImageData(0,0,canvas.width,canvas.height);
      const data = image.data;
      for (let i=0;i<data.length;i+=4) {
        const gray = .299*data[i]+.587*data[i+1]+.114*data[i+2]; const value = gray < 160 ? 0 : 255;
        data[i]=data[i+1]=data[i+2]=value; data[i+3]=255;
      }
      ctx.putImageData(image,0,0);
    }
    if (includeSelection && this.selected) this.drawSelection(ctx,this.selected);
    return canvas;
  }

  async compile() {
    const backgroundCanvas = await this.renderToCanvas({ includeDynamic:false, oneBit:true });
    const image = backgroundCanvas.getContext('2d').getImageData(0,0,backgroundCanvas.width,backgroundCanvas.height);
    const rowBytes = Math.ceil(backgroundCanvas.width / 8);
    const bitplane = new Uint8Array(rowBytes * backgroundCanvas.height);
    for (let y=0;y<backgroundCanvas.height;y++) for (let x=0;x<backgroundCanvas.width;x++) {
      const value = image.data[(y*backgroundCanvas.width+x)*4];
      if (value < 128) bitplane[y*rowBytes+(x>>3)] |= 0x80 >> (x & 7);
    }

    const sourceDynamic = this.project.elements
      .filter(item => item.visible && DYNAMIC_TYPES.has(item.type))
      .slice(0, 12);
    const dynamic = sourceDynamic.map(item => ({
      type:item.type,x:Math.round(item.x),y:Math.round(item.y),w:Math.round(item.w),h:Math.round(item.h),
      font:FONT_IDS[item.font] ?? 0,fontSize:Math.round(item.fontSize),weight:item.weight||400,align:item.align||'left',
      format:item.format||'',showSeconds:Boolean(item.showSeconds),lineWidth:item.lineWidth||1
    }));

    const descriptorSize = 12;
    const headerSize = 20;
    const descriptors = new Uint8Array(sourceDynamic.length * descriptorSize);
    sourceDynamic.forEach((item, index) => {
      const offset = index * descriptorSize;
      descriptors[offset] = DEVICE_DYNAMIC_TYPE[item.type] || 0;
      descriptors[offset + 1] = deviceFontId(item);
      descriptors[offset + 2] = deviceAlign(item.align);
      let flags = item.showSeconds ? 1 : 0;
      if (item.type === 'weekday' && String(item.format || '').length > 3) flags |= 2;
      descriptors[offset + 3] = flags;
      descriptors[offset + 4] = clamp(Math.round(item.x), 0, 255);
      descriptors[offset + 5] = clamp(Math.round(item.y), 0, 255);
      descriptors[offset + 6] = clamp(Math.round(item.w), 1, 255);
      descriptors[offset + 7] = clamp(Math.round(item.h), 1, 255);
      descriptors[offset + 8] = clamp(Math.round(item.fontSize || 12), 5, 255);
      descriptors[offset + 9] = clamp(Math.round((Number(item.weight || 400)) / 100), 1, 9);
      descriptors[offset + 10] = 0;
      descriptors[offset + 11] = 0;
    });

    const payloadBytes = new Uint8Array(bitplane.length + descriptors.length);
    payloadBytes.set(bitplane, 0);
    payloadBytes.set(descriptors, bitplane.length);
    const totalSize = headerSize + payloadBytes.length;
    if (totalSize > 4096) throw new Error('Giao diện vượt vùng Flash 4 KB');

    const packageBytes = new Uint8Array(totalSize);
    const view = new DataView(packageBytes.buffer);
    view.setUint32(0, 0x31464e54, true); // TNF1
    packageBytes[4] = 1;
    packageBytes[5] = backgroundCanvas.width;
    packageBytes[6] = backgroundCanvas.height;
    packageBytes[7] = rowBytes;
    view.setUint16(8, bitplane.length, true);
    packageBytes[10] = sourceDynamic.length;
    packageBytes[11] = 0;
    view.setUint16(12, totalSize, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc32Bytes(payloadBytes), true);
    packageBytes.set(payloadBytes, headerSize);

    const payload = {
      format:'TNVA_FACE',version:4,title:this.project.title,author:this.project.author,
      screen:{width:this.project.width,height:this.project.height,rowBytes},
      background:{encoding:'1bpp-msb',data:bytesToBase64(bitplane)},dynamic,
      devicePackage:bytesToBase64(packageBytes),
      createdAt:this.project.createdAt,updatedAt:new Date().toISOString()
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    return { payload, bytes, packageBytes, bitplane, dynamic, preview: (await this.renderToCanvas({includeDynamic:true,oneBit:true})).toDataURL('image/png') };
  }

  async downloadFace() {
    const compiled = await this.compile();
    const name = `${slugify(this.project.title)}.tnvaface`;
    download(name, new Blob([compiled.bytes], { type:'application/json' }));
    return compiled;
  }

  downloadProject() {
    const name = `${slugify(this.project.title)}.tnvaproject`;
    download(name, new Blob([JSON.stringify(this.project,null,2)], { type:'application/json' }));
  }

  importLegacyEink(data, fileName = 'giao-dien.eink') {
    const width = Number(data.screen_width || 212);
    const height = Number(data.screen_height || 104);
    const project = defaultProject(width, height);
    project.title = String(fileName).replace(/\.[^.]+$/, '') || 'Giao diện E-ink';
    project.author = '';

    const addDynamic = (type, object, index = 0, total = 1) => {
      const size = legacyFontSize(object);
      const available = Math.max(24, width - Number(object.x || 0));
      const segment = Math.max(24, Math.floor(available / total));
      const element = defaultsFor(type, width, height);
      element.x = clamp(Number(object.x || 0) + index * segment, -20, width - 1);
      element.y = clamp(Number(object.y || 0), -20, height - 1);
      element.w = Math.min(segment, width - Math.max(0, element.x));
      element.h = Math.min(size + 8, height - Math.max(0, element.y));
      element.font = legacyFont(object.font);
      element.fontSize = size;
      element.weight = object.bold ? 800 : 700;
      element.align = 'left';
      if (type === 'time') element.showSeconds = false;
      project.elements.push(element);
    };

    for (const object of data.objects || []) {
      const type = String(object.type || '').toLowerCase();
      if (type === 'image' && Array.isArray(object.dataImg) && object.dataImg.length) {
        const element = defaultsFor('image', width, height);
        element.x = Number(object.x || 0); element.y = Number(object.y || 0);
        element.w = Math.max(1, Number(object.width || 1)); element.h = Math.max(1, Number(object.height || 1));
        element.imageData = legacyBitmapDataUrl(object);
        element.sourceW = element.w; element.sourceH = element.h;
        element.imageScale = 1; element.threshold = 128; element.contrast = 1; element.dither = 'none';
        project.elements.push(element);
        continue;
      }
      if (type === 'clock') {
        const element = defaultsFor('time', width, height);
        const size = legacyFontSize(object);
        element.x = Number(object.x || 0); element.y = Number(object.y || 0);
        element.w = Math.min(width - Math.max(0, element.x), Math.round(size * 3.2));
        element.h = Math.min(height - Math.max(0, element.y), size + 10);
        element.font = legacyFont(object.font); element.fontSize = size; element.align = 'left';
        project.elements.push(element);
        continue;
      }
      if (type === 'text' || type === 'super_text') {
        const content = String(object.txt || '');
        const tokenTypes = [];
        if (/@h|@m/.test(content)) tokenTypes.push('time');
        if (/@T/.test(content)) tokenTypes.push('weekday');
        if (/@d|@M|@y|@D/.test(content)) tokenTypes.push('date');
        if (/@A|@L/.test(content)) tokenTypes.push('lunar');
        if (/@V/.test(content)) tokenTypes.push('voltage');
        if (tokenTypes.length) {
          [...new Set(tokenTypes)].forEach((dynamicType, index, list) => addDynamic(dynamicType, object, index, list.length));
          const staticText = content.replace(/@[hmdMyTDALV]/g, '').replace(/[|/,:()\-]+/g, ' ').replace(/\s+/g, ' ').trim();
          if (staticText.length > 1) {
            const element = defaultsFor('text', width, height);
            const size = legacyFontSize(object);
            element.x = Number(object.x || 0); element.y = Number(object.y || 0) + size + 1;
            element.w = Math.min(width - Math.max(0, element.x), legacyTextWidth(staticText, size));
            element.h = size + 6; element.font = legacyFont(object.font); element.fontSize = size;
            element.weight = object.bold ? 800 : 600; element.text = staticText;
            project.elements.push(element);
          }
        } else {
          const element = defaultsFor('text', width, height);
          const size = legacyFontSize(object);
          element.x = Number(object.x || 0); element.y = Number(object.y || 0);
          element.w = Math.min(width - Math.max(0, element.x), legacyTextWidth(content, size));
          element.h = size + 7; element.font = legacyFont(object.font); element.fontSize = size;
          element.weight = object.bold ? 800 : 600; element.text = content;
          project.elements.push(element);
        }
        continue;
      }
      if (type === 'shape') {
        const kind = Number(object.hinh || 0);
        const size = Math.max(1, Number(object.size || 10));
        const thickness = clamp(Number(object.thingnet || 1), 1, 8);
        if (kind === 2 || kind === 3) {
          const element = defaultsFor('line', width, height);
          element.x = Number(object.x || 0); element.y = Number(object.y || 0);
          element.w = kind === 2 ? size : 1; element.h = kind === 3 ? size : 1;
          element.lineWidth = thickness; project.elements.push(element);
        } else {
          const element = defaultsFor('rect', width, height);
          element.x = Number(object.x || 0); element.y = Number(object.y || 0);
          element.w = size; element.h = kind === 0 ? size : Math.max(2, thickness);
          element.lineWidth = thickness; project.elements.push(element);
        }
        continue;
      }
      if (type === 'calendar') {
        const element = defaultsFor('text', width, height);
        element.x = Number(object.x || 0); element.y = Number(object.y || 0);
        element.w = Math.min(80, width - Math.max(0, element.x)); element.h = 16;
        element.text = 'LỊCH THÁNG'; element.font = 'pixel'; element.fontSize = 10;
        project.elements.push(element);
      }
    }
    this.loadProject(project);
  }

  async importFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data.objects) && data.screen_width && data.screen_height) {
      this.importLegacyEink(data, file.name);
      return;
    }
    if (data.format === 'TNVA_PROJECT' || Array.isArray(data.elements)) {
      this.loadProject(data);
      return;
    }
    if (data.format === 'TNVA_FACE') {
      const project = defaultProject(data.screen.width, data.screen.height);
      project.title = data.title || file.name.replace(/\.[^.]+$/, '');
      project.author = data.author || '';
      const bytes = Uint8Array.from(atob(data.background.data), char => char.charCodeAt(0));
      const canvas = document.createElement('canvas'); canvas.width = data.screen.width; canvas.height = data.screen.height;
      const ctx = canvas.getContext('2d'); const image = ctx.createImageData(canvas.width,canvas.height);
      for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) {
        const black = bytes[y*data.screen.rowBytes+(x>>3)] & (0x80>>(x&7)); const value=black?0:255; const i=(y*canvas.width+x)*4;
        image.data[i]=image.data[i+1]=image.data[i+2]=value; image.data[i+3]=255;
      }
      ctx.putImageData(image,0,0);
      project.elements.push({ ...defaultsFor('image',project.width,project.height), x:0,y:0,w:project.width,h:project.height,imageData:canvas.toDataURL('image/png'),imageScale:1,name:'Nền đã biên dịch' });
      for (const descriptor of data.dynamic || []) project.elements.push({ ...defaultsFor(descriptor.type,project.width,project.height), ...descriptor, id:uid(), name:TYPE_LABELS[descriptor.type] || descriptor.type, font:Object.keys(FONT_IDS).find(key=>FONT_IDS[key]===descriptor.font)||'pixel' });
      this.loadProject(project);
      return;
    }
    throw new Error('File không hợp lệ');
  }

  async previewDataUrl() { return (await this.renderToCanvas({ includeDynamic:true, oneBit:true })).toDataURL('image/png'); }
}

export { TYPE_LABELS, FONT_STACKS, FONT_IDS, DYNAMIC_TYPES, download, dataUrlToBytes };
