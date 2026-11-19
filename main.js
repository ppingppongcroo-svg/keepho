// ─────────────────────────────────────────────────────────────
// main.js — 앱의 "본체(메인 프로세스)"
// 창을 만들고, 메모와 사진을 파일로 저장하고, 알림과 화면 캡처를 맡아요.
// 화면(note.html, list.html, capture.html)은 파일에 직접 손대지 못하고, 여기에 부탁만 해요. (보안)
// ─────────────────────────────────────────────────────────────
const {
  app, BrowserWindow, ipcMain, protocol, net, Menu, dialog,
  Notification, globalShortcut, desktopCapturer, screen,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')

// 사진을 불러올 때 쓰는 전용 주소 형식: memo-img://img/파일이름.png
protocol.registerSchemesAsPrivileged([
  { scheme: 'memo-img', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// 윈도우 알림에 표시될 앱 이름표
app.setAppUserModelId(app.isPackaged ? 'com.ppingppong.keepho' : process.execPath)

// ── 설정값 ───────────────────────────────────────────────────
const TRASH_DAYS = 30 // 휴지통 보관 기간
const CAPTURE_KEY = 'Ctrl+Alt+S' // 화면 캡처 단축키 (어느 프로그램에서든)
const REMIND_CHECK_MS = 15 * 1000 // 알림 시간을 확인하는 간격

// ── 저장 위치 ────────────────────────────────────────────────
// %APPDATA%\Keepho 폴더 안에 notes.json(메모)과 images\(사진)를 둬요.
const dataDir = () => app.getPath('userData')
const notesFile = () => path.join(dataDir(), 'notes.json')
const imageDir = () => path.join(dataDir(), 'images')

// 예전 이름(My Sticky) 시절의 메모를 새 폴더로 복사해 와요. (새 폴더가 비어 있을 때 한 번만)
// 옮기지 않고 복사하니까, 예전 폴더는 백업처럼 그대로 남아요.
function bringOldNotes() {
  const oldDir = path.join(app.getPath('appData'), 'My Sticky')
  if (fs.existsSync(notesFile()) || !fs.existsSync(path.join(oldDir, 'notes.json'))) return
  fs.mkdirSync(dataDir(), { recursive: true })
  if (fs.existsSync(path.join(oldDir, 'images'))) {
    fs.cpSync(path.join(oldDir, 'images'), imageDir(), { recursive: true })
  }
  fs.copyFileSync(path.join(oldDir, 'notes.json'), notesFile())
}

const COLORS = {
  yellow: '#FFF4A3',
  green: '#CDEFC4',
  pink: '#FFD1DC',
  purple: '#E3D4FF',
  blue: '#CFE8FF',
  gray: '#ECECEC',
}

// 메모 하나: { id, html, color, x, y, w, h, onTop,
//            open(창이 열려 있는지), updated(마지막 수정 시각),
//            remind(알림 시각, 없으면 null), deleted(휴지통에 들어간 시각, 없으면 없음) }
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

// 메모 html에서 글자만 뽑아요. (알림 내용에 써요)
function textOf(html) {
  return (html || '')
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

// 사진 데이터를 images 폴더에 파일로 저장하고, 불러올 주소를 돌려줘요.
function saveImageFile(bytes, ext) {
  fs.mkdirSync(imageDir(), { recursive: true })
  const name = `${crypto.randomUUID()}.${ext}`
  fs.writeFileSync(path.join(imageDir(), name), Buffer.from(bytes))
  return `memo-img://img/${name}`
}

// 메모를 완전히 지워요. (사진 파일까지)
function purgeNote(id) {
  for (const file of imagesIn(notes[id]?.html)) fs.rmSync(path.join(imageDir(), file), { force: true })
  delete notes[id]
}

// 앱을 켤 때: 30일 지난 휴지통 메모를 비우고, 어디에도 안 쓰는 사진을 정리해요.
function cleanUp() {
  const limit = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000
  for (const note of Object.values(notes)) {
    if (note.deleted && note.deleted < limit) purgeNote(note.id)
  }
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
    minWidth: 260,
    minHeight: 160,
    frame: false, // 윈도우 기본 제목줄 없이, 우리가 만든 막대를 써요
    alwaysOnTop: !!note.onTop || !!note.alarming,
    opacity: note.opacity ?? 1,
    backgroundColor: COLORS[note.color] || COLORS.yellow,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      autoplayPolicy: 'no-user-gesture-required', // 알림음이 바로 울리게
    },
  })
  win.loadFile(path.join(__dirname, 'note.html'), { query: { id: note.id } })
  win.once('ready-to-show', () => {
    win.show()
    if (note.alarming) win.flashFrame(true) // 울리는 중이던 알림이면 계속 깜빡
  })

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
  if (!note || note.deleted) return
  const win = windows.get(id)
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return
  }
  note.open = true
  save()
  openWindow(note).focus()
}

function createNote(nearId, init = {}) {
  const id = crypto.randomUUID()
  const near = nearId && windows.get(nearId)
  const b = near ? near.getBounds() : { x: 160, y: 160 }
  notes[id] = {
    id, html: '', color: 'yellow',
    x: b.x + 30, y: b.y + 30, w: 300, h: 300,
    onTop: false, open: true, remind: null, updated: Date.now(),
    ...init,
  }
  save()
  openWindow(notes[id]).focus()
}

// 메모 창을 닫아요. 마지막 창이면 앱이 꺼지지 않게 목록 창을 먼저 띄워요.
function closeNoteWindow(id) {
  const win = windows.get(id)
  if (!win) return
  if (windows.size <= 1 && !listWin) showList()
  win.close()
}

// ── 메모 목록 창 ─────────────────────────────────────────────
function showList() {
  if (listWin) {
    if (listWin.isMinimized()) listWin.restore()
    listWin.focus()
    return
  }
  listWin = new BrowserWindow({
    width: 380,
    height: 580,
    minWidth: 300,
    minHeight: 320,
    title: 'Keepho',
    backgroundColor: '#F7F7F5',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  listWin.loadFile(path.join(__dirname, 'list.html'))
  listWin.once('ready-to-show', () => listWin.show())
  listWin.on('closed', () => (listWin = null))
}

// ── ⏰ 알림 ──────────────────────────────────────────────────
// 15초마다 시간이 된 알림이 있는지 확인해요.
// 앱이 꺼져 있는 동안 지나간 알림은 앱을 켤 때 바로 울려요.
function checkReminders() {
  const now = Date.now()
  for (const note of Object.values(notes)) {
    if (!note.deleted && note.remind && note.remind <= now) fireReminder(note)
  }
}

// 알림이 울리면 note.alarming에 울린 시각을 적어 둬요.
// [확인]을 누를 때까지 메모가 맨 위에 고정되고, 깜빡이고, 1분마다 소리가 나요.
// 앱을 껐다 켜도 alarming이 남아 있으면 다시 울려요.
function fireReminder(note) {
  note.alarming = note.remind
  note.remind = null
  save()
  showNote(note.id)
  const win = windows.get(note.id)
  if (win) {
    win.setAlwaysOnTop(true, 'floating')
    win.flashFrame(true) // 작업 표시줄에서 깜빡깜빡
    win.webContents.send('note:remind', null) // 막대의 알림 칩 지우기
    win.webContents.send('note:alarm', note.alarming) // 깜빡임 + 소리 시작
  }

  if (Notification.isSupported()) {
    const toast = new Notification({
      title: 'Keepho 알림',
      body: textOf(note.html).slice(0, 120) || '(사진 메모)',
    })
    toast.on('click', () => showNote(note.id))
    toast.show()
  }
}

// 알림을 멈추고 원래대로 (확인 / 10분 뒤 다시 / 휴지통)
function stopAlarm(note) {
  if (!note.alarming) return
  note.alarming = null
  const win = windows.get(note.id)
  if (win) {
    win.setAlwaysOnTop(!!note.onTop)
    win.flashFrame(false)
    win.webContents.send('note:alarm', null)
  }
}

// ── 알림 설정 창 ─────────────────────────────────────────────
// 메모 옆에 뜨는 작은 창이에요. 창 자체는 투명하고 안에 카드를 그려요.
let remindWin = null

function openRemind(id) {
  const parent = windows.get(id)
  if (!parent) return
  if (remindWin) {
    remindWin.focus()
    return
  }
  const W = 372
  const H = 680 // 내용을 그린 뒤 실제 높이로 맞춰요 (dialog:fit)
  remindWin = new BrowserWindow({
    width: W,
    height: H,
    parent,
    modal: true, // 설정 창이 떠 있는 동안 메모는 잠깐 멈춰요
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  placeBeside(remindWin, parent, W, H)
  remindWin.loadFile(path.join(__dirname, 'remind.html'), { query: { id } })
  // 혹시 크기 맞추기가 늦어져도 1초 뒤엔 보여줘요.
  const fallback = setTimeout(() => remindWin?.show(), 1000)
  remindWin.on('closed', () => {
    clearTimeout(fallback)
    remindWin = null
  })
}

// 창을 메모 오른쪽에 붙여요. 자리가 없으면 왼쪽, 그래도 없으면 화면 가운데.
function placeBeside(win, parent, W, H) {
  const pb = parent.getBounds()
  const area = screen.getDisplayMatching(pb).workArea
  let x = pb.x + pb.width + 4
  if (x + W > area.x + area.width) x = pb.x - W - 4
  if (x < area.x) x = Math.round(area.x + (area.width - W) / 2)
  const y = Math.max(area.y, Math.min(pb.y - 14, area.y + area.height - H))
  win.setBounds({ x, y, width: W, height: H })
}

ipcMain.on('dialog:fit', (e, height) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win || win !== remindWin) return
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  const H = Math.min(Math.ceil(height), area.height)
  const parent = win.getParentWindow()
  if (parent) placeBeside(win, parent, win.getBounds().width, H)
  win.show()
})

ipcMain.on('note:openRemind', (_e, id) => openRemind(id))

ipcMain.on('note:ackAlarm', (_e, id) => {
  if (!notes[id]) return
  stopAlarm(notes[id])
  save()
})

// 10분 뒤 다시
ipcMain.on('note:snooze', (_e, id, minutes) => {
  const note = notes[id]
  if (!note) return
  stopAlarm(note)
  note.remind = Date.now() + (Number(minutes) || 10) * 60 * 1000
  save()
  windows.get(id)?.webContents.send('note:remind', note.remind)
})

// 투명도 (40% ~ 100%)
ipcMain.on('note:setOpacity', (_e, id, value) => {
  const note = notes[id]
  if (!note) return
  note.opacity = Math.min(1, Math.max(0.4, Number(value) || 1))
  windows.get(id)?.setOpacity(note.opacity)
  save()
})

// ── 📸 화면 캡처 ─────────────────────────────────────────────
// 1) 마우스가 있는 모니터를 통째로 찍고
// 2) 그 사진을 화면 전체에 띄운 창(capture.html)에서 영역을 고르게 한 뒤
// 3) 고른 부분만 잘라서 새 메모로 만들어요.
let captureWin = null
let captureShot = null // { image, display }

async function startCapture() {
  if (captureWin) return
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const sf = display.scaleFactor
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * sf),
      height: Math.round(display.size.height * sf),
    },
  })
  const source = sources.find(s => s.display_id === String(display.id)) || sources[0]
  if (!source) return

  captureShot = { image: source.thumbnail, display }
  captureWin = new BrowserWindow({
    ...display.bounds,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  captureWin.setAlwaysOnTop(true, 'screen-saver')
  captureWin.setBounds(display.bounds)
  captureWin.loadFile(path.join(__dirname, 'capture.html'))
  captureWin.once('ready-to-show', () => {
    captureWin.show()
    captureWin.focus()
  })
  captureWin.on('closed', () => {
    captureWin = null
    captureShot = null
  })
}

// 캡처 창에 보여줄 화면 사진 (가볍게 JPG로)
ipcMain.handle('capture:image', () =>
  captureShot ? 'data:image/jpeg;base64,' + captureShot.image.toJPEG(85).toString('base64') : null,
)

// 영역을 다 골랐을 때: 원본에서 그 부분만 잘라 새 메모로
ipcMain.on('capture:done', (_e, rect) => {
  if (!captureShot) return
  const { image, display } = captureShot
  const size = image.getSize()
  const sx = size.width / display.bounds.width // 화면 배율(125%, 150% 등) 맞추기
  const sy = size.height / display.bounds.height
  const png = image
    .crop({
      x: Math.round(rect.x * sx),
      y: Math.round(rect.y * sy),
      width: Math.max(1, Math.round(rect.w * sx)),
      height: Math.max(1, Math.round(rect.h * sy)),
    })
    .toPNG()
  captureWin?.close()

  const url = saveImageFile(png, 'png')
  const w = Math.min(Math.max(rect.w + 30, 260), 560)
  const h = Math.min(Math.max(Math.round((rect.h * (w - 30)) / rect.w) + 110, 200), 720)
  createNote(null, {
    html: `<img src="${url}" alt=""><div><br></div>`,
    x: display.bounds.x + rect.x,
    y: display.bounds.y + rect.y,
    w,
    h,
  })
})

ipcMain.on('capture:cancel', () => captureWin?.close())
ipcMain.on('capture:start', () => startCapture())

// ── 화면이 부탁하는 일들 ─────────────────────────────────────
ipcMain.handle('note:get', (_e, id) => ({ ...notes[id], colors: COLORS }))

// 목록 창용: 모든 메모(휴지통 포함)를 최근 수정 순서로
ipcMain.handle('note:all', () => ({
  colors: COLORS,
  trashDays: TRASH_DAYS,
  captureKey: CAPTURE_KEY,
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
  closeNoteWindow(id)
})

// 🗑 버튼: 휴지통으로 옮겨요. (30일 동안 복원 가능)
ipcMain.handle('note:delete', (_e, id) => {
  const note = notes[id]
  if (!note) return false
  stopAlarm(note)
  note.deleted = Date.now()
  note.open = false
  saveNow()
  closeNoteWindow(id)
  return true
})

// 휴지통에서 되살리기
ipcMain.handle('note:restore', (_e, id) => {
  const note = notes[id]
  if (!note) return false
  delete note.deleted
  saveNow()
  showNote(id)
  return true
})

// 휴지통에서 영구 삭제 (한 번 더 확인)
ipcMain.handle('note:purge', async (e, id) => {
  const { response } = await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), {
    type: 'warning',
    buttons: ['영구 삭제', '취소'],
    defaultId: 1,
    cancelId: 1,
    message: '이 메모를 완전히 삭제할까요?',
    detail: '사진까지 지워지고, 되돌릴 수 없어요.',
  })
  if (response !== 0) return false
  purgeNote(id)
  saveNow()
  return true
})

