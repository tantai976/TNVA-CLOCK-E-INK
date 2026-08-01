import { FaceEditor, TYPE_LABELS, download } from './editor.js';
import { TnvaBle, crc32 } from './ble.js';
import { saveProject, listProjects, deleteProject } from './storage.js';
import { listPublicFaces, publishFace, incrementDownload, publicStoreConfigured } from './community.js';
import { DEVICE } from './config.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const connectGate = $('#connectGate');
const appShell = $('#appShell');
const logWindow = $('#logWindow');
let logLines = 0;
let deviceTimer = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function log(message) {
  const time = new Date().toLocaleTimeString('vi-VN', { hour12:false });
  logWindow.textContent += `[${time}] ${message}\n`;
  logWindow.scrollTop = logWindow.scrollHeight;
  $('#logCount').textContent = String(++logLines);
  const live = $('#liveActivity');
  if (live) live.textContent = message;
}

let toastTimer;
function toast(message, type = '') {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast ${type}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 2600);
}

function showModal(html) {
  $('#modal').innerHTML = html;
  $('#modalBackdrop').classList.remove('hidden');
}
function closeModal() { $('#modalBackdrop').classList.add('hidden'); }
$('#modalBackdrop').addEventListener('pointerdown', event => { if (event.target === $('#modalBackdrop')) closeModal(); });

const ble = new TnvaBle(log);
ble.onDisconnect(() => setDeviceOffline());
let warehouseRows = [];
let warehouseVisible = 24;
const warehouseCache = new Map();
let activeWarehouseId = Number(localStorage.getItem('tnvaWarehouseFace') || 0);
let lastDeviceStatus = null;

const editor = new FaceEditor($('#designCanvas'), {
  onChange: project => {
    $('#designTitle').value = project.title || '';
    $('#designAuthor').value = project.author || '';
    $('#screenProfile').value = `${project.width}x${project.height}`;
    renderLayers();
    renderMobileLayers();
  },
  onSelection: (_id, element, options = {}) => {
    renderInspector(element);
    renderLayers();
    renderMobileLayers();
    const posPanel=$('#positionPanel'); if(posPanel) posPanel.classList.toggle('hidden', !element);
    const title=$('#inspectorTitle'); if(title) title.textContent=element ? (element.name || TYPE_LABELS[element.type] || element.type) : 'Chưa chọn đối tượng';
    $('#selectionInfo').textContent = element ? `${element.name} · ${Math.round(element.x)},${Math.round(element.y)} · ${Math.round(element.w)}×${Math.round(element.h)}` : 'Không chọn';
    if (options.editText && element?.type === 'text') requestAnimationFrame(() => $('#propText')?.focus());
  },
  onPackage: (bytes, max) => {
    const used = bytes / 1024;
    $('#packageInfo').textContent = max ? `${used.toFixed(1)} / ${(max/1024).toFixed(0)} KB` : `${used.toFixed(1)} KB`;
    $('#packageInfo').style.color = max && bytes > max ? 'var(--danger)' : '';
  }
});
if (document.fonts?.ready) {
  document.fonts.ready.then(() => editor.render());
}


function openStudioOffline() {
  connectGate.classList.add('hidden');
  appShell.classList.remove('hidden');
  setDeviceOffline();
  editor.setZoom(window.innerWidth < 700 ? Math.max(1.45, Math.min(1.75, (window.innerWidth - 34) / editor.project.width)) : 4); updateZoom();
  renderLocalLibrary();
}

function setDeviceOffline() {
  clearInterval(deviceTimer);
  deviceTimer = null;
  $('#deviceLabel').textContent = 'Ngoại tuyến';
  $('#deviceName').textContent = 'Chưa kết nối';
  $('#deviceVoltage').textContent = '--';
  $('#deviceTemperature').textContent = '--.-°C';
  $('#deviceTime').textContent = '--';
  $('#deviceState').textContent = 'Ngoại tuyến';
  document.querySelector('.device-pill')?.classList.remove('connected');
  $('#connectDeviceBtn').disabled = false;
  $('#connectDeviceBtn').textContent = 'Kết nối';
  $('#disconnectBtn').disabled = true;
  $$('.apply-face').forEach(button => { button.disabled = true; });
  updateWarehouseInstallState();
}

async function unlockApp(status) {
  if (!status.name?.startsWith(DEVICE.namePrefix)) throw new Error('Sai thiết bị');
  connectGate.classList.add('hidden');
  appShell.classList.remove('hidden');
  $('#deviceLabel').textContent = 'Đã kết nối';
  $('#deviceName').textContent = status.name;
  document.querySelector('.device-pill')?.classList.add('connected');
  $('#connectDeviceBtn').disabled = true;
  $('#connectDeviceBtn').textContent = 'Đã kết nối';
  $('#disconnectBtn').disabled = false;
  updateDeviceStatus(status);
  clearInterval(deviceTimer);
  deviceTimer = setInterval(async () => {
    try { updateDeviceStatus(await ble.readStatus()); } catch { /* disconnected handler */ }
  }, 5000);
  editor.setZoom(window.innerWidth < 700 ? Math.max(1.45, Math.min(1.75, (window.innerWidth - 34) / editor.project.width)) : 4); updateZoom();
  await renderLocalLibrary();
}

function updateDeviceStatus(status) {
  const time = status.time;
  const bootNames = ['BOOTING','BLE_READY','FLASH_READY','SENSOR_READY','DISPLAY_READY','READY','DISPLAY_ERROR','SENSOR_ERROR'];
  $('#deviceName').textContent = status.name || '--';
  $('#deviceVoltage').textContent = status.voltage == null ? '--' : `${status.voltage.toFixed(2)} V`;
  $('#deviceTemperature').textContent = status.temperature == null ? '--.-°C' : `${status.temperature.toFixed(1)}°C`;
  $('#deviceTime').textContent = time?.year ? `${String(time.day).padStart(2,'0')}/${String((time.month ?? 0)+1).padStart(2,'0')}/${time.year} ${String(time.hour).padStart(2,'0')}:${String(time.minute).padStart(2,'0')}:${String(time.second).padStart(2,'0')}` : '--';
  const faceInfo = time?.faceCount ? ` · ${time.faceCount} mặt` : '';
  const bootInfo = time?.bootState == null ? '' : ` · ${bootNames[time.bootState] || `STATE_${time.bootState}`}`;
  const firmwareInfo = time?.firmware ? ` · TNVA ${time.firmware}` : '';
  $('#deviceState').textContent = `Đã kết nối${faceInfo}${bootInfo}${firmwareInfo}`;
  lastDeviceStatus = status;
  markBuiltinFace(time?.faceId ?? 0);
  $$('.apply-face').forEach(button => {
    button.disabled = !ble.connected || Number(button.dataset.face) >= (time?.faceCount || 0);
  });
  updateWarehouseInstallState();
}

async function connect(sourceButton = $('#connectGateBtn')) {
  const button = sourceButton;
  button.disabled = true;
  button.textContent = 'Đang kết nối';
  $('#gateStatus').textContent = 'Đang tìm thiết bị';
  try {
    const status = await ble.connect();
    await unlockApp(status);
    toast('Đã kết nối', 'success');
  } catch (error) {
    if ($('#gateStatus')) $('#gateStatus').textContent = error.message;
    toast(error.message, 'error');
  } finally {
    if (ble.connected) {
      button.disabled = true;
      button.textContent = 'Đã kết nối';
    } else {
      button.disabled = false;
      button.textContent = button.id === 'connectDeviceBtn' ? 'Kết nối' : 'Kết nối đồng hồ';
    }
  }
}
$('#connectGateBtn').addEventListener('click', event => connect(event.currentTarget));
$('#connectDeviceBtn').addEventListener('click', event => connect(event.currentTarget));
$('#offlineBtn').addEventListener('click', openStudioOffline);
$('#disconnectBtn').addEventListener('click', () => ble.disconnect());

async function tryReconnect() {
  try {
    const status = await ble.reconnectGranted();
    if (status) await unlockApp(status);
  } catch { /* gate remains */ }
}
tryReconnect();

