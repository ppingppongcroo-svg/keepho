// ─────────────────────────────────────────────────────────────
// note.js — 메모 창 하나의 동작
// 글쓰기, 사진 붙여넣기, 버튼 누르기를 처리하고
// 바뀐 내용은 window.memo.* 창구를 통해 본체(main.js)에 저장을 부탁해요.
// ─────────────────────────────────────────────────────────────
const id = new URLSearchParams(location.search).get('id')
const $ = sel => document.querySelector(sel)
const editor = $('#editor')
let colors = {}

// ── 처음 열 때: 저장된 내용 불러오기 ─────────────────────────
async function start() {
  const note = await window.memo.get(id)
  colors = note.colors
  editor.innerHTML = note.html || ''
  applyColor(note.color)
  $('#pin').classList.toggle('on', !!note.onTop)
  buildSwatches(note.color)
  showOpacity(Math.round((note.opacity ?? 1) * 100))
  showRemind(note.remind)
  if (note.alarming) startAlarm(note.alarming)
  editor.focus()
}

function applyColor(name) {
  document.documentElement.style.setProperty('--paper', colors[name] || colors.yellow)
}

// 시각을 "오후 3:30" 또는 "11월 20일 오전 9:00"처럼 보기 좋게
function formatTime(ms) {
  const d = new Date(ms)
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) + ' ' + time
}

// ── 글을 쓰면 저장 (0.4초 동안 멈추면 한 번) ─────────────────
let typingTimer
editor.addEventListener('input', () => {
  clearTimeout(typingTimer)
  typingTimer = setTimeout(() => window.memo.update(id, { html: editor.innerHTML }), 400)
})
// 아직 저장 안 된 내용을 바로 저장
const flush = () => {
  clearTimeout(typingTimer)
  window.memo.update(id, { html: editor.innerHTML })
}
window.addEventListener('beforeunload', flush)

// ── 사진 넣기 ────────────────────────────────────────────────
// 사진을 파일로 저장한 뒤, 커서 위치에 <img>를 넣어요.
async function insertImages(files) {
  for (const file of files) {
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const url = await window.memo.saveImage(bytes, ext)
      document.execCommand('insertHTML', false, `<img src="${url}" alt=""><br>`)
    } catch (err) {
      alert('사진을 넣지 못했어요.\n' + err.message)
    }
  }
}

const imageFilesOf = list => [...(list || [])].filter(f => f.type.startsWith('image/'))

editor.addEventListener('paste', e => {
  const images = imageFilesOf(e.clipboardData.files)
  e.preventDefault()
  if (images.length) {
    insertImages(images)
  } else {
    // 웹에서 복사한 글의 복잡한 서식은 빼고 글자만 붙여 넣어요.
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }
})

editor.addEventListener('dragover', e => e.preventDefault())
editor.addEventListener('drop', e => {
  const images = imageFilesOf(e.dataTransfer.files)
  if (!images.length) return
  e.preventDefault()
  // 놓은 위치로 커서를 옮긴 뒤 넣어요.
  const range = document.caretRangeFromPoint(e.clientX, e.clientY)
  if (range) {
    const sel = getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }
  insertImages(images)
})

// ── 위 막대 버튼 ─────────────────────────────────────────────
$('#new').onclick = () => window.memo.create(id)
$('#list').onclick = () => window.memo.showList()
$('#del').onclick = () => {
  flush()
  window.memo.remove(id) // 휴지통으로 (30일 동안 복원 가능)
}
$('#close').onclick = () => {
  flush()
  window.memo.close(id)
}
$('#pin').onclick = async () => $('#pin').classList.toggle('on', await window.memo.toggleTop(id))

// ── 색상 · 투명도 카드 ───────────────────────────────────────
const lookPop = $('#lookPop')

function setPopover(open) {
  lookPop.hidden = !open
  $('#look').classList.toggle('on', open)
  document.body.classList.toggle('popover-open', open)
}
$('#look').onclick = e => {
  e.stopPropagation()
  setPopover(lookPop.hidden)
}
// 카드 바깥을 누르거나 Esc를 누르면 닫혀요.
document.addEventListener('mousedown', e => {
  if (!lookPop.hidden && !lookPop.contains(e.target) && !$('#look').contains(e.target)) setPopover(false)
})
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !lookPop.hidden) setPopover(false)
})

