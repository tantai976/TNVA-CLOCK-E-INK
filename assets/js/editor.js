import { DEVICE } from './config.js';

const DYNAMIC_TYPES = new Set(['time', 'date', 'weekday', 'lunar', 'voltage', 'battery', 'analog', 'template', 'calendar']);
const TYPE_LABELS = {
  text: 'Chữ', time: 'Giờ', date: 'Ngày', weekday: 'Thứ', lunar: 'Âm lịch',
  voltage: 'Điện áp', battery: 'Pin', analog: 'Đồng hồ kim', template: 'Mẫu động', calendar: 'Lịch tháng',
  image: 'Ảnh', line: 'Đường', rect: 'Khung', shape: 'Hình học', legacyShape: 'Hình gốc'
};
const FONT_STACKS = {
  pixel: 'ui-monospace, "Courier New", monospace',
  robotoCondensed: '"Roboto Condensed", "Arial Narrow", sans-serif',
  inter: '"Inter", Arial, sans-serif',
  notoMono: '"Noto Sans Mono", "Courier New", monospace',
  dseg: '"Noto Sans Mono", "Courier New", monospace'
};
/* IDs are shared with the DA14585 TNF1 descriptor renderer. */
const FONT_IDS = { pixel: 0, robotoCondensed: 1, inter: 1, notoMono: 1, dseg: 4 };
const HANDLE_SIZE = 4;
const STYLE = { text:0, clockOutline:1, clockSolid:2, clockSegment:3, clockText:4, textLarge:5 };
const FLAG_INVERSE = 0x01;
const FLAG_BOLD = 0x02;
const FLAG_ROTATE_CCW = 0x08;

function ensureGoogleFont(name) {
  const family=String(name||'').trim();
  if (!family || !/^[A-Za-z0-9 _-]{2,60}$/.test(family) || typeof document==='undefined') return;
  const id=`tnva-font-${family.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
  if (document.getElementById(id)) return;
  const link=document.createElement('link'); link.id=id; link.rel='stylesheet';
  link.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g,'+')}:wght@400;600;700;800&display=swap`;
  document.head.appendChild(link);
}

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

const DEVICE_DYNAMIC_TYPE = { time:1, date:2, weekday:3, lunar:4, voltage:5, battery:6, analog:7, template:8, calendar:9 };
function deviceFontId(item) {
  /* Static labels are rasterized with their exact web font. Dynamic text must
   * use a font embedded in the DA14585 image. Inter/Noto legacy selections
   * therefore fall back to Roboto Condensed instead of producing a mismatch. */
  if (item.font === 'dseg') return 4;
  if (item.font === 'pixel') return 0;
  return 1;
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
    font: 'robotoCondensed', fontSize: 12, weight: 700, align: 'left',
    color: '#000000', text: '', lineWidth: 1,
    threshold: 150, contrast: 1.15, invert: false, dither: 'ordered',
    imageScale: 1, imageOffsetX: 0, imageOffsetY: 0, imageData: '',
    format: '', showSeconds: false, template: '', templateStyle: STYLE.text, inverse: false, calendarType: 0, legacy: null,
    locked: false, shapeKind: 'roundRect', radius: 6, fill: false
  };
  switch (type) {
    case 'text': return { ...base, text: 'Nội dung', w: 110, h: 22, font: 'inter', fontSize: 15 };
    case 'time': return { ...base, x: 44, y: 30, w: 110, h: 34, font: 'robotoCondensed', fontSize: 30, align: 'center', format: 'HH:mm' };
    case 'template': return { ...base, x: 10, y: 10, w: 120, h: 18, font: 'robotoCondensed', fontSize: 13, template: '@h:@m', templateStyle: STYLE.text };
    case 'calendar': return { ...base, x: 8, y: 12, w: 132, h: 74, calendarType: 0, fontSize: 8 };
    case 'date': return { ...base, x: 10, y: 8, w: 100, h: 16, format: 'dd/MM/yyyy' };
    case 'weekday': return { ...base, x: 10, y: 78, w: 70, h: 16, format: 'Thứ bảy' };
    case 'lunar': return { ...base, x: 90, y: 78, w: 90, h: 16, format: 'ÂL 10/06' };
    case 'voltage': return { ...base, x: width - 48, y: height - 16, w: 45, h: 14, format: '3.8V', align: 'right' };
    case 'battery': return { ...base, x: width - 28, y: 5, w: 24, h: 12 };
    case 'analog': return { ...base, x: width - 62, y: 17, w: 54, h: 54 };
    case 'image': return { ...base, x: 20, y: 15, w: Math.min(120, width - 40), h: Math.min(70, height - 30), name: 'Ảnh' };
    case 'line': return { ...base, x: 15, y: 50, w: 100, h: 1, lineWidth: 1 };
    case 'rect': return { ...base, x: 15, y: 15, w: 80, h: 45, lineWidth: 1 };
    case 'shape': return { ...base, x: 18, y: 14, w: 72, h: 42, lineWidth: 1, shapeKind: 'roundRect', radius: 6, fill: false };
    case 'legacyShape': return { ...base, x: 10, y: 10, w: 80, h: 20, lineWidth: 1, legacy: { hinh:2, custom:0, size:80, thingnet:1 } };
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
    case 'template': return expandTemplateSample(element.template || '');
    default: return '';
  }
}