function showView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `${name}View`));
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === name));
  if (name === 'library') renderActiveLibrary();
  if (name === 'device') ble.readStatus().then(updateDeviceStatus).catch(() => {});
}
$$('.tab').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));

function closeObjectPalette() { const p=$('#objectPalette'); if(!p) return; p.classList.add('hidden'); p.setAttribute('aria-hidden','true'); }
$$('[data-add]').forEach(button => button.addEventListener('click', () => { editor.addElement(button.dataset.add); closeObjectPalette(); }));
$$('#imageInput, .paletteImageInput').forEach(input => input.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try { await editor.addImage(file); closeObjectPalette(); toast('Đã chèn ảnh', 'success'); } catch (error) { toast(error.message, 'error'); }
}));
$('#addObjectBtn')?.addEventListener('click', () => { const p=$('#objectPalette'); p.classList.remove('hidden'); p.setAttribute('aria-hidden','false'); });
$('#closeObjectPalette')?.addEventListener('click', closeObjectPalette);
$('#undoBtn').addEventListener('click', () => editor.undo());
$('#redoBtn').addEventListener('click', () => editor.redo());
$('#duplicateBtn').addEventListener('click', () => editor.duplicateSelected());
$('#deleteBtn').addEventListener('click', () => editor.deleteSelected());
$('#layerUpBtn').addEventListener('click', () => editor.moveLayer(1));
$('#layerDownBtn').addEventListener('click', () => editor.moveLayer(-1));
$('#zoomInBtn').addEventListener('click', () => { editor.setZoom(editor.zoom + .5); updateZoom(); });
$('#zoomOutBtn').addEventListener('click', () => { editor.setZoom(editor.zoom - .5); updateZoom(); });
function updateZoom() { $('#zoomLabel').textContent = `${Math.round(editor.zoom * 100)}%`; }
$('#gridBtn').addEventListener('click', event => { editor.setGrid(!editor.grid); event.currentTarget.classList.toggle('active', editor.grid); });
$('#bwBtn').addEventListener('click', event => { editor.setBw(!editor.bw); event.currentTarget.classList.toggle('active', editor.bw); });
$('#screenProfile').addEventListener('change', event => editor.setProfile(event.target.value));

$$('[data-align]').forEach(button => button.addEventListener('click', () => editor.alignSelected(button.dataset.align)));
$$('[data-nudge]').forEach(button => button.addEventListener('click', () => {
  const [dx,dy] = button.dataset.nudge.split(',').map(Number);
  const step = Number($('#nudgeStepBtn')?.dataset.step || 1);
  editor.nudge(dx,dy,step);
}));
$('#nudgeStepBtn')?.addEventListener('click', event => {
  const next = Number(event.currentTarget.dataset.step || 1) === 1 ? 5 : 1;
  event.currentTarget.dataset.step = String(next); event.currentTarget.textContent = `${next} px`;
});

window.addEventListener('keydown', event => {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (!typing && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); editor.deleteSelected(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); editor.redo(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); editor.duplicateSelected(); }
  if (!typing && editor.selected && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const delta = event.shiftKey ? 5 : 1;
    const patch = { x:editor.selected.x, y:editor.selected.y };
    if (event.key === 'ArrowLeft') patch.x -= delta;
    if (event.key === 'ArrowRight') patch.x += delta;
    if (event.key === 'ArrowUp') patch.y -= delta;
    if (event.key === 'ArrowDown') patch.y += delta;
    editor.updateSelected(patch);
  }
});

