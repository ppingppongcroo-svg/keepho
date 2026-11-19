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
  buildPalette(note.color)
  editor.focus()
}

function applyColor(name) {
  document.documentElement.style.setProperty('--paper', colors[name] || colors.yellow)
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
$('#del').onclick = () => window.memo.remove(id)
$('#close').onclick = () => {
  flush()
  window.memo.close(id)
}
$('#pin').onclick = async () => $('#pin').classList.toggle('on', await window.memo.toggleTop(id))
$('#color').onclick = () => ($('#palette').hidden = !$('#palette').hidden)

function buildPalette(current) {
  const palette = $('#palette')
  for (const [name, hex] of Object.entries(colors)) {
    const swatch = document.createElement('button')
    swatch.style.background = hex
    swatch.title = name
    swatch.classList.toggle('on', name === current)
    swatch.onclick = () => {
      applyColor(name)
      window.memo.update(id, { color: name })
      palette.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === swatch))
      palette.hidden = true
    }
    palette.append(swatch)
  }
}

// ── 아래 서식 버튼 ───────────────────────────────────────────
// 🖼 이미지 추가: 파일 고르기 창을 열고, 고른 사진을 넣어요.
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

// ☑ 버튼: 일반 글 → 체크리스트 → 일반 글
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

// •≡ 버튼: 체크리스트 안에서 누르면 일반 글머리 기호로 바꿔요.
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
