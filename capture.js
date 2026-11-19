// ─────────────────────────────────────────────────────────────
// capture.js — 화면 캡처 영역 고르기
// 본체가 미리 찍어 둔 화면 사진을 깔아 두고,
// 마우스로 드래그한 네모의 위치·크기를 본체에 알려줘요.
// ─────────────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel)
const sel = $('#sel')
let start = null // 드래그를 시작한 점

window.memo.captureImage().then(url => {
  if (!url) return window.memo.captureCancel()
  $('#shot').src = url
})

// 시작점과 지금 마우스 위치로 네모를 만들어요. (어느 방향으로 끌어도 되게)
function rectTo(e) {
  const x = Math.min(start.x, e.clientX)
  const y = Math.min(start.y, e.clientY)
  return { x, y, w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) }
}

function draw(r) {
  Object.assign(sel.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' })
  $('#size').textContent = `${r.w} × ${r.h}`
  $('#size').style.top = r.y < 28 ? '4px' : '-24px' // 화면 맨 위에서는 안쪽에 표시
}

addEventListener('mousedown', e => {
  if (e.button !== 0) return
  start = { x: e.clientX, y: e.clientY }
  $('#dim').hidden = true
  $('#hint').hidden = true
  sel.hidden = false
  draw(rectTo(e))
})

addEventListener('mousemove', e => {
  if (start) draw(rectTo(e))
})

addEventListener('mouseup', e => {
  if (!start || e.button !== 0) return
  const r = rectTo(e)
  start = null
  if (r.w < 8 || r.h < 8) {
    // 너무 작으면 실수로 클릭한 걸로 보고 다시 고르게 해요.
    sel.hidden = true
    $('#dim').hidden = false
    $('#hint').hidden = false
    return
  }
  window.memo.captureDone(r)
})

addEventListener('keydown', e => {
  if (e.key === 'Escape') window.memo.captureCancel()
})
addEventListener('contextmenu', e => {
  e.preventDefault()
  window.memo.captureCancel()
})