function field(label, key, value, type = 'number', options = {}) {
  const attrs = [
    `data-prop="${key}"`, `type="${type}"`, `value="${escapeHtml(value)}"`,
    options.min != null ? `min="${options.min}"` : '', options.max != null ? `max="${options.max}"` : '',
    options.step != null ? `step="${options.step}"` : '',
    options.list ? `list="${escapeHtml(options.list)}"` : '',
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : ''
  ].filter(Boolean).join(' ');
  const output = type === 'range' ? `<output data-output="${key}">${escapeHtml(value)}${options.unit || ''}</output>` : '';
  return `<div class="prop ${options.full ? 'full' : ''} ${type === 'range' ? 'range-prop' : ''}"><label>${label}${output}</label><input ${attrs}></div>`;
}
function selectField(label, key, value, items, full = false) {
  return `<div class="prop ${full ? 'full' : ''}"><label>${label}</label><select data-prop="${key}">${items.map(([id,name]) => `<option value="${escapeHtml(id)}" ${String(value)===String(id)?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></div>`;
}
function toggleField(label, key, checked, full = true) {
  return `<label class="checkbox-row ${full ? 'full' : ''}"><input data-prop="${key}" type="checkbox" ${checked?'checked':''}><span>${label}</span></label>`;
}
function advancedGeometry(element) {
  return `<details class="advanced-props full"><summary>Vị trí và kích thước</summary><div class="advanced-grid">${
    field('X','x',Math.round(element.x),'number',{step:1})+
    field('Y','y',Math.round(element.y),'number',{step:1})+
    field('Rộng','w',Math.round(element.w),'number',{min:1})+
    field('Cao','h',Math.round(element.h),'number',{min:1})
  }</div></details>`;
}

function renderInspector(element) {
  const empty = $('#emptyInspector');
  const form = $('#propertyForm');
  if (!element) { empty.classList.remove('hidden'); form.classList.add('hidden'); form.innerHTML = ''; return; }
  empty.classList.add('hidden'); form.classList.remove('hidden');

  let html = `<div class="object-summary full"><div><span>${layerIcon(element.type)}</span><b>${escapeHtml(TYPE_LABELS[element.type] || element.type)}</b></div><small>${Math.round(element.w)}×${Math.round(element.h)} px</small></div>`;
  html += field('Tên lớp', 'name', element.name || '', 'text', { full:true });

  if (['text','time','date','weekday','lunar','voltage','template'].includes(element.type)) {
    const staticText = ['text','template'].includes(element.type);
    const fontItems = staticText
      ? [['pixel','Pixel 1-bit'],['robotoCondensed','Roboto Condensed'],['inter','Inter'],['notoMono','Noto Sans Mono'],['dseg','Số điện tử']]
      : [['pixel','Pixel 1-bit'],['robotoCondensed','Roboto Condensed'],['dseg','Số điện tử']];

    if (element.type === 'text') html += `<div class="prop full"><label>Nội dung</label><textarea id="propText" data-prop="text">${escapeHtml(element.text || '')}</textarea></div>`;
    else if (element.type === 'template') {
      html += `<div class="prop full"><label>Nội dung động</label><textarea data-prop="template" placeholder="@h:@m">${escapeHtml(element.template || '')}</textarea><small class="prop-help">@h giờ · @m phút · @d ngày · @M tháng · @y năm · @T thứ · @A/@L âm lịch · @V pin · @D nhiệt độ</small></div>`;
      html += selectField('Kiểu vẽ','templateStyle',element.templateStyle || 0,[['0','Chữ thường'],['1','Số viền'],['2','Số đặc'],['3','7 đoạn'],['4','Đồng hồ chữ'],['5','Chữ lớn']],true);
    } else html += field('Mẫu hiển thị','format',element.format || '','text',{full:true});

    if (element.type === 'time') {
      html += selectField('Kiểu đồng hồ','templateStyle',element.templateStyle || 0,[['0','Roboto Condensed'],['1','Số viền'],['2','Số đặc'],['3','7 đoạn'],['4','Đồng hồ chữ']],true);
      html += toggleField('Hiện giây','showSeconds',element.showSeconds);
    }

    html += selectField('Font','font',element.font,fontItems,true);
    if (staticText) html += field('Google Font','fontFamily',element.fontFamily || '','text',{full:true,list:'googleFontFamilies',placeholder:'Roboto Condensed'});
    html += field('Cỡ chữ','fontSize',element.fontSize,'range',{min:5,max:80,step:1,full:true,unit:' px'});
    html += selectField('Độ đậm','weight',element.weight,[['400','Regular'],['600','Semi Bold'],['700','Bold'],['800','Extra Bold']]);
    html += selectField('Canh lề','align',element.align,[['left','Trái'],['center','Giữa'],['right','Phải']]);
    html += toggleField('Đảo nền chữ','inverse',Boolean(element.inverse));
  }

  if (element.type === 'calendar') {
    html += selectField('Kiểu lịch','calendarType',element.calendarType || 0,[
      ['0','Tháng tiêu chuẩn'],['1','7 ô ngày · cao'],['2','7 ô ngày · ngắn'],['3','Lịch dọc'],['4','Lịch dọc gọn'],['5','Lịch ngang rộng']
    ],true);
    html += field('Cỡ chữ','fontSize',element.fontSize || 8,'range',{min:5,max:18,step:1,full:true,unit:' px'});
  }

  if (element.type === 'image') {
    html += `<div class="full image-source-actions"><button id="replaceImageBtn" class="btn">Đổi ảnh</button><button id="openBitmapForImageBtn" class="btn">Chấm từng điểm</button></div>`;
    html += field('Phóng ảnh','imageScale',element.imageScale || 1,'range',{min:.05,max:5,step:.01,full:true});
    html += field('Lệch X','imageOffsetX',element.imageOffsetX || 0,'number',{step:1}) + field('Lệch Y','imageOffsetY',element.imageOffsetY || 0,'number',{step:1});
    html += field('Ngưỡng','threshold',element.threshold || 150,'range',{min:0,max:255,step:1,full:true});
    html += field('Tương phản','contrast',element.contrast || 1.15,'range',{min:.3,max:3,step:.05,full:true});
    html += selectField('Phối điểm','dither',element.dither,[['ordered','Ordered 4×4'],['floyd','Floyd–Steinberg'],['none','Đen trắng thuần']],true);
    html += toggleField('Đảo màu đen trắng','invert',Boolean(element.invert));
    html += `<div class="full action-group"><button id="fitImageBtn" class="btn">Vừa khung</button><button id="fillImageBtn" class="btn">Phủ kín</button><button id="resetImageBtn" class="btn">Đặt lại</button></div>`;
  }

  if (element.type === 'shape') {
    html += selectField('Loại hình','shapeKind',element.shapeKind || 'roundRect',[
      ['circle','Hình tròn / elip'],['square','Hình vuông / chữ nhật'],['line','Đường thẳng'],['battery','Viền pin'],['roundRect','Vuông bo góc'],['roundRectFill','Vuông fill bo góc']
    ],true);
    html += field('Độ dày nét','lineWidth',element.lineWidth || 1,'range',{min:1,max:8,step:1,full:true,unit:' px'});
    html += field('Bo góc','radius',element.radius || 6,'range',{min:0,max:30,step:1,full:true,unit:' px'});
    html += toggleField('Tô đen','fill',Boolean(element.fill));
  }

  if (element.type === 'line' || element.type === 'rect' || element.type === 'legacyShape') {
    html += field('Độ dày nét','lineWidth',element.lineWidth || 1,'range',{min:1,max:8,step:1,full:true,unit:' px'});
  }

  html += advancedGeometry(element);
  html += toggleField('Khóa vị trí','locked',Boolean(element.locked));
  html += toggleField('Hiển thị','visible',element.visible !== false);
  form.innerHTML = html;

  form.querySelectorAll('[data-prop]').forEach(control => {
    const handler = () => {
      let value;
      if (control.type === 'checkbox') value = control.checked;
      else if (control.type === 'number' || control.type === 'range') value = Number(control.value);
      else value = control.value;
      const key = control.dataset.prop;
      const output = form.querySelector(`[data-output="${key}"]`);
      if (output) output.textContent = `${control.value}${output.textContent.includes('px') ? ' px' : ''}`;
      const selected = editor.selected;
      const patch = { [key]: value };
      if (selected?.type === 'time' && (key === 'fontSize' || key === 'showSeconds')) {
        const fontSize = key === 'fontSize' ? Number(value) : Number(selected.fontSize || 12);
        const showSeconds = key === 'showSeconds' ? Boolean(value) : Boolean(selected.showSeconds);
        const characters = showSeconds ? 8 : 5;
        const wantedW = Math.min(editor.project.width, Math.max(selected.w, Math.ceil(characters * fontSize * .62)));
        const wantedH = Math.min(editor.project.height, Math.max(selected.h, Math.ceil(fontSize * 1.15)));
        patch.w = wantedW; patch.h = wantedH;
        patch.x = Math.max(0, Math.min(selected.x, editor.project.width - wantedW));
        patch.y = Math.max(0, Math.min(selected.y, editor.project.height - wantedH));
      }
      editor.updateSelected(patch);
    };
    control.addEventListener(control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input', handler);
  });
  $('#fitImageBtn')?.addEventListener('click', () => fitImage(false));
  $('#fillImageBtn')?.addEventListener('click', () => fitImage(true));
  $('#resetImageBtn')?.addEventListener('click', () => editor.updateSelected({ imageScale:1,imageOffsetX:0,imageOffsetY:0 }));
  $('#replaceImageBtn')?.addEventListener('click', () => $('#imageInput')?.click());
  $('#openBitmapForImageBtn')?.addEventListener('click', () => openBitmapEditor(editor.selected));
}

function fitImage(fill) {
  const element = editor.selected;
  if (!element || element.type !== 'image' || !element.sourceW || !element.sourceH) return;
  const fit = Math.min(element.w / element.sourceW, element.h / element.sourceH);
  const cover = Math.max(element.w / element.sourceW, element.h / element.sourceH);
  editor.updateSelected({ imageScale: fill ? cover : fit, imageOffsetX:0, imageOffsetY:0 });
}

async function openBitmapEditor(target = null) {
  const initialW = Math.max(4, Math.min(212, Math.round(target?.sourceW || target?.w || 60)));
  const initialH = Math.max(4, Math.min(212, Math.round(target?.sourceH || target?.h || 40)));
  showModal(`<div class="bitmap-editor">
    <div class="bitmap-head"><div><span class="eyebrow">TNVA PIXEL</span><h2>Chấm từng điểm</h2></div><button id="bitmapClose" class="icon-close">×</button></div>
    <div class="bitmap-size-row"><label>Rộng<input id="bitmapWidth" type="number" min="4" max="212" value="${initialW}"></label><label>Cao<input id="bitmapHeight" type="number" min="4" max="212" value="${initialH}"></label><button id="bitmapResize" class="btn">Đổi cỡ lưới</button></div>
    <div class="bitmap-stage"><canvas id="bitmapCanvas"></canvas></div>
    <div class="bitmap-tools">
      <button data-bitmap-tool="black" class="active">✎<span>Bút đen</span></button>
      <button data-bitmap-tool="white">⌫<span>Bút trắng</span></button>
      <button data-bitmap-action="undo">↶<span>Undo</span></button>
      <button data-bitmap-action="fillBlack">■<span>Tô đen</span></button>
      <button data-bitmap-action="fillWhite">□<span>Tô trắng</span></button>
      <button data-bitmap-action="invert">◐<span>Đảo</span></button>
      <button data-bitmap-action="flipH">↔<span>Lật ngang</span></button>
      <button data-bitmap-action="flipV">↕<span>Lật dọc</span></button>
      <button data-bitmap-action="rotate">⟳<span>Xoay 90°</span></button>
      <button data-bitmap-action="clear">⌧<span>Xóa hết</span></button>
    </div>
    <div class="modal-actions"><button id="bitmapCancel" class="btn">Hủy</button><button id="bitmapOk" class="btn primary">Dùng ảnh này</button></div>
  </div>`);

  const canvas = $('#bitmapCanvas');
  const ctx = canvas.getContext('2d');
  let width = initialW, height = initialH;
  let pixels = new Uint8Array(width * height);
  let tool = 'black', drawing = false;
  const history = [];

  const pushHistory = () => { history.push({width,height,pixels:pixels.slice()}); if (history.length > 30) history.shift(); };
  const cellSize = () => Math.max(3, Math.min(12, Math.floor(Math.min(720 / width, 480 / height))));
  const resizeCanvas = () => { const c=cellSize(); canvas.width=width*c; canvas.height=height*c; canvas.style.aspectRatio=`${width}/${height}`; draw(); };
  const draw = () => {
    const c=cellSize(); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#111';
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(pixels[y*width+x]) ctx.fillRect(x*c,y*c,c,c);
    if(c>=5){ ctx.strokeStyle='rgba(50,60,70,.22)'; ctx.lineWidth=1; ctx.beginPath(); for(let x=0;x<=width;x++){ctx.moveTo(x*c+.5,0);ctx.lineTo(x*c+.5,height*c);} for(let y=0;y<=height;y++){ctx.moveTo(0,y*c+.5);ctx.lineTo(width*c,y*c+.5);} ctx.stroke(); }
  };
  const point = event => { const r=canvas.getBoundingClientRect(); return {x:Math.floor((event.clientX-r.left)*width/r.width),y:Math.floor((event.clientY-r.top)*height/r.height)}; };
  const paint = event => { const p=point(event); if(p.x<0||p.y<0||p.x>=width||p.y>=height)return; pixels[p.y*width+p.x]=tool==='black'?1:0; draw(); };

  if (target?.imageData) {
    try {
      const image = new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=target.imageData;});
      const off=document.createElement('canvas'); off.width=width; off.height=height;
      const offCtx=off.getContext('2d',{willReadFrequently:true}); offCtx.fillStyle='#fff';offCtx.fillRect(0,0,width,height);offCtx.drawImage(image,0,0,width,height);
      const data=offCtx.getImageData(0,0,width,height).data;
      for(let i=0;i<pixels.length;i++){const j=i*4; pixels[i]=(.299*data[j]+.587*data[j+1]+.114*data[j+2])<150?1:0;}
    } catch { /* start blank */ }
  }
  resizeCanvas();

  canvas.addEventListener('pointerdown', event => { pushHistory(); drawing=true; canvas.setPointerCapture?.(event.pointerId); paint(event); });
  canvas.addEventListener('pointermove', event => { if(drawing) paint(event); });
  canvas.addEventListener('pointerup', event => { drawing=false; canvas.releasePointerCapture?.(event.pointerId); });
  canvas.addEventListener('pointercancel', () => { drawing=false; });

  $$('[data-bitmap-tool]').forEach(button => button.addEventListener('click', () => { tool=button.dataset.bitmapTool; $$('[data-bitmap-tool]').forEach(x=>x.classList.toggle('active',x===button)); }));
  $$('[data-bitmap-action]').forEach(button => button.addEventListener('click', () => {
    const action=button.dataset.bitmapAction;
    if(action==='undo'){const state=history.pop();if(state){width=state.width;height=state.height;pixels=state.pixels;$('#bitmapWidth').value=width;$('#bitmapHeight').value=height;resizeCanvas();}return;}
    pushHistory();
    if(action==='fillBlack') pixels.fill(1);
    if(action==='fillWhite'||action==='clear') pixels.fill(0);
    if(action==='invert') for(let i=0;i<pixels.length;i++) pixels[i]=pixels[i]?0:1;
    if(action==='flipH'){const next=new Uint8Array(pixels.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)next[y*width+(width-1-x)]=pixels[y*width+x];pixels=next;}
    if(action==='flipV'){const next=new Uint8Array(pixels.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)next[(height-1-y)*width+x]=pixels[y*width+x];pixels=next;}
    if(action==='rotate'){const next=new Uint8Array(width*height);const oldW=width,oldH=height;for(let y=0;y<oldH;y++)for(let x=0;x<oldW;x++)next[x*oldH+(oldH-1-y)]=pixels[y*oldW+x];width=oldH;height=oldW;pixels=next;$('#bitmapWidth').value=width;$('#bitmapHeight').value=height;resizeCanvas();return;}
    draw();
  }));
  $('#bitmapResize').onclick=()=>{const nw=Math.max(4,Math.min(212,Number($('#bitmapWidth').value)||width));const nh=Math.max(4,Math.min(212,Number($('#bitmapHeight').value)||height));pushHistory();const next=new Uint8Array(nw*nh);for(let y=0;y<Math.min(height,nh);y++)for(let x=0;x<Math.min(width,nw);x++)next[y*nw+x]=pixels[y*width+x];width=nw;height=nh;pixels=next;resizeCanvas();};
  $('#bitmapClose').onclick=$('#bitmapCancel').onclick=closeModal;
  $('#bitmapOk').onclick=async()=>{
    const out=document.createElement('canvas');out.width=width;out.height=height;const o=out.getContext('2d');o.fillStyle='#fff';o.fillRect(0,0,width,height);o.fillStyle='#000';for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[y*width+x])o.fillRect(x,y,1,1);
    const dataUrl=out.toDataURL('image/png');
    if(target?.type==='image') editor.updateSelected({imageData:dataUrl,sourceW:width,sourceH:height,w:Math.min(width,editor.project.width),h:Math.min(height,editor.project.height),imageScale:1,imageOffsetX:0,imageOffsetY:0,dither:'none',threshold:128,contrast:1});
    else { const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png')); const file=new File([blob],'bitmap.png',{type:'image/png'}); const el=await editor.addImage(file); editor.updateSelected({w:Math.min(width,editor.project.width),h:Math.min(height,editor.project.height),imageScale:1,dither:'none',threshold:128,contrast:1},false); }
    closeModal(); toast('Đã thêm ảnh pixel','success');
  };
}

$('#bitmapEditorBtn')?.addEventListener('click', () => openBitmapEditor());
$('#paletteBitmapBtn')?.addEventListener('click', () => { closeObjectPalette(); openBitmapEditor(); });


function renderLayers() {
  const list = $('#layersList');
  $('#layerCount').textContent = String(editor.project.elements.length);
  list.innerHTML = editor.project.elements.slice().reverse().map(element => `
    <div class="layer-row ${element.id===editor.selectedId?'active':''}" data-layer="${element.id}">
      <span class="layer-icon">${layerIcon(element.type)}</span>
      <span>${escapeHtml(element.name || TYPE_LABELS[element.type] || element.type)}</span>
      <button data-hide="${element.id}">${element.visible?'●':'○'}</button>
    </div>`).join('');
  list.querySelectorAll('[data-layer]').forEach(row => row.addEventListener('click', event => { if (!event.target.dataset.hide) editor.select(row.dataset.layer); }));
  list.querySelectorAll('[data-hide]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation(); editor.select(button.dataset.hide); editor.updateSelected({ visible:!editor.selected.visible });
  }));
}
function renderMobileLayers() {
  const list = $('#mobileLayersList');
  if (!list) return;
  if (!editor.project.elements.length) { list.innerHTML = '<div class="object-strip-empty">Chưa có đối tượng</div>'; return; }
  list.innerHTML = editor.project.elements.slice().reverse().map(element => `
    <button class="object-chip ${element.id===editor.selectedId?'active':''}" data-mobile-layer="${element.id}">
      <span class="object-chip-icon">${layerIcon(element.type)}</span>
      <span class="object-chip-copy"><b>${escapeHtml(element.name || TYPE_LABELS[element.type] || element.type)}</b><small>${Math.round(element.w)}×${Math.round(element.h)}${element.locked?' · khóa':''}</small></span>
      <span class="object-chip-state">${element.visible!==false?'●':'○'}</span>
    </button>`).join('');
  list.querySelectorAll('[data-mobile-layer]').forEach(button => button.addEventListener('click', () => editor.select(button.dataset.mobileLayer)));
  requestAnimationFrame(() => list.querySelector('.object-chip.active')?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}));
}

function layerIcon(type) { return ({text:'T',template:'@',calendar:'▦',time:'⌚',date:'日',weekday:'T2',lunar:'ÂL',voltage:'V',battery:'▰',analog:'◷',image:'Ả',shape:'◯',line:'／',rect:'□',legacyShape:'◇'})[type] || '•'; }

$('#designTitle').addEventListener('input', event => { editor.project.title = event.target.value; editor.changed(); });
$('#designAuthor').addEventListener('input', event => { editor.project.author = event.target.value; editor.changed(); });
$('#newDesignBtn').addEventListener('click', () => {
  showModal(`<h2>Tạo mới</h2><div class="modal-actions"><button class="btn" id="modalCancel">Hủy</button><button class="btn primary" id="modalConfirm">Tạo mới</button></div>`);
  $('#modalCancel').onclick = closeModal;
  $('#modalConfirm').onclick = () => { editor.newProject($('#screenProfile').value); closeModal(); };
});

$('#saveLocalBtn').addEventListener('click', async () => {
  try {
    const preview = await editor.previewDataUrl();
    const saved = await saveProject({ ...editor.exportProject(), preview });
    editor.project.createdAt = saved.createdAt;
    toast('Đã lưu', 'success');
    await renderLocalLibrary();
  } catch (error) { toast(error.message, 'error'); }
});
$('#downloadBtn').addEventListener('click', async () => { try { await editor.downloadFace(); } catch (error) { toast(error.message, 'error'); } });
$('#openFileBtn').addEventListener('click', () => $('#projectFileInput').click());
$('#downloadProjectBtn').addEventListener('click', () => editor.downloadProject());
$('#projectFileInput').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  try { await editor.importFile(file); toast('Đã mở file', 'success'); } catch (error) { toast(error.message, 'error'); }
});

$('#publishBtn').addEventListener('click', async () => {
  if (!publicStoreConfigured()) {
    showModal(`<h2>Kho cộng đồng</h2><p>Chưa cấu hình máy chủ.</p><div class="modal-actions"><button class="btn primary" id="modalClose">Đóng</button></div>`);
    $('#modalClose').onclick = closeModal; return;
  }
  showModal(`<h2>Đăng công khai</h2>
    <div class="prop"><label>Tên giao diện</label><input id="publishTitle" value="${escapeHtml(editor.project.title)}"></div>
    <div class="prop"><label>Tác giả</label><input id="publishAuthor" value="${escapeHtml(editor.project.author)}"></div>
    <div class="modal-actions"><button class="btn" id="modalCancel">Hủy</button><button class="btn primary" id="modalPublish">Đăng</button></div>`);
  $('#modalCancel').onclick = closeModal;
  $('#modalPublish').onclick = async () => {
    const button = $('#modalPublish'); button.disabled = true;
    try {
      editor.project.title = $('#publishTitle').value.trim() || 'Không tên';
      editor.project.author = $('#publishAuthor').value.trim() || 'Ẩn danh';
      const compiled = await editor.compile();
      await publishFace({ title:editor.project.title, author:editor.project.author, width:editor.project.width, height:editor.project.height, preview:compiled.preview, payload:compiled.payload });
      closeModal(); toast('Đã đăng', 'success'); await renderPublicLibrary();
    } catch (error) { toast(error.message, 'error'); button.disabled = false; }
  };
});

$('#installBtn').addEventListener('click', async () => {
  try {
    const compiled = await editor.compile();
    const profile = DEVICE.profiles[`${editor.project.width}x${editor.project.height}`];
    if (profile && compiled.packageBytes.length > profile.maxPackageBytes) throw new Error('Giao diện vượt dung lượng Flash');
    showModal(`<h2>Gửi vào đồng hồ</h2><div class="progress"><span id="installProgress"></span></div><div class="modal-actions"><button class="btn" id="modalCancel">Hủy</button></div>`);
    $('#modalCancel').onclick = closeModal;
    log(`Đang gửi thiết kế: ${editor.project.title || 'Giao diện mới'}`);
    await ble.uploadFace(compiled.packageBytes, value => { const bar=$('#installProgress'); if(bar) bar.style.width=`${value}%`; });
    log('Thiết kế đang hiển thị trên đồng hồ');
    closeModal(); toast('Đã gửi giao diện', 'success');
  } catch (error) { closeModal(); toast(error.message, 'error'); }
});

async function renderLocalLibrary() {
  const rows = await listProjects();
  const query = normalizeSearch($('#librarySearch').value);
  const filtered = rows.filter(row => !query || normalizeSearch(`${row.title} ${row.author}`).includes(query));
  const root = $('#localLibrary');
  root.innerHTML = filtered.length ? filtered.map(row => designCard(row,'local')).join('') : '<div class="empty-state panel">Chưa có giao diện</div>';
  bindLibraryCards(root,'local');
}

async function renderPublicLibrary() {
  const root = $('#publicLibrary');
  if (!publicStoreConfigured()) { root.innerHTML = '<div class="empty-state panel">Kho cộng đồng chưa cấu hình</div>'; return; }
  root.innerHTML = '<div class="empty-state panel">Đang tải</div>';
  try {
    const rows = await listPublicFaces($('#librarySearch').value.trim());
    root.innerHTML = rows.length ? rows.map(row => designCard(row,'public')).join('') : '<div class="empty-state panel">Chưa có giao diện</div>';
    bindLibraryCards(root,'public');
  } catch (error) { root.innerHTML = `<div class="empty-state panel">${escapeHtml(error.message)}</div>`; }
}

function designCard(row, source) {
  const preview = source === 'local' ? row.preview : row.preview_data;
  const title = row.title || 'Không tên';
  const author = row.author || 'Ẩn danh';
  const width = row.width || row.screen_width || row.payload?.screen?.width || 212;
  const height = row.height || row.screen_height || row.payload?.screen?.height || 104;
  return `<article class="design-card" data-card="${escapeHtml(row.id)}" data-source="${source}">
    <div class="card-preview">${preview ? `<img loading="lazy" src="${escapeHtml(preview)}" alt="">` : ''}</div>
    <div class="card-body"><div class="card-title">${escapeHtml(title)}</div><div class="card-meta">${escapeHtml(author)} · ${width}×${height}</div>
    <div class="card-actions"><button class="btn" data-open>Mở</button><button class="btn" data-download>Tải</button>${source==='local'?'<button class="btn" data-delete>Xóa</button>':''}</div></div></article>`;
}

function bindLibraryCards(root, source) {
  root.querySelectorAll('[data-card]').forEach(card => {
    const id = card.dataset.card;
    card.querySelector('[data-open]').onclick = async () => {
      if (source === 'local') {
        const rows = await listProjects(); const row = rows.find(item=>item.id===id); if(row) editor.loadProject(row);
      } else {
        const rows = await listPublicFaces(); const row = rows.find(item=>String(item.id)===String(id)); if(row) await importPayload(row.payload);
      }
      showView('designer');
    };
    card.querySelector('[data-download]').onclick = async () => {
      if (source === 'local') {
        const rows = await listProjects(); const row=rows.find(item=>item.id===id); if(!row)return;
        download(`${slug(row.title)}.tnvaproject`, new Blob([JSON.stringify(row,null,2)],{type:'application/json'}));
      } else {
        const rows=await listPublicFaces(); const row=rows.find(item=>String(item.id)===String(id)); if(!row)return;
        const bytes=new TextEncoder().encode(JSON.stringify(row.payload));
        download(`${slug(row.title)}.tnvaface`,new Blob([bytes],{type:'application/json'})); incrementDownload(id);
      }
    };
    card.querySelector('[data-delete]')?.addEventListener('click', async () => { await deleteProject(id); renderLocalLibrary(); });
  });
}

function normalizeSearch(text='') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function slug(text='giao-dien'){return normalizeSearch(text).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'giao-dien';}
async function importPayload(payload) {
  const file = new File([JSON.stringify(payload)], 'community.tnvaface', {type:'application/json'});
  await editor.importFile(file);
}

async function loadWarehouseRows() {
  if (warehouseRows.length) return warehouseRows;
  const response = await fetch('warehouse/index.json', { cache:'no-store' });
  if (!response.ok) throw new Error('Không tải được kho giao diện');
  const data = await response.json();
  warehouseRows = Array.isArray(data.items) ? data.items : [];
  return warehouseRows;
}

async function renderWarehouseLibrary(reset = false) {
  const root = $('#warehouseLibrary');
  if (reset) warehouseVisible = 24;
  root.innerHTML = '<div class="empty-state panel">Đang tải kho giao diện</div>';
  try {
    const rows = await loadWarehouseRows();
    const query = normalizeSearch($('#librarySearch').value);
    const orientation = $('#warehouseOrientation')?.value || 'all';
    const filtered = rows.filter(row => {
      const matchText = !query || normalizeSearch(`${row.title} ${row.author} ${row.id}`).includes(query);
      const matchOrientation = orientation === 'all' || (row.orientation || 'landscape') === orientation;
      return matchText && matchOrientation;
    });
    const visible = filtered.slice(0, warehouseVisible);
    root.innerHTML = visible.length ? visible.map(warehouseCard).join('') : '<div class="empty-state panel">Không tìm thấy giao diện</div>';
    $('#warehouseSummary').textContent = `${rows.length} giao diện · ${rows.filter(row => row.orientation === 'portrait').length} mặt dọc · chỉ dành cho 212 × 104`;
    $('#warehouseLoadMore').classList.toggle('hidden', visible.length >= filtered.length);
    bindWarehouseCards(root);
  } catch (error) {
    root.innerHTML = `<div class="empty-state panel">${escapeHtml(error.message)}</div>`;
  }
}

function warehouseButtonLabel(row) {
  if (activeWarehouseId === Number(row.id) && lastDeviceStatus?.time?.faceId === 6) return 'Đang áp dụng trên đồng hồ';
  return 'Áp dụng lên đồng hồ';
}

function warehouseCard(row) {
  const portrait = row.orientation === 'portrait';
  const label = warehouseButtonLabel(row);
  const active = label === 'Đang áp dụng trên đồng hồ';
  return `<article class="design-card warehouse-card ${portrait ? 'portrait-card' : ''} ${active ? 'active-face' : ''}" data-warehouse="${row.id}">
    <div class="card-preview ${portrait ? 'portrait' : ''}"><img loading="lazy" src="warehouse/${escapeHtml(row.preview)}" alt=""></div>
    <div class="card-body"><div class="card-title"><span>${escapeHtml(row.title || 'Không tên')}</span><span class="orientation-badge">${portrait ? 'DỌC' : 'NGANG'}</span></div>
    <div class="card-meta">#${row.id} · ${escapeHtml(row.author || 'Ẩn danh')} · ${Math.round((row.packageBytes||0)/1024*10)/10} KB</div>
    <div class="warehouse-state">${active ? 'Mặt này đang hiển thị' : 'Sẵn sàng áp dụng'}</div>
    <div class="card-actions"><button class="btn primary" data-install data-state="${active ? 'active' : 'apply'}">${label}</button></div>
    </div></article>`;
}

function validateWarehousePackage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > 4096) throw new Error('Gói giao diện không hợp lệ');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (view.getUint32(0,true)!==0x31464e54) throw new Error('Gói thiếu đầu TNF1');
  const version=bytes[4];
  if (version!==1 && version!==2) throw new Error('Phiên bản giao diện không hỗ trợ');
  const headerSize=version===2?24:20;
  const totalSize=view.getUint16(version===2?14:12,true);
  const expected=view.getUint32(version===2?20:16,true);
  if (totalSize!==bytes.length || totalSize<headerSize) throw new Error('Kích thước gói giao diện bị lỗi');
  const actual=crc32(bytes.slice(headerSize));
  if (actual!==expected) throw new Error('CRC gói giao diện không khớp');
  if (bytes[5]!==212 || bytes[6]!==104) throw new Error('Giao diện không đúng màn 212 × 104');
  return true;
}

async function fetchWarehouseBytes(row) {
  const id = Number(row.id);
  if (warehouseCache.has(id)) return warehouseCache.get(id);
  const response = await fetch(`warehouse/${row.package}`, { cache:'force-cache' });
  if (!response.ok) throw new Error('Không tải được gói giao diện');
  const bytes = new Uint8Array(await response.arrayBuffer());
  validateWarehousePackage(bytes);
  warehouseCache.set(id, bytes);
  return bytes;
}

function bindWarehouseCards(root) {
  root.querySelectorAll('[data-warehouse]').forEach(card => {
    const row = warehouseRows.find(item => String(item.id) === String(card.dataset.warehouse));
    if (!row) return;
    const install = card.querySelector('[data-install]');
    const stateText = card.querySelector('.warehouse-state');
    install.onclick = async () => {
      const id = Number(row.id);
      try {
        if (!ble.connected) throw new Error('Hãy kết nối đồng hồ trước');
        install.dataset.state = 'busy';
        install.disabled = true;
        if (!warehouseCache.has(id)) {
          install.textContent = 'Đang tải…';
          stateText.textContent = 'Đang tải gói giao diện';
          log(`Đang tải mặt #${row.id} · ${row.title || 'Không tên'}`);
          await fetchWarehouseBytes(row);
        }
        install.textContent = 'Đang áp dụng…';
        stateText.textContent = 'Đang truyền qua Bluetooth';
        log(`Đang gửi mặt #${row.id} qua BLE`);
        await ble.uploadFace(warehouseCache.get(id));
        activeWarehouseId = id;
        localStorage.setItem('tnvaWarehouseFace', String(id));
        install.dataset.state = 'active';
        install.textContent = 'Đang áp dụng trên đồng hồ';
        stateText.textContent = 'Mặt này đang hiển thị';
        root.querySelectorAll('.warehouse-card').forEach(item => item.classList.remove('active-face'));
        card.classList.add('active-face');
        lastDeviceStatus = await ble.readStatus();
        updateDeviceStatus(lastDeviceStatus);
        log(`Mặt #${row.id} đang áp dụng trên đồng hồ`);
        toast('Đã áp dụng giao diện', 'success');
      } catch (error) {
        install.dataset.state = 'apply';
        install.textContent = 'Áp dụng lên đồng hồ';
        stateText.textContent = error.message;
        toast(error.message, 'error');
      } finally {
        updateWarehouseInstallState();
      }
    };
  });
  updateWarehouseInstallState();
}