ipcMain.handle('trash:empty', async e => {
  const trashed = Object.values(notes).filter(n => n.deleted)
  if (trashed.length === 0) return false
  const { response } = await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), {
    type: 'warning',
    buttons: ['휴지통 비우기', '취소'],
    defaultId: 1,
    cancelId: 1,
    message: `휴지통의 메모 ${trashed.length}개를 완전히 삭제할까요?`,
    detail: '사진까지 지워지고, 되돌릴 수 없어요.',
  })
  if (response !== 0) return false
  trashed.forEach(n => purgeNote(n.id))
  saveNow()
  return true
})

ipcMain.handle('note:toggleTop', (_e, id) => {
  const note = notes[id]
  if (!note) return false
  note.onTop = !note.onTop
  windows.get(id)?.setAlwaysOnTop(note.onTop || !!note.alarming) // 울리는 중엔 계속 위에
  save()
  return note.onTop
})

// ⏰ 알림 시각 정하기 (null이면 해제)
ipcMain.handle('note:setRemind', (_e, id, ms) => {
  const note = notes[id]
  if (!note) return null
  note.remind = Number.isFinite(ms) && ms > Date.now() ? ms : null
  save()
  windows.get(id)?.webContents.send('note:remind', note.remind) // 메모 막대의 알림 칩 갱신
  return note.remind
})

