// ─────────────────────────────────────────────────────────────
// main.js — 앱의 "본체(메인 프로세스)"
// 창을 만들고, 메모와 사진을 파일로 저장하는 일을 맡아요.
// 화면(note.html, list.html)은 파일에 직접 손대지 못하고, 여기에 부탁만 해요. (보안)
// ─────────────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, protocol, net, Menu, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')

// 사진을 불러올 때 쓰는 전용 주소 형식: memo-img://img/파일이름.png
protocol.registerSchemesAsPrivileged([
  { scheme: 'memo-img', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// ── 저장 위치 ────────────────────────────────────────────────
// %APPDATA%\My Sticky 폴더 안에 notes.json(메모)과 images\(사진)를 둬요.
const dataDir = () => app.getPath('userData')
const notesFile = () => path.join(dataDir(), 'notes.json')
const imageDir = () => path.join(dataDir(), 'images')

const COLORS = {
  yellow: '#FFF4A3',
  green: '#CDEFC4',
  pink: '#FFD1DC',
  purple: '#E3D4FF',
  blue: '#CFE8FF',
  gray: '#ECECEC',
}

// 메모 하나: { id, html, color, x, y, w, h, onTop, open(창이 열려 있는지), updated(마지막 수정 시각) }
let notes = {}
const windows = new Map() // 메모id → 열린 메모 창
let listWin = null // 메모 목록 창

// ── 저장/불러오기 ────────────────────────────────────────────
function loadNotes() {
  try {
    notes = JSON.parse(fs.readFileSync(notesFile(), 'utf8'))
  } catch {
    notes = {}
  }
}

// 글자를 칠 때마다 저장하면 느려서, 0.3초 동안 조용하면 한 번에 저장해요.
let saveTimer
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 300)
}

// 임시 파일에 먼저 쓰고 바꿔치기 → 저장 도중 꺼져도 메모가 깨지지 않아요.
function saveNow() {
  clearTimeout(saveTimer)
  fs.mkdirSync(dataDir(), { recursive: true })
  const tmp = notesFile() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(notes, null, 2))
  fs.renameSync(tmp, notesFile())
  listWin?.webContents.send('notes:changed') // 목록 창도 새로 그리게 알려요
}

// 메모 html 안에서 쓰고 있는 사진 파일 이름들을 찾아요.
function imagesIn(html) {
  return [...(html || '').matchAll(/memo-img:\/\/img\/([\w.-]+)/g)].map(m => m[1])
}

// 앱을 켤 때, 어느 메모에서도 안 쓰는 사진 파일을 정리해요.
function cleanUnusedImages() {
  if (!fs.existsSync(imageDir())) return
  const used = new Set(Object.values(notes).flatMap(n => imagesIn(n.html)))
  for (const file of fs.readdirSync(imageDir())) {
    if (!used.has(file)) fs.rmSync(path.join(imageDir(), file), { force: true })
  }
}

