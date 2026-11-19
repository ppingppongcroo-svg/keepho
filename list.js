// ─────────────────────────────────────────────────────────────
// list.js — 메모 목록 창의 동작
// 모든 메모를 카드로 보여주고, 검색하고, 누르면 그 메모를 열어요.
// 휴지통 탭에서는 지운 메모를 되살리거나 완전히 지울 수 있어요.
// ─────────────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel)
const cards = $('#cards')
const search = $('#search')
let data = { colors: {}, notes: [], trashDays: 30, captureKey: '' }
let tab = 'notes' // 'notes' 또는 'trash'

// 메모 html에서 글자와 첫 번째 사진 주소만 뽑아요.
// (<template> 안에서 읽으면 사진을 실제로 불러오지 않아서 가벼워요)
function summarize(html) {
  const t = document.createElement('template')
  t.innerHTML = (html || '').replace(/<\/(p|div|li)>|<br\s*\/?>/gi, '$&\n')
  // 체크리스트 줄 앞에 ☐ / ☑ 를 붙여서 미리보기에서도 보이게
  for (const li of t.content.querySelectorAll('ul.checklist > li')) {
    li.prepend(li.dataset.checked === 'true' ? '☑ ' : '☐ ')
  }
  const text = t.content.textContent.replace(/\n{3,}/g, '\n\n').trim()
  const img = t.content.querySelector('img')
  return { text, image: img ? img.getAttribute('src') : null }
}

function formatDate(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) + (ms > Date.now() ? ' ' + time : '')
}

// 휴지통에서 며칠 남았는지
function daysLeft(deleted) {
  const left = data.trashDays - Math.floor((Date.now() - deleted) / (24 * 60 * 60 * 1000))
  return Math.max(left, 0)
}

function smallButton(label, title, onClick) {
  const btn = document.createElement('button')
  btn.className = 'mini'
  btn.textContent = label
  btn.title = title
  btn.onclick = e => {
    e.stopPropagation() // 카드 열기가 같이 눌리지 않게
    onClick()
  }
  return btn
}

function render() {
  const query = search.value.trim().toLowerCase()
  const inTrash = tab === 'trash'
  const trashed = data.notes.filter(n => n.deleted)

  $('#trashCount').textContent = trashed.length ? `(${trashed.length})` : ''
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab))
  $('#trashBar').hidden = !inTrash
  $('#trashInfo').textContent = `${data.trashDays}일이 지나면 완전히 삭제돼요`
  $('#emptyTrash').disabled = trashed.length === 0

  cards.replaceChildren()
  const items = data.notes
    .filter(n => (inTrash ? n.deleted : !n.deleted))
    .map(note => ({ note, ...summarize(note.html) }))
    .filter(item => !query || item.text.toLowerCase().includes(query))

  if (items.length === 0) {
    const p = document.createElement('p')
    p.className = 'empty-list'
    p.textContent = query
      ? '검색 결과가 없어요.'
      : inTrash
        ? '휴지통이 비어 있어요.'
        : '메모가 없어요. ＋ 새 메모를 눌러 보세요.'
    cards.append(p)
    return
  }

  for (const { note, text, image } of items) {
    const card = document.createElement('div')
    card.className = 'card' + (inTrash ? ' trashed' : '')
    card.style.setProperty('--paper', data.colors[note.color] || data.colors.yellow)

    // 윗줄: 날짜와 상태 표시
    const meta = document.createElement('div')
    meta.className = 'meta'
    const labels = inTrash
      ? [`${daysLeft(note.deleted)}일 뒤 완전 삭제`]
      : [formatDate(note.updated), note.open !== false && '열림', note.remind && `⏰ ${formatDate(note.remind)}`]
    meta.textContent = labels.filter(Boolean).join(' · ')

    const body = document.createElement('div')
    body.className = 'text' + (text ? '' : ' empty')
    body.textContent = text || (image ? '' : '빈 메모')

    card.append(meta, body)
    if (image) {
      const img = document.createElement('img')
      img.src = image
      img.alt = ''
      card.append(img)
    }

    // 오른쪽 위 버튼들
    const tools = document.createElement('div')
    tools.className = 'tools'
    if (inTrash) {
      tools.append(
        smallButton('↩ 복원', '메모 되살리기', () => window.memo.restore(note.id)),
        smallButton('영구 삭제', '완전히 지우기', () => window.memo.purge(note.id)),
      )
    } else {
      tools.append(smallButton('🗑', '휴지통으로 이동', () => window.memo.remove(note.id)))
      card.onclick = () => window.memo.show(note.id)
    }
    card.append(tools)
    cards.append(card)
  }
}

async function refresh() {
  data = await window.memo.all()
  $('#capture').title = `화면 일부를 캡처해서 새 메모로 (어디서든 ${data.captureKey})`
  render()
}

$('#new').onclick = () => window.memo.create()
$('#capture').onclick = () => window.memo.startCapture()
$('#emptyTrash').onclick = () => window.memo.emptyTrash()
search.addEventListener('input', render)
for (const btn of document.querySelectorAll('#tabs button')) {
  btn.onclick = () => {
    tab = btn.dataset.tab
    render()
  }
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    window.memo.create()
  }
})

// 메모가 바뀔 때마다 목록을 새로 그려요.
window.memo.onChanged(refresh)
refresh()