function updateWarehouseInstallState() {
  const customFaceActive = lastDeviceStatus?.time?.faceId === 6;
  document.querySelectorAll('.warehouse-card').forEach(card => {
    const button = card.querySelector('[data-install]');
    const stateText = card.querySelector('.warehouse-state');
    if (!button || button.dataset.state === 'busy') return;
    const active = customFaceActive && Number(card.dataset.warehouse) === activeWarehouseId;
    card.classList.toggle('active-face', active);
    button.dataset.state = active ? 'active' : 'apply';
    button.textContent = active ? 'Đang áp dụng trên đồng hồ' : 'Áp dụng lên đồng hồ';
    button.disabled = !ble.connected || active;
    if (stateText) stateText.textContent = active ? 'Mặt này đang hiển thị' : 'Sẵn sàng áp dụng';
  });
}

function activeLibraryMode() {
  return $('.library-tab.active')?.dataset.library || 'local';
}
function renderActiveLibrary() {
  const mode = activeLibraryMode();
  if (mode === 'public') return renderPublicLibrary();
  if (mode === 'warehouse') return renderWarehouseLibrary();
  return renderLocalLibrary();
}

$$('.library-tab').forEach(button => button.addEventListener('click', () => {
  $$('.library-tab').forEach(item=>item.classList.toggle('active',item===button));
  const mode=button.dataset.library;
  $('#localLibrary').classList.toggle('hidden',mode!=='local');
  $('#warehouseLibrary').classList.toggle('hidden',mode!=='warehouse');
  $('#publicLibrary').classList.toggle('hidden',mode!=='public');
  renderActiveLibrary();
}));
$('#librarySearch').addEventListener('input', () => renderWarehouseLibrary(true));
$('#warehouseOrientation')?.addEventListener('change', () => renderWarehouseLibrary(true));
$('#warehouseLoadMore')?.addEventListener('click', () => { warehouseVisible += 24; renderWarehouseLibrary(false); });