const COLOR_NAMES = { yellow: '노랑', green: '초록', pink: '분홍', purple: '보라', blue: '파랑', gray: '회색' }
function buildSwatches(current) {
  const box = $('#swatches')
  for (const [name, hex] of Object.entries(colors)) {
    const swatch = document.createElement('button')
    swatch.style.background = hex
    swatch.title = COLOR_NAMES[name] || name
    swatch.innerHTML = iconSvg('check')
    swatch.classList.toggle('on', name === current)
    swatch.onclick = () => {
      applyColor(name)
      window.memo.update(id, { color: name })
      box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === swatch))
    }
    box.append(swatch)
  }
}

// 투명도 슬라이더: 움직이는 동안 바로바로 반영돼요.
function showOpacity(percent) {
  const slider = $('#opacity')
  slider.value = percent
  $('#opacityValue').textContent = percent + '%'
  const fill = ((percent - slider.min) / (slider.max - slider.min)) * 100
  slider.style.setProperty('--fill', fill + '%')
}
$('#opacity').addEventListener('input', e => {
  const percent = Number(e.target.value)
  showOpacity(percent)
  window.memo.setOpacity(id, percent / 100)
})

// ── 알림 ─────────────────────────────────────────────────────
// 종 아이콘이나 시각 칩을 누르면 알림 설정 창이 떠요.
function showRemind(ms) {
  const chip = $('#remindChip')
  chip.hidden = !ms
  if (ms) chip.querySelector('.chip-text').textContent = formatTime(ms)
  $('#remind').classList.toggle('on', !!ms)
}
$('#remind').onclick = () => window.memo.openRemind(id)
$('#remindChip').onclick = () => window.memo.openRemind(id)
window.memo.onRemind(showRemind)

// ── 알림이 울릴 때: 확인을 누를 때까지 깜빡이고 1분마다 알림음 ─────
let chimeTimer = null
let chimeCount = 0
const CHIME_MAX = 10

// "띵-동" 소리를 코드로 만들어요. (소리 파일 없이)
function chime() {
  try {
    const ctx = new AudioContext()
    const notes = [
      { freq: 880, at: 0 },
      { freq: 659.25, at: 0.28 },
    ]
    for (const { freq, at } of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + at
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 1.2)
    }
    setTimeout(() => ctx.close(), 1800)
  } catch {
    // 소리 장치가 없어도 알림은 계속돼요.
  }
}

function startAlarm(at) {
  document.body.classList.add('alarming')
  $('#alarmBar').hidden = false
  $('#alarmBar .alarm-text').textContent = '알림 · ' + formatTime(at)
  if (chimeTimer) return
  chimeCount = 1
  chime()
  chimeTimer = setInterval(() => {
    if (++chimeCount > CHIME_MAX) return clearInterval(chimeTimer)
    chime()
  }, 60 * 1000)
}

function stopAlarm() {
  document.body.classList.remove('alarming')
  $('#alarmBar').hidden = true
  clearInterval(chimeTimer)
  chimeTimer = null
}

$('#ack').onclick = () => window.memo.ackAlarm(id)
$('#snooze').onclick = () => window.memo.snooze(id, 10)
window.memo.onAlarm(at => (at ? startAlarm(at) : stopAlarm()))

// ── 아래 서식 버튼 ───────────────────────────────────────────
// 사진 추가: 파일 고르기 창을 열고, 고른 사진을 넣어요.
let savedRange = null
$('#addImage').addEventListener('mousedown', e => {
  e.preventDefault()
  const sel = getSelection()
  savedRange = sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0) : null
})
$('#addImage').onclick = () => $('#imageFile').click()
$('#imageFile').onchange = e => {
  editor.focus()
  const sel = getSelection()
  sel.removeAllRanges()
  if (savedRange) sel.addRange(savedRange)
  else {
    // 커서가 없었으면 맨 끝에 넣어요.
    const end = document.createRange()
    end.selectNodeContents(editor)
    end.collapse(false)
    sel.addRange(end)
  }
  insertImages(imageFilesOf(e.target.files))
  e.target.value = ''
}

