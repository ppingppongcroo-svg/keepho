// ─────────────────────────────────────────────────────────────
// remind.js — 알림 설정 창의 동작
// 고른 날짜·시간을 하나의 Date 값(sel)으로 들고 있다가,
// 무엇을 누르든 sel을 바꾸고 화면 전체를 다시 그려요. (render)
// ─────────────────────────────────────────────────────────────
const id = new URLSearchParams(location.search).get('id')
const $ = sel => document.querySelector(sel)
const MIN = 60 * 1000
const DAY = 24 * 60 * MIN
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

let sel // 지금 고른 날짜·시각
let view // 달력에 보이는 달 { y, m }

// ── 시작 ─────────────────────────────────────────────────────
async function start() {
  const note = await window.memo.get(id)
  $('#clearRemind').hidden = !note.remind
  $('#noteTitle').textContent = titleOf(note.html) || '빈 메모'
  buildGrids() // 시·분 버튼을 먼저 만들어야 처음 그릴 때 고른 버튼이 표시돼요
  setSel(note.remind ? new Date(note.remind) : roundUpTo5(Date.now() + 60 * MIN))
  // 내용 높이에 맞춰 창 크기를 정한 뒤에 보여줘요.
  window.memo.fitDialog(document.documentElement.scrollHeight)
  // 시간이 흐르면 "몇 분 후"와 빠른 설정 시각도 바뀌니까 30초마다 새로 그려요.
  setInterval(render, 30 * 1000)
}

// 메모 내용을 한 줄 요약으로: "장보기 · 우유 · 계란 한 판"
function titleOf(html) {
  const t = document.createElement('template')
  t.innerHTML = (html || '').replace(/<\/(p|div|li)>|<br\s*\/?>/gi, '$&\n')
  return t.content.textContent
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 80)
}

function roundUpTo5(ms) {
  const d = new Date(ms)
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5)
  return d
}

function setSel(date) {
  sel = new Date(date)
  sel.setSeconds(0, 0)
  view = { y: sel.getFullYear(), m: sel.getMonth() }
  render()
}

