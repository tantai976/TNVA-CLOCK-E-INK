import { FaceEditor, TYPE_LABELS, download } from './editor.js';
import { TnvaBle } from './ble.js';
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

const editor = new FaceEditor($('#designCanvas'), {
  onChange: project => {
    $('#designTitle').value = project.title || '';
    $('#designAuthor').value = project.author || '';
    $('#screenProfile').value = `${project.width}x${project.height}`;
    renderLayers();
  },
  onSelection: (_id, element, options = {}) => {
    renderInspector(element);
    renderLayers();
    $('#selectionInfo').textContent = element ? `${element.name} · ${Math.round(element.x)},${Math.round(element.y)} · ${Math.round(element.w)}×${Math.round(element.h)}` : 'Không chọn';
    if (options.editText && element?.type === 'text') requestAnimationFrame(() => $('#propText')?.focus());
  },
  onPackage: (bytes, max) => {
    const used = bytes / 1024;
    $('#packageInfo').textContent = max ? `${used.toFixed(1)} / ${(max/1024).toFixed(0)} KB` : `${used.toFixed(1)} KB`;
    $('#packageInfo').style.color = max && bytes > max ? 'var(--danger)' : '';
  }
});

function openStudioOffline() {
  connectGate.classList.add('hidden');
  appShell.classList.remove('hidden');
  setDeviceOffline();
  editor.setZoom(window.innerWidth < 700 ? 2 : 4);
  renderLocalLibrary();
}

function setDeviceOffline() {
  clearInterval(deviceTimer);
  deviceTimer = null;
  $('#deviceLabel').textContent = 'Ngoại tuyến';
  $('#deviceName').textContent = 'Chưa kết nối';
  $('#deviceVoltage').textContent = '--';
  $('#deviceTime').textContent = '--';
  $('#deviceState').textContent = 'Ngoại tuyến';
  document.querySelector('.device-pill')?.classList.remove('connected');
  updateWarehouseInstallState();
}

async function unlockApp(status) {
  if (!status.name?.startsWith(DEVICE.namePrefix)) throw new Error('Sai thiết bị');
  connectGate.classList.add('hidden');
  appShell.classList.remove('hidden');
  $('#deviceLabel').textContent = status.name;
  $('#deviceName').textContent = status.name;
  document.querySelector('.device-pill')?.classList.add('connected');
  updateDeviceStatus(status);
  clearInterval(deviceTimer);
  deviceTimer = setInterval(async () => {
    try { updateDeviceStatus(await ble.readStatus()); } catch { /* disconnected handler */ }
  }, 5000);
  editor.setZoom(window.innerWidth < 700 ? 2 : 4);
  await renderLocalLibrary();
}

