// ===== 별 배경 =====
(function initStars() {
  const canvas = document.getElementById('stars');
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function createStars() {
    stars = [];
    for (let i = 0; i < 180; i++) {
      stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.2 + 0.2, alpha: Math.random(), speed: Math.random() * 0.008 + 0.002 });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.alpha += s.speed;
      if (s.alpha > 1 || s.alpha < 0) s.speed *= -1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,180,255,${s.alpha * 0.7})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  resize(); createStars(); draw();
  window.addEventListener('resize', () => { resize(); createStars(); });
})();


// ===== 모름 체크박스 =====
document.getElementById('male_time_unknown').addEventListener('change', function () {
  document.getElementById('male_hour').disabled = this.checked;
  document.getElementById('male_hour').style.opacity = this.checked ? '0.4' : '1';
});
document.getElementById('female_time_unknown').addEventListener('change', function () {
  document.getElementById('female_hour').disabled = this.checked;
  document.getElementById('female_hour').style.opacity = this.checked ? '0.4' : '1';
});


// ===== 전역 상태 =====
let currentPayload = null;
let currentPartNum = 0;
let partTexts = [];  // 파트별 생성 텍스트 저장


// ===== SSE 스트리밍 공통 =====
async function streamSSE(url, payload, onText, onDone, onError) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('서버 오류: ' + response.status);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') { onDone && onDone(); return; }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { onError && onError(parsed.error); return; }
          if (parsed.text) onText(parsed.text);
        } catch (_) {}
      }
    }
    onDone && onDone();
  } catch (err) {
    onError && onError(err.message);
  }
}


// ===== 폼 데이터 수집 =====
function collectPayload() {
  const maleName = document.getElementById('male_name').value.trim();
  const femaleName = document.getElementById('female_name').value.trim();
  const maleMbti = document.getElementById('male_mbti').value;
  const femaleMbti = document.getElementById('female_mbti').value;
  const maleYear = parseInt(document.getElementById('male_year').value);
  const maleMonth = parseInt(document.getElementById('male_month').value);
  const maleDay = parseInt(document.getElementById('male_day').value);
  const femaleYear = parseInt(document.getElementById('female_year').value);
  const femaleMonth = parseInt(document.getElementById('female_month').value);
  const femaleDay = parseInt(document.getElementById('female_day').value);

  if (!maleName || !femaleName || !maleMbti || !femaleMbti) { alert('모든 항목을 입력해주세요.'); return null; }
  if (!maleYear || !maleMonth || !maleDay || !femaleYear || !femaleMonth || !femaleDay) { alert('생년월일을 모두 입력해주세요.'); return null; }

  const maleTimeUnknown = document.getElementById('male_time_unknown').checked;
  const femaleTimeUnknown = document.getElementById('female_time_unknown').checked;

  return {
    start_year: parseInt(document.getElementById('start_year').value),
    male: {
      name: maleName,
      birth_year: maleYear, birth_month: maleMonth, birth_day: maleDay,
      is_lunar: document.querySelector('input[name="male_cal"]:checked').value === 'lunar',
      time_unknown: maleTimeUnknown,
      hour: maleTimeUnknown ? null : parseInt(document.getElementById('male_hour').value),
      mbti: maleMbti,
    },
    female: {
      name: femaleName,
      birth_year: femaleYear, birth_month: femaleMonth, birth_day: femaleDay,
      is_lunar: document.querySelector('input[name="female_cal"]:checked').value === 'lunar',
      time_unknown: femaleTimeUnknown,
      hour: femaleTimeUnknown ? null : parseInt(document.getElementById('female_hour').value),
      mbti: femaleMbti,
    },
  };
}


// ===== 로딩 =====
function showLoading(text, sub) {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('loading-text').textContent = text || '분석 중...';
  document.getElementById('loading-sub').textContent = sub || '';
}
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }


// ===== 1단계: 사주 분석 =====
document.getElementById('saju-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const payload = collectPayload();
  if (!payload) return;
  currentPayload = payload;
  currentPartNum = 0;
  partTexts = [];

  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('analysis-section').classList.add('hidden');
  document.getElementById('novel-section').classList.add('hidden');
  document.getElementById('parts-container').innerHTML = '';
  document.getElementById('continue-area').classList.add('hidden');
  document.getElementById('novel-end').classList.add('hidden');
  showLoading('사주를 분석하고 있어요...', '두 사람의 운명을 읽는 중 ✨');

  ['card-male', 'card-female', 'card-compat'].forEach(id => {
    document.getElementById(id).innerHTML = '<div class="card-loading">분석 중...</div>';
  });
  document.getElementById('novel-start-area').classList.add('hidden');

  let rawText = '';

  await streamSSE('/analyze', payload,
    (text) => { rawText += text; renderAnalysisCards(rawText, false); },
    () => {
      renderAnalysisCards(rawText, true);
      hideLoading();
      document.getElementById('analysis-section').classList.remove('hidden');
      document.getElementById('novel-start-area').classList.remove('hidden');
      document.getElementById('analyze-btn').disabled = false;
      document.getElementById('analysis-section').scrollIntoView({ behavior: 'smooth' });
    },
    (err) => { hideLoading(); document.getElementById('analyze-btn').disabled = false; alert('오류: ' + err); }
  );
});


// ===== 분석 카드 파싱 =====
function renderAnalysisCards(text, done) {
  const maleMatch = text.match(/===남자카드===([\s\S]*?)(?:===여자카드===|$)/);
  const femaleMatch = text.match(/===여자카드===([\s\S]*?)(?:===궁합카드===|$)/);
  const compatMatch = text.match(/===궁합카드===([\s\S]*?)(?:===끝===|$)/);

  const maleName = currentPayload?.male?.name || '남자';
  const femaleName = currentPayload?.female?.name || '여자';

  if (maleMatch) document.getElementById('card-male').innerHTML = buildCardHTML('♂', maleName + '의 사주', maleMatch[1].trim(), done);
  if (femaleMatch) document.getElementById('card-female').innerHTML = buildCardHTML('♀', femaleName + '의 사주', femaleMatch[1].trim(), done);
  if (compatMatch) document.getElementById('card-compat').innerHTML = buildCardHTML('💫', '두 사람의 궁합', compatMatch[1].trim(), done);
}