// 붙여 넣은 사진을 images 폴더에 파일로 저장해요.
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
ipcMain.handle('image:save', (_e, bytes, ext) => {
  const type = String(ext).toLowerCase()
  if (!IMAGE_TYPES.includes(type)) throw new Error('지원하지 않는 사진 형식이에요: ' + ext)
  return saveImageFile(bytes, type)
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

    bringOldNotes()
    loadNotes()
    cleanUp()
    const alive = Object.values(notes).filter(n => !n.deleted)
    const opened = alive.filter(n => n.open !== false)
    if (alive.length === 0) createNote()
    else if (opened.length === 0) showList()
    else opened.forEach(openWindow)

    // 화면 캡처 단축키 (다른 프로그램이 이미 쓰고 있으면 등록되지 않아요)
    if (!globalShortcut.register(CAPTURE_KEY, startCapture)) {
      console.warn(`캡처 단축키 ${CAPTURE_KEY}를 등록하지 못했어요.`)
    }

    // 알림 확인 시작 (켜자마자 한 번, 그 뒤로 15초마다)
    setTimeout(checkReminders, 2000)
    setInterval(checkReminders, REMIND_CHECK_MS)
  })

  // 모든 창(메모와 목록)을 닫으면 앱이 꺼져요. 메모는 저장돼 있어요.
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', saveNow)
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