$('#syncTimeBtn').addEventListener('click', async () => { try { await ble.syncTime(); updateDeviceStatus(await ble.readStatus()); toast('Đã đồng bộ','success'); } catch(error){toast(error.message,'error');} });
$('#toggleHourBtn').addEventListener('click', async () => { try { await ble.toggleHourFormat(); toast('Đã đổi định dạng','success'); } catch(error){toast(error.message,'error');} });
$('#firmwareInput').addEventListener('change', async event => {
  const file=event.target.files?.[0]; event.target.value=''; if(!file)return;
  const progress=$('#firmwareProgress'); const bar=progress.querySelector('span'); progress.classList.remove('hidden');
  try { await ble.updateFirmware(file,value=>bar.style.width=`${value}%`); toast('Đã gửi firmware','success'); }
  catch(error){toast(error.message,'error');}
  finally{setTimeout(()=>{progress.classList.add('hidden');bar.style.width='0';},1200);}
});
$('#clearLogBtn').addEventListener('click', () => { logWindow.textContent=''; logLines=0; $('#logCount').textContent='0'; });


function markBuiltinFace(faceId) {
  $$('[data-face-card]').forEach(card => card.classList.toggle('active-face', Number(card.dataset.faceCard) === Number(faceId)));
}

$$('.apply-face').forEach(button => button.addEventListener('click', async () => {
  button.disabled = true;
  const id = Number(button.dataset.face);
  try {
    toast('Đang đổi giao diện…');
    log(`Đang áp dụng mặt tích hợp ${id + 1}`);
    const status = await ble.selectFace(id);
    updateDeviceStatus(status);
    log(`Đã áp dụng mặt tích hợp ${id + 1}`);
    toast('Đã đổi giao diện', 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { if (lastDeviceStatus) updateDeviceStatus(lastDeviceStatus); }
}));

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function buildTnf1(bitplane, descriptors = [], strings = new Uint8Array()) {
  const descBytes = descriptors.length ? concatBytes(...descriptors) : new Uint8Array();
  const payload = concatBytes(bitplane, descBytes, strings);
  const total = 24 + payload.length;
  if (total > 4096) throw new Error('Gói vượt quá 4 KB');
  const header = new Uint8Array(24);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x31464e54, true);
  header[4] = 2; header[5] = 212; header[6] = 104; header[7] = 27;
  view.setUint16(8, bitplane.length, true);
  header[10] = descriptors.length; header[11] = 16;
  view.setUint16(12, strings.length, true);
  view.setUint16(14, total, true);
  view.setUint32(16, 0, true);
  view.setUint32(20, crc32(payload), true);
  return concatBytes(header, payload);
}

function canvasToBitplane(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  const data = ctx.getImageData(0, 0, 212, 104).data;
  const out = new Uint8Array(27 * 104);
  for (let y = 0; y < 104; y++) for (let x = 0; x < 212; x++) {
    if (data[(y * 212 + x) * 4] < 128) out[y * 27 + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return out;
}

const photoCanvas = $('#photoCanvas');
const photoCtx = photoCanvas.getContext('2d', { willReadFrequently:true });
const photoSource = document.createElement('canvas'); photoSource.width = 212; photoSource.height = 104;
let photoImage = null;
let photoState = { scale:1, x:0, y:0, rotation:0, flipH:1, flipV:1, dragging:false, px:0, py:0 };

function valueOf(id) { return Number($(id).value); }
function renderPhoto() {
  const w = 212, h = 104;
  const raw = document.createElement('canvas'); raw.width = w; raw.height = h;
  const rctx = raw.getContext('2d', { willReadFrequently:true });
  rctx.fillStyle = '#fff'; rctx.fillRect(0,0,w,h);
  if (photoImage) {
    const fit = $('#photoFit').value;
    const angle = ((photoState.rotation % 360) + 360) % 360;
    const rotated = angle === 90 || angle === 270;
    const iw = rotated ? photoImage.height : photoImage.width;
    const ih = rotated ? photoImage.width : photoImage.height;
    const base = fit === 'contain' ? Math.min(w/iw,h/ih) : Math.max(w/iw,h/ih);
    const scale = base * photoState.scale;
    rctx.save();
    rctx.translate(w/2 + photoState.x, h/2 + photoState.y);
    rctx.scale(photoState.flipH, photoState.flipV);
    rctx.rotate(angle * Math.PI / 180);
    rctx.imageSmoothingEnabled = true;
    rctx.drawImage(photoImage, -photoImage.width*scale/2, -photoImage.height*scale/2, photoImage.width*scale, photoImage.height*scale);
    rctx.restore();
  } else {
    rctx.fillStyle='#111';rctx.font='bold 12px sans-serif';rctx.textAlign='center';rctx.fillText('CHỌN ẢNH',106,48);rctx.font='8px sans-serif';rctx.fillText('TNVA IMAGE ENGINE',106,62);
  }
  const image = rctx.getImageData(0,0,w,h);
  const src = new Float32Array(w*h);
  const brightness = valueOf('#photoBrightness') * 2.0;
  const contrast = valueOf('#photoContrast') / 100;
  for(let i=0;i<src.length;i++){
    const p=i*4; const gray=.299*image.data[p]+.587*image.data[p+1]+.114*image.data[p+2];
    src[i]=Math.max(0,Math.min(255,(gray-128)*contrast+128+brightness));
  }
  const sharp = valueOf('#photoSharpness')/100;
  if(sharp>0){
    const copy=src.slice();
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x; const blur=(copy[i-w]+copy[i+w]+copy[i-1]+copy[i+1]+copy[i])/5;
      src[i]=Math.max(0,Math.min(255,copy[i]+(copy[i]-blur)*sharp*2.2));
    }
  }
  const threshold=valueOf('#photoThreshold');
  const mode=$('#photoDither').value;
  const out=new Uint8ClampedArray(w*h);
  if(mode==='floyd'){
    const work=src.slice();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x, old=work[i], val=old<threshold?0:255, err=old-val;out[i]=val;
      if(x+1<w)work[i+1]+=err*7/16;if(y+1<h){if(x>0)work[i+w-1]+=err*3/16;work[i+w]+=err*5/16;if(x+1<w)work[i+w+1]+=err/16;}
    }
  }else if(mode==='ordered'){
    const m=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;out[i]=src[i] < threshold + (m[y&3][x&3]-7.5)*7 ? 0:255;}
  }else{for(let i=0;i<src.length;i++)out[i]=src[i]<threshold?0:255;}
  const final=photoCtx.createImageData(w,h);
  for(let i=0;i<out.length;i++){const p=i*4;final.data[p]=final.data[p+1]=final.data[p+2]=out[i];final.data[p+3]=255;}
  photoCtx.putImageData(final,0,0);
  $('#photoZoomLabel').textContent=`${Math.round(photoState.scale*100)}%`;
  for(const [id,outId] of [['#photoBrightness','#photoBrightnessValue'],['#photoContrast','#photoContrastValue'],['#photoThreshold','#photoThresholdValue'],['#photoSharpness','#photoSharpnessValue']]) $(outId).textContent=$(id).value;
}

