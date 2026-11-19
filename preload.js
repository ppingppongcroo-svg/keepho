// ─────────────────────────────────────────────────────────────
// preload.js — 화면과 본체 사이의 "창구"
// 화면(note.js, list.js)은 여기서 열어 준 기능(window.memo.*)만 쓸 수 있어요.
// 화면이 컴퓨터 파일을 마음대로 건드리지 못하게 막는 보안 장치예요.
// ─────────────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('memo', {
  // 메모 하나
  get: id => ipcRenderer.invoke('note:get', id),
  update: (id, patch) => ipcRenderer.send('note:update', id, patch),
  create: fromId => ipcRenderer.send('note:new', fromId),
  close: id => ipcRenderer.send('note:close', id),
  remove: id => ipcRenderer.invoke('note:delete', id),
  toggleTop: id => ipcRenderer.invoke('note:toggleTop', id),
  saveImage: (bytes, ext) => ipcRenderer.invoke('image:save', bytes, ext),

  // 메모 목록
  all: () => ipcRenderer.invoke('note:all'),
  show: id => ipcRenderer.send('note:show', id),
  showList: () => ipcRenderer.send('list:show'),
  onChanged: fn => ipcRenderer.on('notes:changed', () => fn()),
})
