// ─────────────────────────────────────────────────────────────
// preload.js — 화면과 본체 사이의 "창구"
// 화면(note.js, list.js, capture.js, remind.js)은 여기서 열어 준 기능(window.memo.*)만 쓸 수 있어요.
// 화면이 컴퓨터 파일을 마음대로 건드리지 못하게 막는 보안 장치예요.
// ─────────────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('memo', {
  // 메모 하나
  get: id => ipcRenderer.invoke('note:get', id),
  update: (id, patch) => ipcRenderer.send('note:update', id, patch),
  create: fromId => ipcRenderer.send('note:new', fromId),
  close: id => ipcRenderer.send('note:close', id),
  remove: id => ipcRenderer.invoke('note:delete', id), // 휴지통으로
  toggleTop: id => ipcRenderer.invoke('note:toggleTop', id),
  saveImage: (bytes, ext) => ipcRenderer.invoke('image:save', bytes, ext),
  setOpacity: (id, value) => ipcRenderer.send('note:setOpacity', id, value),

  // 알림
  openRemind: id => ipcRenderer.send('note:openRemind', id),
  setRemind: (id, ms) => ipcRenderer.invoke('note:setRemind', id, ms),
  onRemind: fn => ipcRenderer.on('note:remind', (_e, ms) => fn(ms)),
  onAlarm: fn => ipcRenderer.on('note:alarm', (_e, at) => fn(at)),
  ackAlarm: id => ipcRenderer.send('note:ackAlarm', id),
  snooze: (id, minutes) => ipcRenderer.send('note:snooze', id, minutes),
  fitDialog: height => ipcRenderer.send('dialog:fit', height),

  // 메모 목록과 휴지통
  all: () => ipcRenderer.invoke('note:all'),
  show: id => ipcRenderer.send('note:show', id),
  showList: () => ipcRenderer.send('list:show'),
  onChanged: fn => ipcRenderer.on('notes:changed', () => fn()),
  restore: id => ipcRenderer.invoke('note:restore', id),
  purge: id => ipcRenderer.invoke('note:purge', id),
  emptyTrash: () => ipcRenderer.invoke('trash:empty'),

  // 📸 화면 캡처
  startCapture: () => ipcRenderer.send('capture:start'),
  captureImage: () => ipcRenderer.invoke('capture:image'),
  captureDone: rect => ipcRenderer.send('capture:done', rect),
  captureCancel: () => ipcRenderer.send('capture:cancel'),
})