// ── 글자 만들기 ──────────────────────────────────────────────
const ampmOf = d => (d.getHours() < 12 ? '오전' : '오후')
const hour12 = d => d.getHours() % 12 || 12
const pad = n => String(n).padStart(2, '0')
const timeText = d => `${ampmOf(d)} ${hour12(d)}:${pad(d.getMinutes())}`
const dateText = d => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`
const sameDay = (a, b) => a.toDateString() === b.toDateString()
const sameMinute = (a, b) => Math.floor(a / MIN) === Math.floor(b / MIN)

function relativeText(ms) {
  const mins = Math.round(ms / MIN)
  if (mins < 60) return `${mins}분 후`
  const days = Math.floor(mins / (24 * 60))
  const hours = Math.floor((mins % (24 * 60)) / 60)
  const rest = mins % 60
  if (days > 0) return hours ? `${days}일 ${hours}시간 후` : `${days}일 후`
  return rest ? `${hours}시간 ${rest}분 후` : `${hours}시간 후`
}

// ── 빠른 설정 ────────────────────────────────────────────────
function quickOptions() {
  const now = Date.now()
  const at = (h, m, addDays = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + addDays)
    d.setHours(h, m, 0, 0)
    return d
  }
  const options = [
    { label: '30분 후', when: new Date(now + 30 * MIN) },
    { label: '1시간 후', when: new Date(now + 60 * MIN) },
  ]
  const evening = at(18, 0)
  if (evening - now > 30 * MIN) options.push({ label: '오늘 저녁', when: evening })
  else options.push({ label: '3시간 후', when: new Date(now + 180 * MIN) })
  options.push({ label: '내일 아침', when: at(9, 0, 1) })
  return options
}

// ── 그리기 ───────────────────────────────────────────────────
function render() {
  renderQuick()
  renderCalendar()
  renderTime()
  renderSummary()
}

function renderQuick() {
  const box = $('#quick')
  box.replaceChildren()
  for (const option of quickOptions()) {
    const btn = document.createElement('button')
    btn.className = 'q' + (sameMinute(option.when, sel) ? ' on' : '')
    const label = document.createElement('b')
    label.textContent = option.label
    const time = document.createElement('span')
    time.textContent = timeText(option.when)
    btn.append(label, time)
    btn.onclick = () => setSel(option.when)
    box.append(btn)
  }
}

function renderCalendar() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  $('#monthTitle').textContent = `${view.y}년 ${view.m + 1}월`
  $('#prevMonth').disabled = view.y < today.getFullYear() || (view.y === today.getFullYear() && view.m <= today.getMonth())

  const grid = $('#calGrid')
  grid.replaceChildren()
  WEEKDAYS.forEach((name, i) => {
    const wd = document.createElement('div')
    wd.className = 'wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')
    wd.textContent = name
    grid.append(wd)
  })

  // 달력은 항상 6주(42칸)로 그려서, 달을 넘겨도 창 높이가 출렁이지 않게 해요.
  const first = new Date(view.y, view.m, 1)
  for (let i = 0; i < 42; i++) {
    const day = new Date(view.y, view.m, 1 - first.getDay() + i)
    const btn = document.createElement('button')
    const dow = day.getDay()
    btn.className = [
      'd',
      dow === 0 ? 'sun' : dow === 6 ? 'sat' : '',
      day.getMonth() !== view.m ? 'other' : '',
      sameDay(day, today) ? 'today' : '',
      sameDay(day, sel) ? 'sel' : '',
    ].join(' ')
    btn.textContent = day.getDate()
    btn.disabled = day < today
    btn.onclick = () => {
      const next = new Date(sel)
      next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
      setSel(next)
    }
    grid.append(btn)
  }
}

function renderTime() {
  const pm = sel.getHours() >= 12
  document.querySelectorAll('#ampm button').forEach(b => b.classList.toggle('on', (b.dataset.ampm === 'pm') === pm))
  $('#hourVal').textContent = hour12(sel)
  $('#minuteVal').textContent = pad(sel.getMinutes())

  for (const btn of $('#hourGrid').children) {
    btn.classList.toggle('on', Number(btn.dataset.h) === hour12(sel))
  }
  const minute = sel.getMinutes()
  for (const btn of $('#minuteGrid').children) {
    const m = Number(btn.dataset.m)
    btn.classList.toggle('on', m === minute)
    // 37분처럼 5분 단위 사이면 가까운 버튼(35)에 테두리
    btn.classList.toggle('near', m !== minute && m === Math.floor(minute / 5) * 5)
  }
}

function renderSummary() {
  const diff = sel - Date.now()
  const past = diff <= 0
  $('#summary').classList.toggle('past', past)
  $('#sumLabel').textContent = past ? '이미 지난 시각이에요' : '이때 알려 드려요'
  $('#sumWhen').textContent = `${dateText(sel)} ${timeText(sel)}`
  $('#sumRel').textContent = past ? '' : relativeText(diff)
  $('#save').disabled = past
}

// ── 시간 고르기 ──────────────────────────────────────────────
// 시 1~12, 분 00~55 버튼을 한 번만 만들어 둬요.
function buildGrids() {
  for (let h = 1; h <= 12; h++) {
    const btn = document.createElement('button')
    btn.textContent = h
    btn.dataset.h = h
    btn.onclick = () => {
      const pm = sel.getHours() >= 12
      const next = new Date(sel)
      next.setHours((h % 12) + (pm ? 12 : 0))
      setSel(next)
    }
    $('#hourGrid').append(btn)
  }
  for (let m = 0; m < 60; m += 5) {
    const btn = document.createElement('button')
    btn.textContent = pad(m)
    btn.dataset.m = m
    btn.onclick = () => {
      const next = new Date(sel)
      next.setMinutes(m)
      setSel(next)
    }
    $('#minuteGrid').append(btn)
  }
}

for (const btn of document.querySelectorAll('#ampm button')) {
  btn.onclick = () => {
    const wantPm = btn.dataset.ampm === 'pm'
    const isPm = sel.getHours() >= 12
    if (wantPm !== isPm) setSel(new Date(sel.getTime() + (wantPm ? 12 : -12) * 60 * MIN))
  }
}

// ▲▼ 화살표: 한 번 누르면 1칸, 꾹 누르고 있으면 계속 움직여요.
const nudge = minutes => setSel(new Date(sel.getTime() + minutes * MIN))
for (const arrow of document.querySelectorAll('.arrow')) {
  const step = Number(arrow.dataset.step)
  let holdTimer = null
  const stop = () => {
    clearTimeout(holdTimer)
    clearInterval(holdTimer)
  }
  arrow.addEventListener('pointerdown', e => {
    if (e.button !== 0) return
    nudge(step)
    holdTimer = setTimeout(() => (holdTimer = setInterval(() => nudge(step), 70)), 400)
  })
  arrow.addEventListener('pointerup', stop)
  arrow.addEventListener('pointerleave', stop)
}

// 숫자 위에서 마우스 휠을 굴려도 바뀌어요.
$('#hourBox').addEventListener('wheel', e => {
  e.preventDefault()
  nudge(e.deltaY < 0 ? 60 : -60)
})
$('#minuteBox').addEventListener('wheel', e => {
  e.preventDefault()
  nudge(e.deltaY < 0 ? 1 : -1)
})

// ── 달 넘기기 ────────────────────────────────────────────────
$('#prevMonth').onclick = () => {
  view = view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 }
  renderCalendar()
}
$('#nextMonth').onclick = () => {
  view = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 }
  renderCalendar()
}

// ── 버튼 ─────────────────────────────────────────────────────
async function save() {
  if (sel - Date.now() <= 0) return
  await window.memo.setRemind(id, sel.getTime())
  window.close()
}
$('#save').onclick = save
$('#cancel').onclick = () => window.close()
$('#closeX').onclick = () => window.close()
$('#clearRemind').onclick = async () => {
  await window.memo.setRemind(id, null)
  window.close()
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.close()
  if (e.key === 'Enter') save()
})

start()