// ── 메모 창 ──────────────────────────────────────────────────
function openWindow(note) {
  const win = new BrowserWindow({
    x: note.x,
    y: note.y,
    width: note.w,
    height: note.h,
    minWidth: 240,
    minHeight: 160,
    frame: false, // 윈도우 기본 제목줄 없이, 우리가 만든 막대를 써요
    alwaysOnTop: !!note.onTop,
    backgroundColor: COLORS[note.color] || COLORS.yellow,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  win.loadFile(path.join(__dirname, 'note.html'), { query: { id: note.id } })
  win.once('ready-to-show', () => win.show())

  // 창을 옮기거나 크기를 바꾸면 기억해 둬요.
  const remember = () => {
    if (!notes[note.id] || win.isMinimized()) return
    const b = win.getBounds()
    Object.assign(notes[note.id], { x: b.x, y: b.y, w: b.width, h: b.height })
    save()
  }
  win.on('moved', remember)
  win.on('resized', remember)
  win.on('closed', () => windows.delete(note.id))

  windows.set(note.id, win)
  return win
}

// 메모를 화면에 띄워요. 이미 열려 있으면 앞으로 가져오기만 해요.
function showNote(id) {
  const note = notes[id]
  if (!note) return
  const win = windows.get(id)
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
    return
  }
  note.open = true
  save()
  openWindow(note).focus()
}

function createNote(nearId) {
  const id = crypto.randomUUID()
  const near = nearId && windows.get(nearId)
  const b = near ? near.getBounds() : { x: 160, y: 160 }
  notes[id] = {
    id, html: '', color: 'yellow',
    x: b.x + 30, y: b.y + 30, w: 300, h: 300,
    onTop: false, open: true, updated: Date.now(),
  }
  save()
  openWindow(notes[id]).focus()
}

// ── 메모 목록 창 ─────────────────────────────────────────────
function showList() {
  if (listWin) {
    if (listWin.isMinimized()) listWin.restore()
    listWin.focus()
    return
  }
  listWin = new BrowserWindow({
    width: 360,
    height: 560,
    minWidth: 280,
    minHeight: 300,
    title: 'My Sticky',
    backgroundColor: '#F7F7F5',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  listWin.loadFile(path.join(__dirname, 'list.html'))
  listWin.once('ready-to-show', () => listWin.show())
  listWin.on('closed', () => (listWin = null))
}

// ── 화면이 부탁하는 일들 ─────────────────────────────────────
ipcMain.handle('note:get', (_e, id) => ({ ...notes[id], colors: COLORS }))

// 목록 창용: 모든 메모를 최근 수정 순서로
ipcMain.handle('note:all', () => ({
  colors: COLORS,
  notes: Object.values(notes).sort((a, b) => (b.updated || 0) - (a.updated || 0)),
}))

ipcMain.on('note:update', (_e, id, patch) => {
  const note = notes[id]
  if (!note) return
  if (typeof patch.html === 'string' && patch.html !== note.html) {
    note.html = patch.html
    note.updated = Date.now()
  }
  if (patch.color in COLORS && patch.color !== note.color) {
    note.color = patch.color
    note.updated = Date.now()
    windows.get(id)?.setBackgroundColor(COLORS[patch.color])
  }
  save()
})

ipcMain.on('note:new', (_e, fromId) => createNote(fromId))
ipcMain.on('note:show', (_e, id) => showNote(id))
ipcMain.on('list:show', () => showList())

// ✕ 버튼: 메모는 남겨 두고 창만 닫아요.
ipcMain.on('note:close', (_e, id) => {
  if (notes[id]) notes[id].open = false
  saveNow()
  // 마지막 메모를 닫으면 앱이 꺼지지 않게 목록 창을 먼저 띄워요.
  if (windows.size <= 1 && !listWin) showList()
  windows.get(id)?.close()
})

ipcMain.handle('note:delete', async (e, id) => {
  const parent = BrowserWindow.fromWebContents(e.sender)
  const { response } = await dialog.showMessageBox(parent, {
    type: 'question',
    buttons: ['삭제', '취소'],
    defaultId: 1,
    cancelId: 1,
    message: '이 메모를 삭제할까요?',
    detail: '삭제한 메모는 되돌릴 수 없어요.',
  })
  if (response !== 0) return false
  for (const file of imagesIn(notes[id]?.html)) fs.rmSync(path.join(imageDir(), file), { force: true })
  delete notes[id]
  saveNow()
  const win = windows.get(id)
  if (win) {
    if (windows.size <= 1 && !listWin) showList()
    win.close()
  }
  return true
})

ipcMain.handle('note:toggleTop', (_e, id) => {
  const note = notes[id]
  if (!note) return false
  note.onTop = !note.onTop
  windows.get(id)?.setAlwaysOnTop(note.onTop)
  save()
  return note.onTop
})

// 붙여 넣은 사진을 images 폴더에 파일로 저장하고, 불러올 주소를 돌려줘요.
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
ipcMain.handle('image:save', (_e, bytes, ext) => {
  const type = String(ext).toLowerCase()
  if (!IMAGE_TYPES.includes(type)) throw new Error('지원하지 않는 사진 형식이에요: ' + ext)
  fs.mkdirSync(imageDir(), { recursive: true })
  const name = `${crypto.randomUUID()}.${type}`
  fs.writeFileSync(path.join(imageDir(), name), Buffer.from(bytes))
  return `memo-img://img/${name}`
})

// ── 앱 시작 ──────────────────────────────────────────────────
// 앱을 또 실행하면, 이미 켜진 앱이 메모 목록을 보여줘요.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showList())

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)

    // memo-img:// 주소를 images 폴더의 실제 파일로 연결해요.
    protocol.handle('memo-img', req => {
      const name = path.basename(new URL(req.url).pathname)
      return net.fetch(pathToFileURL(path.join(imageDir(), name)).toString())
    })

    loadNotes()
    cleanUnusedImages()
    const all = Object.values(notes)
    const opened = all.filter(n => n.open !== false)
    if (all.length === 0) createNote()
    else if (opened.length === 0) showList()
    else opened.forEach(openWindow)
  })

  // 모든 창(메모와 목록)을 닫으면 앱이 꺼져요. 메모는 저장돼 있어요.
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', saveNow)
}
