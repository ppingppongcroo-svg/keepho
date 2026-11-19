// ─────────────────────────────────────────────────────────────
// list.js — 메모 목록 창의 동작
// 모든 메모를 카드로 보여주고, 검색하고, 누르면 그 메모를 열어요.
// ─────────────────────────────────────────────────────────────
const cards = document.querySelector('#cards')
const search = document.querySelector('#search')
let data = { colors: {}, notes: [] }

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
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

function render() {
  const query = search.value.trim().toLowerCase()
  cards.replaceChildren()

  const items = data.notes
    .map(note => ({ note, ...summarize(note.html) }))
    .filter(item => !query || item.text.toLowerCase().includes(query))

  if (items.length === 0) {
    const p = document.createElement('p')
    p.className = 'empty-list'
    p.textContent = query ? '검색 결과가 없어요.' : '메모가 없어요. ＋ 새 메모를 눌러 보세요.'
    cards.append(p)
    return
  }

  for (const { note, text, image } of items) {
    const card = document.createElement('div')
    card.className = 'card'
    card.style.setProperty('--paper', data.colors[note.color] || data.colors.yellow)

    const date = document.createElement('div')
    date.className = 'date'
    date.textContent = formatDate(note.updated)
    if (note.open !== false) {
      const badge = document.createElement('span')
      badge.className = 'badge'
      badge.textContent = '· 열림'
      date.append(badge)
    }

    const body = document.createElement('div')
    body.className = 'text' + (text ? '' : ' empty')
    body.textContent = text || (image ? '' : '빈 메모')

    card.append(date, body)
    if (image) {
      const img = document.createElement('img')
      img.src = image
      img.alt = ''
      card.append(img)
    }

    const del = document.createElement('button')
    del.className = 'del'
    del.title = '메모 삭제'
    del.textContent = '🗑'
    del.onclick = e => {
      e.stopPropagation() // 카드 열기가 같이 눌리지 않게
      window.memo.remove(note.id)
    }
    card.append(del)

    card.onclick = () => window.memo.show(note.id)
    cards.append(card)
  }
}

async function refresh() {
  data = await window.memo.all()
  render()
}

document.querySelector('#new').onclick = () => window.memo.create()
search.addEventListener('input', render)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    window.memo.create()
  }
})

// 메모가 바뀔 때마다 목록을 새로 그려요.
window.memo.onChanged(refresh)
refresh()