for (const btn of document.querySelectorAll('#tools button[data-cmd]')) {
  // mousedown을 막아야 글자 선택이 풀리지 않아요.
  btn.addEventListener('mousedown', e => e.preventDefault())
  btn.onclick = () => {
    if (btn.dataset.cmd === 'insertUnorderedList') toggleBullets()
    else {
      document.execCommand(btn.dataset.cmd)
      editor.dispatchEvent(new Event('input'))
    }
  }
}

// ── 체크리스트 ───────────────────────────────────────────────
// 체크리스트는 글머리 기호 목록(<ul>)에 'checklist'라는 이름표를 붙인 거예요.
// 각 줄(<li>)의 data-checked 가 "true"면 체크된 상태예요.

// 지금 커서가 있는 곳의 목록(<ul>)과 줄(<li>)을 찾아요.
function caretNode() {
  const sel = getSelection()
  if (!sel.rangeCount) return null
  const node = sel.anchorNode
  return node?.nodeType === Node.TEXT_NODE ? node.parentElement : node
}
function currentList() {
  const ul = caretNode()?.closest?.('ul')
  return ul && editor.contains(ul) ? ul : null
}

function makeChecklist(ul) {
  ul.classList.add('checklist')
  for (const li of ul.querySelectorAll(':scope > li')) {
    if (!li.hasAttribute('data-checked')) li.dataset.checked = 'false'
  }
}

// 체크리스트 버튼: 일반 글 → 체크리스트 → 일반 글
function toggleChecklist() {
  editor.focus()
  const ul = currentList()
  if (ul?.classList.contains('checklist')) {
    document.execCommand('insertUnorderedList') // 목록 풀기
  } else if (ul) {
    makeChecklist(ul) // 글머리 기호 목록 → 체크리스트
  } else {
    document.execCommand('insertUnorderedList') // 새 목록을 만들고
    const made = currentList()
    if (made) makeChecklist(made) // 체크리스트로 바꿔요
  }
  editor.dispatchEvent(new Event('input'))
}

// 글머리 기호 버튼: 체크리스트 안에서 누르면 일반 글머리 기호로 바꿔요.
function toggleBullets() {
  editor.focus()
  const ul = currentList()
  if (ul?.classList.contains('checklist')) {
    ul.classList.remove('checklist')
    ul.querySelectorAll('li').forEach(li => li.removeAttribute('data-checked'))
  } else {
    document.execCommand('insertUnorderedList')
  }
  editor.dispatchEvent(new Event('input'))
}

$('#check').addEventListener('mousedown', e => e.preventDefault())
$('#check').onclick = toggleChecklist

// 네모 칸을 누르면 체크 ↔ 해제
editor.addEventListener('mousedown', e => {
  const li = e.target.closest?.('ul.checklist > li')
  if (!li || e.clientX - li.getBoundingClientRect().left > 22) return // 네모 칸(왼쪽 22px) 부분만
  e.preventDefault() // 커서가 움직이지 않게
  li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true'
  editor.dispatchEvent(new Event('input'))
})

// 체크된 줄에서 Enter를 치면 새 줄도 체크된 채로 복사돼서, 새 줄은 비워 줘요.
editor.addEventListener('input', e => {
  if (e.inputType !== 'insertParagraph') return
  const li = caretNode()?.closest?.('ul.checklist > li')
  if (li) li.dataset.checked = 'false'
})

// ── 단축키 ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!e.ctrlKey) return
  const key = e.key.toLowerCase()
  if (key === 'n') {
    e.preventDefault()
    window.memo.create(id)
  } else if (key === 'l' && e.shiftKey) {
    e.preventDefault()
    toggleBullets()
  } else if (key === 'c' && e.shiftKey) {
    e.preventDefault()
    toggleChecklist()
  }
})

start()