$('#photoInput').addEventListener('change', event => {
  const file=event.target.files?.[0]; event.target.value=''; if(!file)return;
  const image=new Image(); image.onload=()=>{photoImage=image;photoState={scale:1,x:0,y:0,rotation:0,flipH:1,flipV:1,dragging:false,px:0,py:0};renderPhoto();URL.revokeObjectURL(image.src);}; image.src=URL.createObjectURL(file);
});
['#photoFit','#photoDither','#photoBrightness','#photoContrast','#photoThreshold','#photoSharpness'].forEach(id=>$(id).addEventListener('input',renderPhoto));
$('#photoZoomIn').onclick=()=>{photoState.scale=Math.min(5,photoState.scale+.1);renderPhoto();};
$('#photoZoomOut').onclick=()=>{photoState.scale=Math.max(.2,photoState.scale-.1);renderPhoto();};
$('#photoRotateLeft').onclick=()=>{photoState.rotation-=90;renderPhoto();};
$('#photoRotateRight').onclick=()=>{photoState.rotation+=90;renderPhoto();};
$('#photoFlipH').onclick=()=>{photoState.flipH*=-1;renderPhoto();};
$('#photoFlipV').onclick=()=>{photoState.flipV*=-1;renderPhoto();};
$('#photoReset').onclick=()=>{photoState={scale:1,x:0,y:0,rotation:0,flipH:1,flipV:1,dragging:false,px:0,py:0};$('#photoBrightness').value=0;$('#photoContrast').value=120;$('#photoThreshold').value=145;$('#photoSharpness').value=35;renderPhoto();};
$('#photoAuto').onclick=()=>{$('#photoBrightness').value=5;$('#photoContrast').value=145;$('#photoThreshold').value=150;$('#photoSharpness').value=45;$('#photoDither').value='floyd';renderPhoto();};
photoCanvas.addEventListener('pointerdown',e=>{photoState.dragging=true;photoState.px=e.clientX;photoState.py=e.clientY;photoCanvas.setPointerCapture(e.pointerId);});
photoCanvas.addEventListener('pointermove',e=>{if(!photoState.dragging)return;const rect=photoCanvas.getBoundingClientRect();photoState.x+=(e.clientX-photoState.px)*212/rect.width;photoState.y+=(e.clientY-photoState.py)*104/rect.height;photoState.px=e.clientX;photoState.py=e.clientY;renderPhoto();});
photoCanvas.addEventListener('pointerup',()=>{photoState.dragging=false;});
$('#photoUpload').onclick=async()=>{try{if(!photoImage)throw new Error('Hãy chọn ảnh trước');log('Đang xử lý và gửi ảnh tĩnh');const packet=buildTnf1(canvasToBitplane(photoCanvas));await ble.uploadFace(packet);activeWarehouseId=0;localStorage.removeItem('tnvaWarehouseFace');log('Ảnh tĩnh đã lưu · màn hình sẽ không tự refresh');toast('Ảnh đang hiển thị trên đồng hồ','success');}catch(error){log(`Lỗi gửi ảnh: ${error.message}`);toast(error.message,'error');}};

