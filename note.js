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
    document.execCommand(btn.dataset.cmd)
    editor.dispatchEvent(new Event('input'))
  }
}

// ── 단축키 ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!e.ctrlKey) return
  const key = e.key.toLowerCase()
  if (key === 'n') {
    e.preventDefault()
    window.memo.create(id)
  } else if (key === 'l' && e.shiftKey) {
    e.preventDefault()
    document.execCommand('insertUnorderedList')
    editor.dispatchEvent(new Event('input'))
  }
})

start()