function expandTemplateSample(template = '') {
  const values = {
    '@hh':'11','@mm':'33','@h':'11','@m':'33','@d':'19','@M':'06','@y':'2026',
    '@T':'Thứ 6','@W':'Thứ sáu','@t':'6','@A':'05','@L':'05','@V':'3.30V',
    '@D':'30.0C','@q':'170','@Q':'25','@c':'365','@C':'365','@u':'--'
  };
  let value = String(template || '');
  Object.keys(values).sort((a,b) => b.length-a.length).forEach(token => { value = value.split(token).join(values[token]); });
  return value;
}
function legacyClockProfile(object) {
  const vendor = Number(object.font ?? 3);
  const raw = clamp(Number(object.size || 50), 10, 120);
  if (vendor === 2) return { font:'robotoCondensed', style:STYLE.clockOutline, fontSize:clamp(Math.round(raw*.82),32,62) };
  if (vendor === 0) return { font:'robotoCondensed', style:STYLE.clockSolid, fontSize:clamp(Math.round(raw*.92),30,62) };
  if (vendor === 4) return { font:'dseg', style:STYLE.clockSegment, fontSize:clamp(Math.round(raw*.9),28,65) };
  if (vendor === 3) return { font:'robotoCondensed', style:STYLE.clockText, fontSize:clamp(Math.round(raw*.44),18,46) };
  return { font:'robotoCondensed', style:STYLE.clockText, fontSize:clamp(Math.round(raw*.3),11,30) };
}