function buildCardHTML(icon, title, body, done) {
  const cursor = done ? '' : '<span style="animation:blink 1s infinite;display:inline-block;">▌</span>';
  return `<div class="card-header"><span class="card-icon">${icon}</span><span class="card-title">${title}</span></div><div class="card-body">${escapeHtml(body)}${cursor}</div>`;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ===== 2단계: 소설 시작 =====
function startNovel() {
  document.getElementById('novel-section').classList.remove('hidden');
  document.getElementById('novel-section').scrollIntoView({ behavior: 'smooth' });
  generatePart(1);
}


// ===== 파트 생성 (이어쓰기 핵심) =====
async function generatePart(partNum) {
  currentPartNum = partNum;

  // 이전 파트 마지막 1000자 추출
  const prevText = partTexts.length > 0
    ? partTexts[partTexts.length - 1].slice(-1000)
    : '';

  const payload = {
    ...currentPayload,
    part_num: partNum,
    prev_text: prevText,
  };

  // 파트 블록 UI 생성
  const block = document.createElement('div');
  block.className = 'part-block';
  block.id = `part-block-${partNum}`;
  block.innerHTML = `
    <div class="part-title-bar">
      <span class="part-num">${partNum}부</span>
    </div>
    <div class="part-raw story-raw" id="part-raw-${partNum}"></div>
  `;
  document.getElementById('parts-container').appendChild(block);

  // 이어쓰기 버튼 숨기고 로딩
  document.getElementById('continue-area').classList.add('hidden');
  document.getElementById('continue-btn').disabled = true;
  showLoading(`${partNum}부를 쓰고 있어요...`, '이야기를 이어가는 중 ✨');

  block.scrollIntoView({ behavior: 'smooth' });

  let rawText = '';
  let isComplete = false;
  const rawEl = document.getElementById(`part-raw-${partNum}`);

  await streamSSE('/generate', payload,
    (text) => {
      rawText += text;

      // 완결 태그 감지 (표시에서는 제거)
      if (rawText.includes('===완결===')) {
        isComplete = true;
        rawEl.textContent = rawText.replace('===완결===', '').trim();
      } else {
        rawEl.textContent = rawText;
      }
      rawEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    },
    () => {
      hideLoading();

      // 완결 태그 제거 후 저장
      const cleanText = rawText.replace('===완결===', '').trim();
      partTexts.push(cleanText);

      // 챕터 카드로 변환
      renderPartCards(partNum, cleanText);

      if (isComplete) {
        showNovelEnd();
      } else {
        document.getElementById('continue-btn').disabled = false;
        document.getElementById('continue-area').classList.remove('hidden');
        document.getElementById('continue-area').scrollIntoView({ behavior: 'smooth' });
      }
    },
    (err) => {
      hideLoading();
      rawEl.textContent += '\n\n⚠️ 오류: ' + err;
      document.getElementById('continue-btn').disabled = false;
    }
  );
}


// ===== 이어쓰기 버튼 =====
function continueNovel() {
  generatePart(currentPartNum + 1);
}


// ===== 파트 카드 렌더링 =====
function renderPartCards(partNum, text) {
  const rawEl = document.getElementById(`part-raw-${partNum}`);
  const sections = text.split(/\n---+\n/).map(s => s.trim()).filter(Boolean);

  if (sections.length <= 1) return; // 분리 안 되면 raw 유지

  rawEl.innerHTML = '';
  rawEl.style.padding = '0';

  sections.forEach(section => {
    const card = document.createElement('div');
    card.className = 'chapter-card';

    const yearMatch = section.match(/^📅\s*(.+)/m);
    const sajuNotes = [...section.matchAll(/^🔮\s*(.+)/mg)].map(m => m[1].trim());
    const bodyLines = section.split('\n').filter(l => !l.startsWith('📅') && !l.startsWith('🔮')).join('\n').trim();

    if (yearMatch) {
      const s = document.createElement('span');
      s.className = 'chapter-year';
      s.textContent = '📅 ' + yearMatch[1];
      card.appendChild(s);
    }
    if (sajuNotes[0]) {
      const n = document.createElement('div');
      n.className = 'saju-note';
      n.textContent = '🔮 ' + sajuNotes[0];
      card.appendChild(n);
    }
    if (bodyLines) {
      const b = document.createElement('div');
      b.className = 'story-body';
      b.textContent = bodyLines;
      card.appendChild(b);
    }
    if (sajuNotes[1]) {
      const g = document.createElement('div');
      g.className = 'gungham-note';
      g.textContent = '🔮 ' + sajuNotes[1];
      card.appendChild(g);
    }

    rawEl.appendChild(card);
  });
}


// ===== 완결 화면 =====
function showNovelEnd() {
  const maleName = currentPayload?.male?.name || '';
  const femaleName = currentPayload?.female?.name || '';
  document.getElementById('end-title').textContent = `${maleName} & ${femaleName}의 이야기, 완결`;
  document.getElementById('end-desc').textContent =
    `총 ${currentPartNum}부로 완성된 두 사람의 특별한 이야기예요.\n소중한 사람과 함께 나눠보세요 💫`;
  document.getElementById('novel-end').classList.remove('hidden');
  document.getElementById('novel-end').scrollIntoView({ behavior: 'smooth' });
}


// ===== 전체 복사 =====
function copyAll() {
  const all = partTexts.map((t, i) => `[${i + 1}부]\n\n${t}`).join('\n\n───────────────\n\n');
  navigator.clipboard.writeText(all).then(() => {
    const btn = document.querySelector('.btn-copy-all');
    btn.textContent = '✅ 복사됨!';
    setTimeout(() => { btn.textContent = '📋 전체 이야기 복사'; }, 2000);
  });
}