function updateDeviceStatus(status) {
  const time = status.time;
  $('#deviceName').textContent = status.name || '--';
  $('#deviceVoltage').textContent = status.voltage == null ? '--' : `${status.voltage.toFixed(2)} V`;
  $('#deviceTime').textContent = time?.year ? `${String(time.day).padStart(2,'0')}/${String((time.month ?? 0)+1).padStart(2,'0')}/${time.year} ${String(time.hour).padStart(2,'0')}:${String(time.minute).padStart(2,'0')}:${String(time.second).padStart(2,'0')}` : '--';
  const faceInfo = time?.faceCount ? ` · ${time.faceCount} mặt` : '';
  $('#deviceState').textContent = `Đã kết nối${faceInfo}`;
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
    button.disabled = false;
    button.textContent = 'Kết nối đồng hồ';
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

$$('[data-add]').forEach(button => button.addEventListener('click', () => editor.addElement(button.dataset.add)));
$('#imageInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try { await editor.addImage(file); toast('Đã chèn ảnh', 'success'); } catch (error) { toast(error.message, 'error'); }
});
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
    options.step != null ? `step="${options.step}"` : ''
  ].filter(Boolean).join(' ');
  return `<div class="prop ${options.full ? 'full' : ''}"><label>${label}</label><input ${attrs}></div>`;
}
function selectField(label, key, value, items, full = false) {
  return `<div class="prop ${full ? 'full' : ''}"><label>${label}</label><select data-prop="${key}">${items.map(([id,name]) => `<option value="${escapeHtml(id)}" ${String(value)===String(id)?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></div>`;
}

function renderInspector(element) {
  const empty = $('#emptyInspector');
  const form = $('#propertyForm');
  if (!element) { empty.classList.remove('hidden'); form.classList.add('hidden'); form.innerHTML = ''; return; }
  empty.classList.add('hidden'); form.classList.remove('hidden');
  let html = field('Tên', 'name', element.name || '', 'text', { full:true }) +
    field('X', 'x', Math.round(element.x), 'number', { step:1 }) + field('Y', 'y', Math.round(element.y), 'number', { step:1 }) +
    field('Rộng', 'w', Math.round(element.w), 'number', { min:1 }) + field('Cao', 'h', Math.round(element.h), 'number', { min:1 });

  if (['text','time','date','weekday','lunar','voltage'].includes(element.type)) {
    html += selectField('Font', 'font', element.font, [['pixel','Pixel'],['sans','Sans'],['condensed','Condensed'],['mono','Mono'],['serif','Serif']]) +
      field('Cỡ chữ', 'fontSize', element.fontSize, 'number', { min:5,max:80 }) +
      selectField('Đậm', 'weight', element.weight, [['400','Regular'],['600','Semi Bold'],['700','Bold'],['800','Extra Bold']]) +
      selectField('Canh', 'align', element.align, [['left','Trái'],['center','Giữa'],['right','Phải']]);
    if (element.type === 'text') html += `<div class="prop full"><label>Nội dung</label><textarea id="propText" data-prop="text">${escapeHtml(element.text || '')}</textarea></div>`;
    else html += field('Mẫu hiển thị', 'format', element.format || '', 'text', { full:true });
    if (element.type === 'time') html += `<label class="checkbox-row full"><input data-prop="showSeconds" type="checkbox" ${element.showSeconds?'checked':''}>Hiện giây</label>`;
  }
  if (element.type === 'image') {
    html += field('Phóng ảnh', 'imageScale', element.imageScale || 1, 'range', { min:.05,max:5,step:.01,full:true }) +
      field('Lệch X', 'imageOffsetX', element.imageOffsetX || 0, 'number', { step:1 }) + field('Lệch Y', 'imageOffsetY', element.imageOffsetY || 0, 'number', { step:1 }) +
      field('Ngưỡng', 'threshold', element.threshold || 150, 'range', { min:0,max:255,step:1,full:true }) +
      field('Tương phản', 'contrast', element.contrast || 1.15, 'range', { min:.3,max:3,step:.05,full:true }) +
      selectField('Dither', 'dither', element.dither, [['ordered','Ordered'],['floyd','Floyd'],['none','Không']], true) +
      `<label class="checkbox-row full"><input data-prop="invert" type="checkbox" ${element.invert?'checked':''}>Đảo màu</label>` +
      `<div class="full action-group"><button id="fitImageBtn" class="btn">Fit</button><button id="fillImageBtn" class="btn">Fill</button><button id="resetImageBtn" class="btn">Đặt lại</button></div>`;
  }
  if (element.type === 'line' || element.type === 'rect') html += field('Độ dày', 'lineWidth', element.lineWidth || 1, 'number', { min:1,max:8,full:true });
  html += `<label class="checkbox-row full"><input data-prop="visible" type="checkbox" ${element.visible?'checked':''}>Hiển thị</label>`;
  form.innerHTML = html;
  form.querySelectorAll('[data-prop]').forEach(control => {
    const handler = () => {
      let value;
      if (control.type === 'checkbox') value = control.checked;
      else if (control.type === 'number' || control.type === 'range') value = Number(control.value);
      else value = control.value;
      editor.updateSelected({ [control.dataset.prop]: value });
    };
    control.addEventListener(control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input', handler);
  });
  $('#fitImageBtn')?.addEventListener('click', () => fitImage(false));
  $('#fillImageBtn')?.addEventListener('click', () => fitImage(true));
  $('#resetImageBtn')?.addEventListener('click', () => editor.updateSelected({ imageScale:1,imageOffsetX:0,imageOffsetY:0 }));
}

function fitImage(fill) {
  const element = editor.selected;
  if (!element || element.type !== 'image' || !element.sourceW || !element.sourceH) return;
  const fit = Math.min(element.w / element.sourceW, element.h / element.sourceH);
  const cover = Math.max(element.w / element.sourceW, element.h / element.sourceH);
  editor.updateSelected({ imageScale: fill ? cover : fit, imageOffsetX:0, imageOffsetY:0 });
}

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
function layerIcon(type) { return ({text:'T',time:'⌚',date:'日',weekday:'T2',lunar:'ÂL',voltage:'V',battery:'▰',analog:'◷',image:'Ả',line:'／',rect:'□'})[type] || '•'; }

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
    await ble.uploadFace(compiled.packageBytes, value => { const bar=$('#installProgress'); if(bar) bar.style.width=`${value}%`; });
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
  if (!response.ok) throw new Error('Không tải được kho 123 giao diện');
  const data = await response.json();
  warehouseRows = Array.isArray(data.items) ? data.items : [];
  return warehouseRows;
}

async function renderWarehouseLibrary() {
  const root = $('#warehouseLibrary');
  root.innerHTML = '<div class="empty-state panel">Đang tải kho 123</div>';
  try {
    const rows = await loadWarehouseRows();
    const query = normalizeSearch($('#librarySearch').value);
    const filtered = rows.filter(row => !query || normalizeSearch(`${row.title} ${row.author} ${row.id}`).includes(query));
    root.innerHTML = filtered.length ? filtered.map(warehouseCard).join('') : '<div class="empty-state panel">Không tìm thấy giao diện</div>';
    bindWarehouseCards(root);
  } catch (error) {
    root.innerHTML = `<div class="empty-state panel">${escapeHtml(error.message)}</div>`;
  }
}

function warehouseCard(row) {
  return `<article class="design-card warehouse-card" data-warehouse="${row.id}">
    <div class="card-preview"><img loading="lazy" src="warehouse/${escapeHtml(row.preview)}" alt=""></div>
    <div class="card-body"><div class="card-title">${escapeHtml(row.title || 'Không tên')}<span class="warehouse-badge">#${row.id}</span></div>
    <div class="card-meta">${escapeHtml(row.author || 'Ẩn danh')} · ${row.dynamicCount || 0} vùng động · ${Math.round((row.packageBytes||0)/1024*10)/10} KB</div>
    <div class="card-actions"><button class="btn primary" data-install>Cài</button><button class="btn" data-download>Tải gói</button></div>
    <div class="mini-progress"><span></span></div></div></article>`;
}

function bindWarehouseCards(root) {
  root.querySelectorAll('[data-warehouse]').forEach(card => {
    const row = warehouseRows.find(item => String(item.id) === String(card.dataset.warehouse));
    if (!row) return;
    const install = card.querySelector('[data-install]');
    install.disabled = !ble.connected;
    install.onclick = async () => {
      card.classList.add('installing');
      install.disabled = true;
      install.textContent = 'Đang gửi';
      const bar = card.querySelector('.mini-progress span');
      try {
        const response = await fetch(`warehouse/${row.package}`);
        if (!response.ok) throw new Error('Không tải được gói giao diện');
        const bytes = new Uint8Array(await response.arrayBuffer());
        await ble.uploadFace(bytes, value => { bar.style.width = `${value}%`; });
        install.textContent = 'Đã cài';
        toast('Đã lưu giao diện vào đồng hồ', 'success');
      } catch (error) {
        install.textContent = 'Cài lại';
        toast(error.message, 'error');
      } finally {
        card.classList.remove('installing');
        install.disabled = !ble.connected;
      }
    };
    card.querySelector('[data-download]').onclick = async () => {
      const response = await fetch(`warehouse/${row.package}`);
      if (!response.ok) return toast('Không tải được gói', 'error');
      download(`${String(row.id).padStart(3,'0')}-${slug(row.title)}.tnvafacebin`, await response.blob());
    };
  });
}

function updateWarehouseInstallState() {
  document.querySelectorAll('[data-install]').forEach(button => { button.disabled = !ble.connected; });
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
$('#librarySearch').addEventListener('input', renderActiveLibrary);

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

editor.newProject('212x104');
updateZoom();
renderLayers();
setDeviceOffline();