function legacyFont(font) {
  if (typeof font === 'string') {
    const name = font.toLowerCase();
    if (name.includes('dseg') || name.includes('digital')) return 'dseg';
    if (name.includes('mono')) return 'notoMono';
    if (name.includes('condensed') || name.includes('oswald')) return 'robotoCondensed';
    if (name.includes('pixel')) return 'pixel';
    return 'inter';
  }
  return ({0:'pixel',1:'robotoCondensed',2:'inter',3:'notoMono',4:'dseg'})[Number(font)] || 'robotoCondensed';
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

  nudge(dx, dy, amount = 1) {
    const element = this.selected;
    if (!element || element.locked) return;
    this.updateSelected({ x: element.x + dx * amount, y: element.y + dy * amount });
  }

  alignSelected(mode) {
    const element = this.selected;
    if (!element || element.locked) return;
    const patch = {};
    if (mode === 'left') patch.x = 0;
    if (mode === 'hcenter') patch.x = Math.round((this.project.width - element.w) / 2);
    if (mode === 'right') patch.x = this.project.width - element.w;
    if (mode === 'top') patch.y = 0;
    if (mode === 'vcenter') patch.y = Math.round((this.project.height - element.h) / 2);
    if (mode === 'bottom') patch.y = this.project.height - element.h;
    this.updateSelected(patch);
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
    const handle = selected && !selected.locked ? this.hitHandle(point.x, point.y, selected) : null;
    const element = handle ? selected : this.hitElement(point.x, point.y);
    if (!element) {
      this.select(null);
      return;
    }
    this.select(element.id);
    if (element.locked) { event.preventDefault(); return; }
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
    if (!element.locked) for (const point of Object.values(this.handlePoints(element))) {
      ctx.fillRect(point[0] - 1.4, point[1] - 1.4, 2.8, 2.8);
      ctx.strokeRect(point[0] - 1.4, point[1] - 1.4, 2.8, 2.8);
    }
    if (element.locked) { ctx.fillStyle='#2b7cff'; ctx.font='700 5px sans-serif'; ctx.fillText('LOCK', element.x+1, Math.max(5,element.y+5)); }
    ctx.restore();
  }

  drawElement(ctx, element, options = {}) {
    switch (element.type) {
      case 'text': return this.drawText(ctx, element, element.text || '');
      case 'time': case 'date': case 'weekday': case 'lunar': case 'voltage': case 'template':
        return this.drawText(ctx, element, dynamicSample(element));
      case 'calendar': return this.drawCalendar(ctx, element);
      case 'battery': return this.drawBattery(ctx, element);
      case 'analog': return this.drawAnalog(ctx, element);
      case 'line': return this.drawLine(ctx, element);
      case 'rect': return this.drawRect(ctx, element);
      case 'shape': return this.drawShape(ctx, element);
      case 'legacyShape': return this.drawLegacyShape(ctx, element);
      case 'image': return this.drawImage(ctx, element, options);
    }
  }

  drawSegmentText(ctx, element, text, outline = false) {
    const value = String(text);
    const h = Math.max(7, Number(element.fontSize || 12));
    const digitW = Math.max(5, Math.round(h * .56));
    const thick = Math.max(1, Math.round(h * .11));
    const gap = Math.max(1, Math.round(h * .08));
    const colonW = Math.max(3, Math.round(digitW * .38));
    const masks = [0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f];
    const widths = [...value].map(ch => ch === ':' ? colonW : digitW);
    const total = widths.reduce((a,b) => a+b,0) + Math.max(0, value.length-1)*gap;
    let x = element.x;
    if (element.align === 'center') x = element.x + (element.w-total)/2;
    else if (element.align === 'right') x = element.x + element.w-total;
    const y = element.y + (element.h-h)/2;
    const half = Math.floor(h/2);
    const bar = (x1,y1,x2,y2) => {
      const bx=Math.round(x1), by=Math.round(y1), bw=Math.max(1,Math.round(x2-x1)), bh=Math.max(1,Math.round(y2-y1));
      if (outline) { ctx.lineWidth=1; ctx.strokeRect(bx+.5,by+.5,Math.max(1,bw-1),Math.max(1,bh-1)); }
      else ctx.fillRect(bx,by,bw,bh);
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(element.x, element.y, element.w, element.h); ctx.clip();
    if (element.inverse) { ctx.fillStyle='#000'; ctx.fillRect(element.x,element.y,element.w,element.h); }
    ctx.fillStyle = element.inverse ? '#fff' : '#000';
    ctx.strokeStyle = element.inverse ? '#fff' : '#000';
    for (const ch of value) {
      if (ch === ':') {
        const d = Math.max(1, thick);
        bar(x+(colonW-d)/2, y+h*.31, x+(colonW+d)/2, y+h*.31+d);
        bar(x+(colonW-d)/2, y+h*.68, x+(colonW+d)/2, y+h*.68+d);
        x += colonW+gap;
        continue;
      }
      if (!/[0-9]/.test(ch)) { x += digitW+gap; continue; }
      const m = masks[Number(ch)];
      if (m&0x01) bar(x+thick,y,x+digitW-thick,y+thick);
      if (m&0x02) bar(x+digitW-thick,y+thick,x+digitW,y+half-thick/2);
      if (m&0x04) bar(x+digitW-thick,y+half+thick/2,x+digitW,y+h-thick);
      if (m&0x08) bar(x+thick,y+h-thick,x+digitW-thick,y+h);
      if (m&0x10) bar(x,y+half+thick/2,x+thick,y+h-thick);
      if (m&0x20) bar(x,y+thick,x+thick,y+half-thick/2);
      if (m&0x40) bar(x+thick,y+half-thick/2,x+digitW-thick,y+half+thick/2);
      x += digitW+gap;
    }
    ctx.restore();
  }

  drawText(ctx, element, text) {
    const clockStyle = Number(element.templateStyle || 0);
    if ((element.font === 'dseg' || [STYLE.clockOutline,STYLE.clockSolid,STYLE.clockSegment].includes(clockStyle)) && /^[0-9:\n]+$/.test(String(text))) {
      this.drawSegmentText(ctx, element, text, clockStyle === STYLE.clockOutline);
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(element.x, element.y, element.w, element.h);
    ctx.clip();
    if (element.inverse) { ctx.fillStyle = '#000'; ctx.fillRect(element.x, element.y, element.w, element.h); }
    ctx.fillStyle = element.inverse ? '#fff' : '#000';
    const family = element.fontFamily ? `"${String(element.fontFamily).replace(/["\\]/g,'')}", sans-serif` : (FONT_STACKS[element.font] || FONT_STACKS.pixel);
    if (element.fontFamily) ensureGoogleFont(element.fontFamily);
    ctx.font = `${element.weight || 400} ${element.fontSize || 12}px ${family}`;
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

  drawCalendar(ctx, element) {
    const x=element.x, y=element.y, w=element.w, h=element.h;
    const headerH=Math.max(9,Math.round(h*.17));
    const cols=7, rows=5;
    const cellW=w/cols, cellH=(h-headerH)/rows;
    const labels=['CN','T2','T3','T4','T5','T6','T7'];
    const days=[29,30,31,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,1];
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
    ctx.fillStyle='#fff'; ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#000'; ctx.fillRect(x,y,w,headerH);
    ctx.font=`700 ${Math.max(5,Math.min(8,headerH-2))}px ${FONT_STACKS.pixel}`;
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff';
    labels.forEach((label,i)=>ctx.fillText(label,x+(i+.5)*cellW,y+headerH/2));
    ctx.fillStyle='#000'; ctx.font=`600 ${Math.max(5,Math.min(8,cellH-1))}px ${FONT_STACKS.pixel}`;
    days.forEach((day,i)=>{
      const col=i%cols,row=Math.floor(i/cols); const cx=x+(col+.5)*cellW,cy=y+headerH+(row+.5)*cellH;
      if(day===19){ctx.fillRect(x+col*cellW+1,y+headerH+row*cellH+1,Math.max(2,cellW-2),Math.max(2,cellH-2));ctx.fillStyle='#fff';ctx.fillText(String(day),cx,cy);ctx.fillStyle='#000';}
      else ctx.fillText(String(day),cx,cy);
    });
    ctx.restore();
  }

  drawShape(ctx, element) {
    const kind = element.shapeKind || 'roundRect';
    const lw = Math.max(1, Number(element.lineWidth || 1));
    const radius = Math.max(0, Math.min(Number(element.radius || 0), Math.min(element.w, element.h) / 2));
    const x = element.x + lw / 2, y = element.y + lw / 2;
    const w = Math.max(1, element.w - lw), h = Math.max(1, element.h - lw);
    ctx.save(); ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineWidth = lw;
    const rounded = () => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
    };
    if (kind === 'circle') { ctx.beginPath(); ctx.ellipse(element.x + element.w/2, element.y + element.h/2, Math.max(1,w/2), Math.max(1,h/2), 0, 0, Math.PI*2); element.fill ? ctx.fill() : ctx.stroke(); }
    else if (kind === 'line') { ctx.beginPath(); ctx.moveTo(element.x, element.y + element.h/2); ctx.lineTo(element.x + element.w, element.y + element.h/2); ctx.stroke(); }
    else if (kind === 'battery') {
      const cap = Math.max(2, Math.round(element.w*.08));
      ctx.strokeRect(x, y, Math.max(2,w-cap-1), h);
      ctx.fillRect(element.x+element.w-cap, element.y+element.h*.32, cap, element.h*.36);
      if (element.fill) ctx.fillRect(element.x+lw*2, element.y+lw*2, Math.max(1, element.w-cap-lw*5), Math.max(1,element.h-lw*4));
    } else if (kind === 'square') { element.fill ? ctx.fillRect(element.x,element.y,element.w,element.h) : ctx.strokeRect(x,y,w,h); }
    else { rounded(); element.fill || kind === 'roundRectFill' ? ctx.fill() : ctx.stroke(); }
    ctx.restore();
  }

  drawLegacyShape(ctx, element) {
    const legacy=element.legacy||{};
    const kind=Number(legacy.hinh ?? 2);
    const thickness=Math.max(1,Number(legacy.thingnet || element.lineWidth || 1));
    ctx.save(); ctx.strokeStyle='#000'; ctx.fillStyle='#000'; ctx.lineWidth=thickness;
    if(kind===2){ctx.beginPath();ctx.moveTo(element.x,element.y);ctx.lineTo(element.x+element.w,element.y);ctx.stroke();}
    else if(kind===3){ctx.beginPath();ctx.moveTo(element.x,element.y);ctx.lineTo(element.x,element.y+element.h);ctx.stroke();}
    else if(kind===1){
      const radius=Math.max(1,Math.min(Number(legacy.custom||4),Math.min(element.w,element.h)/2));
      if(ctx.roundRect){ctx.beginPath();ctx.roundRect(element.x+.5,element.y+.5,Math.max(1,element.w-1),Math.max(1,element.h-1),radius);ctx.stroke();}
      else ctx.strokeRect(element.x+.5,element.y+.5,Math.max(1,element.w-1),Math.max(1,element.h-1));
    } else ctx.strokeRect(element.x+.5,element.y+.5,Math.max(1,element.w-1),Math.max(1,element.h-1));
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
    const logicalCanvas = await this.renderToCanvas({ includeDynamic:false, oneBit:true });
    const portrait = logicalCanvas.width === 104 && logicalCanvas.height === 212;
    if (!portrait && (logicalCanvas.width !== 212 || logicalCanvas.height !== 104)) throw new Error('Chỉ hỗ trợ màn 212 × 104 hoặc 104 × 212');

    let backgroundCanvas = logicalCanvas;
    if (portrait) {
      backgroundCanvas = document.createElement('canvas');
      backgroundCanvas.width = 212; backgroundCanvas.height = 104;
      const rotate = backgroundCanvas.getContext('2d');
      rotate.fillStyle = '#fff'; rotate.fillRect(0,0,212,104);
      rotate.translate(0,104); rotate.rotate(-Math.PI/2);
      rotate.drawImage(logicalCanvas,0,0);
    }

    const image = backgroundCanvas.getContext('2d').getImageData(0,0,backgroundCanvas.width,backgroundCanvas.height);
    const rowBytes = Math.ceil(backgroundCanvas.width / 8);
    const bitplane = new Uint8Array(rowBytes * backgroundCanvas.height);
    for (let y=0;y<backgroundCanvas.height;y++) for (let x=0;x<backgroundCanvas.width;x++) {
      const value = image.data[(y*backgroundCanvas.width+x)*4];
      if (value < 128) bitplane[y*rowBytes+(x>>3)] |= 0x80 >> (x & 7);
    }

    const sourceDynamic = this.project.elements.filter(item => item.visible && DYNAMIC_TYPES.has(item.type)).slice(0,24);
    const descriptorSize = 16;
    const descriptors = new Uint8Array(sourceDynamic.length * descriptorSize);
    const strings = [];
    let stringLength = 0;
    const dynamic = [];

    const addString = text => {
      const raw = new TextEncoder().encode(String(text || '')).slice(0,95);
      if (stringLength + raw.length > 720) throw new Error('Phần mẫu động vượt giới hạn 720 byte');
      const offset = stringLength;
      strings.push(raw); stringLength += raw.length;
      return { raw, offset };
    };

    sourceDynamic.forEach((item,index) => {
      const offset=index*descriptorSize;
      let type=DEVICE_DYNAMIC_TYPE[item.type] || 0;
      let style=Number(item.templateStyle || STYLE.text);
      let templateInfo=null;
      if (item.type === 'template') templateInfo=addString(item.template || '');
      descriptors[offset]=type;
      descriptors[offset+1]=deviceFontId(item);
      descriptors[offset+2]=deviceAlign(item.align);
      let flags=0;
      if (item.inverse) flags|=FLAG_INVERSE;
      if (Number(item.weight||400)>=700) flags|=FLAG_BOLD;
      if (portrait) flags|=FLAG_ROTATE_CCW;
      if (item.type==='time' && item.showSeconds) flags|=1;
      if (item.type==='weekday' && String(item.format||'').length>3) flags|=2;
      descriptors[offset+3]=flags;
      descriptors[offset+4]=clamp(Math.round(item.x),0,255);
      descriptors[offset+5]=clamp(Math.round(item.y),0,255);
      descriptors[offset+6]=clamp(Math.round(item.w),1,255);
      descriptors[offset+7]=clamp(Math.round(item.h),1,255);
      descriptors[offset+8]=clamp(Math.round(item.fontSize||12),5,255);
      descriptors[offset+9]=clamp(Math.round(Number(item.weight||400)/100),1,9);
      if (templateInfo) {
        descriptors[offset+10]=templateInfo.offset&0xff;
        descriptors[offset+11]=(templateInfo.offset>>8)&0xff;
        descriptors[offset+12]=templateInfo.raw.length;
      }
      if (item.type==='calendar') style=clamp(Number(item.calendarType||0),0,255);
      descriptors[offset+13]=clamp(style,0,255);
      descriptors[offset+14]=clamp(Number(item.vendorFont||0),0,255);
      descriptors[offset+15]=0;
      dynamic.push({type:item.type,x:item.x,y:item.y,w:item.w,h:item.h,font:deviceFontId(item),fontSize:item.fontSize,align:item.align,flags,style,template:item.template||'',calendarType:item.calendarType||0});
    });

    const stringTable = new Uint8Array(stringLength);
    let stringOffset=0;
    for (const raw of strings) { stringTable.set(raw,stringOffset); stringOffset+=raw.length; }
    const payloadBytes = new Uint8Array(bitplane.length + descriptors.length + stringTable.length);
    payloadBytes.set(bitplane,0);
    payloadBytes.set(descriptors,bitplane.length);
    payloadBytes.set(stringTable,bitplane.length+descriptors.length);
    const headerSize=24;
    const totalSize=headerSize+payloadBytes.length;
    if (totalSize>4096) throw new Error('Giao diện vượt vùng Flash 4 KB');

    const packageBytes=new Uint8Array(totalSize);
    const view=new DataView(packageBytes.buffer);
    view.setUint32(0,0x31464e54,true);
    packageBytes[4]=2;
    packageBytes[5]=212;
    packageBytes[6]=104;
    packageBytes[7]=27;
    view.setUint16(8,bitplane.length,true);
    packageBytes[10]=sourceDynamic.length;
    packageBytes[11]=descriptorSize;
    view.setUint16(12,stringTable.length,true);
    view.setUint16(14,totalSize,true);
    view.setUint16(16,0,true);
    view.setUint16(18,0,true);
    view.setUint32(20,crc32Bytes(payloadBytes),true);
    packageBytes.set(payloadBytes,headerSize);

    const payload={
      format:'TNVA_FACE',version:5,title:this.project.title,author:this.project.author,
      screen:{width:this.project.width,height:this.project.height,deviceWidth:212,deviceHeight:104,rowBytes},
      background:{encoding:'1bpp-msb',data:bytesToBase64(bitplane)},dynamic,
      devicePackage:bytesToBase64(packageBytes),
      createdAt:this.project.createdAt,updatedAt:new Date().toISOString()
    };
    const bytes=new TextEncoder().encode(JSON.stringify(payload));
    return {payload,bytes,packageBytes,bitplane,dynamic,preview:(await this.renderToCanvas({includeDynamic:true,oneBit:true})).toDataURL('image/png')};
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
    const portrait = Boolean(data.xoaydoc);
    const width = portrait ? 104 : Number(data.screen_width || 212);
    const height = portrait ? 212 : Number(data.screen_height || 104);
    const project = defaultProject(width, height);
    project.title = String(fileName).replace(/\.[^.]+$/, '') || 'Giao diện E-ink';
    project.author = '';
    project.legacyEink = true;
    project.orientation = portrait ? 'portrait' : 'landscape';
    project.sourceSchema = { screen_width:data.screen_width, screen_height:data.screen_height, xoaydoc:Boolean(data.xoaydoc) };

    const pushTemplate = (object, template, clock = false) => {
      const element = defaultsFor('template', width, height);
      const profile = clock ? legacyClockProfile(object) : null;
      const fontSize = profile?.fontSize || legacyFontSize(object);
      const sample = expandTemplateSample(template);
      element.x = Number(object.x || 0);
      element.y = Number(object.y || 0);
      element.font = profile?.font || legacyFont(object.font);
      element.fontFamily = typeof object.font === 'string' ? object.font : '';
      if (element.fontFamily) ensureGoogleFont(element.fontFamily);
      element.fontSize = fontSize;
      element.weight = object.bold ? 800 : 600;
      element.template = String(template || '');
      element.templateStyle = profile?.style ?? (fontSize >= 22 && /^[0-9:@hmdMyTWA-LVCQqu \-/]+$/.test(String(template)) ? STYLE.textLarge : STYLE.text);
      element.inverse = Boolean(object.swapColor) || Number(object.color) === 0;
      element.vendorFont = typeof object.font === 'number' ? Number(object.font) : 0;
      element.align = 'left';
      const factor = [STYLE.clockOutline,STYLE.clockSolid,STYLE.clockSegment].includes(element.templateStyle) ? 2.86 : .58 * Math.max(1,String(sample).length);
      element.w = clamp(Math.round([STYLE.clockOutline,STYLE.clockSolid,STYLE.clockSegment].includes(element.templateStyle) ? fontSize*factor : Math.max(16,String(sample).length*fontSize*.58)), 8, width-Math.max(0,element.x));
      element.h = clamp(Math.round(fontSize*1.12+4), 8, height-Math.max(0,element.y));
      element.name = clock ? 'Đồng hồ số' : 'Mẫu động';
      element.legacy = clone(object);
      project.elements.push(element);
    };

    const objects = [];
    for (const raw of data.objects || []) {
      const object = clone(raw);
      if (String(object.type||'').toLowerCase() !== 'clock') { objects.push(object); continue; }
      const duplicate = objects.slice(-6).find(item => String(item.type||'').toLowerCase()==='clock' && Number(item.font)===Number(object.font) && Number(item.size)===Number(object.size) && Math.abs(Number(item.x||0)-Number(object.x||0))<=4 && Math.abs(Number(item.y||0)-Number(object.y||0))<=4);
      if (duplicate) { duplicate.x=Math.min(Number(duplicate.x||0),Number(object.x||0)); duplicate.y=Math.min(Number(duplicate.y||0),Number(object.y||0)); duplicate.bold=true; }
      else objects.push(object);
    }

    for (const object of objects) {
      const type = String(object.type || '').toLowerCase();
      if (type === 'image' && Array.isArray(object.dataImg) && object.dataImg.length) {
        const element = defaultsFor('image', width, height);
        element.x = Number(object.x || 0); element.y = Number(object.y || 0);
        element.w = Math.max(1, Number(object.width || 1)); element.h = Math.max(1, Number(object.height || 1));
        element.imageData = legacyBitmapDataUrl(object);
        element.sourceW = element.w; element.sourceH = element.h;
        element.imageScale = 1; element.threshold = 128; element.contrast = 1; element.dither = 'none';
        element.legacy=clone(object);
        project.elements.push(element);
        continue;
      }
      if (type === 'clock') {
        pushTemplate(object, '@h:@m', true);
        continue;
      }
      if (type === 'text' || type === 'super_text') {
        const content = String(object.txt || '');
        if (content.includes('@')) {
          pushTemplate(object, content, false);
        } else {
          const element = defaultsFor('text', width, height);
          const size = legacyFontSize(object);
          element.x = Number(object.x || 0); element.y = Number(object.y || 0);
          element.w = clamp(legacyTextWidth(content, size), 8, width-Math.max(0,element.x));
          element.h = clamp(Math.round(size*1.15+4), 8, height-Math.max(0,element.y));
          element.font = legacyFont(object.font); element.fontSize = size;
          element.fontFamily = type === 'super_text' && typeof object.font === 'string' ? object.font : '';
          if (element.fontFamily) ensureGoogleFont(element.fontFamily);
          element.weight = object.bold ? 800 : 600; element.text = content;
          element.inverse = Boolean(object.swapColor) || Number(object.color) === 0;
          element.legacy=clone(object);
          project.elements.push(element);
        }
        continue;
      }
      if (type === 'shape') {
        const kind = Number(object.hinh || 0);
        const size = Math.max(1, Number(object.size || 10));
        const thickness = clamp(Number(object.thingnet || 1), 1, 8);
        const element = defaultsFor('legacyShape', width, height);
        element.x = Number(object.x || 0); element.y = Number(object.y || 0);
        if (kind === 2) { element.w=size; element.h=1; }
        else if (kind === 3) { element.w=1; element.h=size; }
        else if (kind === 1) { element.w=Math.max(10,width-element.x-2); element.h=Math.max(10,height-element.y-2); }
        else { element.w=size; element.h=Math.max(2,Number(object.custom||size)); }
        element.lineWidth=thickness; element.legacy=clone(object);
        project.elements.push(element);
        continue;
      }
      if (type === 'calendar') {
        const element = defaultsFor('calendar', width, height);
        const style = Number(object.calendarType || 0);
        const dimensions = ({0:[132,74],1:[142,92],2:[142,92],3:[145,100],4:[145,96],5:[204,60]})[style] || [132,74];
        element.x=Number(object.x||0); element.y=Number(object.y||0);
        element.w=Math.min(dimensions[0],width-Math.max(0,element.x));
        element.h=Math.min(dimensions[1],height-Math.max(0,element.y));
        element.calendarType=style; element.legacy=clone(object);
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