const countdownCanvas=$('#countdownCanvas');
const countdownCtx=countdownCanvas.getContext('2d');
function countdownValues(){const target=new Date($('#countdownTarget').value);const diff=Math.max(0,target-Date.now());return{days:Math.floor(diff/86400000),hours:Math.floor(diff%86400000/3600000),minutes:Math.floor(diff%3600000/60000),target};}
function countdownTargetText(t){return Number.isNaN(t.getTime())?'--/--/---- --:--':`${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;}
function renderCountdown(){
 const {days,hours,minutes,target}=countdownValues(); const mode=$('#countdownMode').value; const custom=mode==='custom';
 $('.countdown-form').classList.toggle('default-mode',!custom);
 const title=($('#countdownTitle').value||'Sinh Nhật').slice(0,32); const framed=custom&&$('#countdownStyle').value==='frame'; const size=custom?Number($('#countdownSize').value):1;
 countdownCtx.fillStyle='#fff';countdownCtx.fillRect(0,0,212,104);countdownCtx.strokeStyle='#000';countdownCtx.lineWidth=1;countdownCtx.strokeRect(2,2,207,99);
 if(framed){countdownCtx.fillStyle='#000';countdownCtx.fillRect(2,2,207,16);countdownCtx.fillStyle='#fff';}else countdownCtx.fillStyle='#000';
 countdownCtx.textAlign='center';countdownCtx.textBaseline='top';
 countdownCtx.font='700 13px "Roboto Condensed",sans-serif';countdownCtx.fillText(title,106,custom?(framed?3:2):1);
 countdownCtx.fillStyle='#000';countdownCtx.font=`700 ${custom?[32,44,56][size]:56}px "Roboto Condensed",sans-serif`;countdownCtx.fillText(days>0?String(days):`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`,106,custom?(size===0?25:18):18);
 countdownCtx.font='700 10px "Roboto Condensed",sans-serif';let sub=custom?($('#countdownSubtitle').value||'').replace('{H}',String(hours).padStart(2,'0')).replace('{M}',String(minutes).padStart(2,'0')):`NGÀY - ${String(hours).padStart(2,'0')} GIỜ ${String(minutes).padStart(2,'0')} PHÚT`;countdownCtx.fillText(sub,106,77);
 if(!custom||$('#countdownShowTarget').checked){countdownCtx.font='500 8px "Noto Sans Mono",monospace';countdownCtx.fillText(countdownTargetText(target),106,92);}
 $('#countdownReadout').textContent=`${days} ngày ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
}
function makeCountdownPackage(){
 const target=new Date($('#countdownTarget').value);if(Number.isNaN(target.getTime()))throw new Error('Hãy chọn ngày và giờ đích');
 const custom=$('#countdownMode').value==='custom';const title=($('#countdownTitle').value||'Sinh Nhật').trim();const subtitle=custom?($('#countdownSubtitle').value||'').trim():'';
 const stamp=`${target.getFullYear()}${String(target.getMonth()+1).padStart(2,'0')}${String(target.getDate()).padStart(2,'0')}${String(target.getHours()).padStart(2,'0')}${String(target.getMinutes()).padStart(2,'0')}|${title}|${subtitle}`;
 const strings=new TextEncoder().encode(stamp); const c=document.createElement('canvas');c.width=212;c.height=104;const cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,212,104);
 let style=0;if(custom){style|=2;if($('#countdownStyle').value==='frame')style|=1;style|=(Number($('#countdownSize').value)&3)<<2;if($('#countdownShowTarget').checked)style|=0x20;}
 const d=new Uint8Array(16);d.set([10,1,1,0,5,4,202,96,50,7,0,0,strings.length,style,0,0]);return buildTnf2FromCanvas(c,[d],strings);
}
$('#countdownForm').addEventListener('submit',async e=>{e.preventDefault();try{log('Đang gửi đếm ngược');await ble.uploadFace(makeCountdownPackage());localStorage.setItem('tnvaCountdown',JSON.stringify({mode:$('#countdownMode').value,title:$('#countdownTitle').value,subtitle:$('#countdownSubtitle').value,target:$('#countdownTarget').value,style:$('#countdownStyle').value,size:$('#countdownSize').value,showTarget:$('#countdownShowTarget').checked}));log('Đếm ngược đã lưu');toast('Đã gửi vào đồng hồ','success');}catch(error){log(`Lỗi đếm ngược: ${error.message}`);toast(error.message,'error');}});
['#countdownMode','#countdownTitle','#countdownSubtitle','#countdownTarget','#countdownStyle','#countdownSize','#countdownShowTarget'].forEach(id=>$(id).addEventListener('input',renderCountdown));
const savedCountdown=JSON.parse(localStorage.getItem('tnvaCountdown')||'null');if(savedCountdown){$('#countdownMode').value=savedCountdown.mode||'default';$('#countdownTitle').value=savedCountdown.title||'Sinh Nhật';$('#countdownSubtitle').value=savedCountdown.subtitle||'NGÀY - {H} GIỜ {M} PHÚT';$('#countdownTarget').value=savedCountdown.target||'';$('#countdownStyle').value=savedCountdown.style||'clean';$('#countdownSize').value=savedCountdown.size||'1';$('#countdownShowTarget').checked=savedCountdown.showTarget!==false;}else{const d=new Date(Date.now()+7*86400000);d.setSeconds(0,0);$('#countdownTarget').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}setInterval(renderCountdown,30000);renderCountdown();renderPhoto();

editor.newProject('212x104');
updateZoom();
renderLayers();
setDeviceOffline();
renderWarehouseLibrary(true);


const previewParams = new URLSearchParams(location.search);
if (previewParams.get('offline') === '1') {
  openStudioOffline();
  const view = previewParams.get('view');
  if (view && ['main','library','designer','image','countdown'].includes(view)) showView(view);
}
