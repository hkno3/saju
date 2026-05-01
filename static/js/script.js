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
let currentPayload = null;   // 서버로 보낼 기본 데이터
let currentChapter = 0;      // 현재 완료된 챕터 번호
let chapterTexts = [];        // 챕터별 생성된 텍스트 저장

const CHAPTER_INFO = [
  { num: 1, title: '성장기', desc: '유년기와 첫 만남', next: '2부 보기 · 청춘과 연애' },
  { num: 2, title: '청춘·연애', desc: '설렘과 사랑', next: '3부 보기 · 결혼과 위기' },
  { num: 3, title: '결혼·위기', desc: '인생의 무게', next: '4부 보기 · 원숙함' },
  { num: 4, title: '원숙함', desc: '현재까지의 이야기', next: null },
];


// ===== SSE 스트리밍 공통 함수 =====
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


// ===== 로딩 표시 =====
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
  currentChapter = 0;
  chapterTexts = [];

  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('analysis-section').classList.add('hidden');
  document.getElementById('novel-section').classList.add('hidden');
  showLoading('사주를 분석하고 있어요...', '두 사람의 운명을 읽는 중 ✨');

  // 카드 초기화
  ['card-male', 'card-female', 'card-compat'].forEach(id => {
    document.getElementById(id).innerHTML = '<div class="card-loading">분석 중...</div>';
  });
  document.getElementById('novel-start-area').classList.add('hidden');

  let rawText = '';

  await streamSSE(
    '/analyze', payload,
    (text) => {
      rawText += text;
      renderAnalysisCards(rawText, false);
    },
    () => {
      renderAnalysisCards(rawText, true);
      hideLoading();
      document.getElementById('analysis-section').classList.remove('hidden');
      document.getElementById('novel-start-area').classList.remove('hidden');
      document.getElementById('analyze-btn').disabled = false;
      document.getElementById('analysis-section').scrollIntoView({ behavior: 'smooth' });
    },
    (err) => {
      hideLoading();
      document.getElementById('analyze-btn').disabled = false;
      alert('오류: ' + err);
    }
  );
});


// ===== 분석 카드 파싱 & 렌더링 =====
function renderAnalysisCards(text, done) {
  const maleMatch = text.match(/===남자카드===([\s\S]*?)(?:===여자카드===|$)/);
  const femaleMatch = text.match(/===여자카드===([\s\S]*?)(?:===궁합카드===|$)/);
  const compatMatch = text.match(/===궁합카드===([\s\S]*?)(?:===끝===|$)/);

  const maleName = currentPayload?.male?.name || '남자';
  const femaleName = currentPayload?.female?.name || '여자';

  if (maleMatch) {
    document.getElementById('card-male').innerHTML = buildCardHTML(
      '♂', maleName + '의 사주', maleMatch[1].trim(), done
    );
  }
  if (femaleMatch) {
    document.getElementById('card-female').innerHTML = buildCardHTML(
      '♀', femaleName + '의 사주', femaleMatch[1].trim(), done
    );
  }
  if (compatMatch) {
    document.getElementById('card-compat').innerHTML = buildCardHTML(
      '💫', '두 사람의 궁합', compatMatch[1].trim(), done
    );
  }
}

function buildCardHTML(icon, title, body, done) {
  const cursor = done ? '' : '<span style="animation: blink 1s infinite; display:inline-block;">▌</span>';
  return `
    <div class="card-header">
      <span class="card-icon">${icon}</span>
      <span class="card-title">${title}</span>
    </div>
    <div class="card-body">${escapeHtml(body)}${cursor}</div>
  `;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ===== 2단계: 소설 시작 =====
function startNovel() {
  document.getElementById('novel-section').classList.remove('hidden');
  document.getElementById('novel-section').scrollIntoView({ behavior: 'smooth' });
  generateChapter(1);
}


// ===== 챕터 생성 =====
async function generateChapter(chapterNum) {
  currentChapter = chapterNum;
  const info = CHAPTER_INFO[chapterNum - 1];

  // 챕터 진행 표시 업데이트
  updateProgress(chapterNum);

  // 챕터 블록 생성
  const block = document.createElement('div');
  block.className = 'chapter-block';
  block.id = `chapter-block-${chapterNum}`;
  block.innerHTML = `
    <div class="chapter-title-bar">
      <span class="chapter-num">${chapterNum}부</span>
      <span class="chapter-name">${info.title} · ${info.desc}</span>
    </div>
    <div class="chapter-raw story-raw" id="chapter-raw-${chapterNum}"></div>
  `;
  document.getElementById('chapters-container').appendChild(block);

  // 다음 챕터 버튼 숨기기
  document.getElementById('next-chapter-area').classList.add('hidden');
  document.getElementById('novel-end').classList.add('hidden');

  showLoading(
    `${chapterNum}부를 쓰고 있어요...`,
    `${info.title} 이야기를 만드는 중 ✨`
  );

  // 이전 챕터 요약 (처음 500자)
  const prevSummary = chapterTexts.length > 0
    ? chapterTexts[chapterTexts.length - 1].substring(0, 500) + '...'
    : '';

  const payload = {
    ...currentPayload,
    chapter: chapterNum,
    prev_summary: prevSummary,
  };

  let rawText = '';
  const rawEl = document.getElementById(`chapter-raw-${chapterNum}`);

  block.scrollIntoView({ behavior: 'smooth' });

  await streamSSE(
    '/generate', payload,
    (text) => {
      rawText += text;
      rawEl.textContent = rawText;
      rawEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    },
    () => {
      hideLoading();
      chapterTexts.push(rawText);

      // 챕터 카드로 변환
      renderChapterCards(chapterNum, rawText);

      // 진행 도트 완료 표시
      markStepDone(chapterNum);

      // 다음 챕터 또는 완결 표시
      if (chapterNum < 4) {
        const nextInfo = CHAPTER_INFO[chapterNum];
        document.getElementById('next-chapter-label').textContent =
          `📖 ${nextInfo.num}부 보기 · ${nextInfo.title}`;
        document.getElementById('next-chapter-area').classList.remove('hidden');
        document.getElementById('next-chapter-area').scrollIntoView({ behavior: 'smooth' });
      } else {
        showNovelEnd();
      }
    },
    (err) => {
      hideLoading();
      rawEl.textContent += '\n\n⚠️ 오류: ' + err;
    }
  );
}


// ===== 다음 챕터 =====
function nextChapter() {
  generateChapter(currentChapter + 1);
}


// ===== 챕터 카드 렌더링 =====
function renderChapterCards(chapterNum, text) {
  const rawEl = document.getElementById(`chapter-raw-${chapterNum}`);
  const chapters = text.split(/\n---+\n/).map(c => c.trim()).filter(Boolean);

  if (chapters.length <= 1) return; // 분리 안 되면 raw 유지

  rawEl.innerHTML = '';
  rawEl.style.padding = '0';

  chapters.forEach(chapter => {
    const card = document.createElement('div');
    card.className = 'chapter-card';

    const yearMatch = chapter.match(/^📅\s*(.+)/m);
    const sajuNotes = [...chapter.matchAll(/^🔮\s*(.+)/mg)].map(m => m[1].trim());
    const bodyLines = chapter.split('\n').filter(l => !l.startsWith('📅') && !l.startsWith('🔮')).join('\n').trim();

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


// ===== 진행 표시 =====
function updateProgress(chapterNum) {
  for (let i = 1; i <= 4; i++) {
    const dot = document.querySelector(`#step-${i} .step-dot`);
    if (!dot) continue;
    dot.classList.remove('active', 'done', 'current');
    if (i < chapterNum) dot.classList.add('done');
    else if (i === chapterNum) dot.classList.add('current');
  }
}

function markStepDone(chapterNum) {
  const dot = document.querySelector(`#step-${chapterNum} .step-dot`);
  if (dot) { dot.classList.remove('current'); dot.classList.add('done'); }
}


// ===== 완결 화면 =====
function showNovelEnd() {
  const maleName = currentPayload?.male?.name || '';
  const femaleName = currentPayload?.female?.name || '';
  document.getElementById('end-title').textContent = `${maleName} & ${femaleName}의 이야기, 완결`;
  document.getElementById('end-desc').textContent =
    '두 사람의 사주가 만들어낸 특별한 이야기가 완성됐어요.\n이 이야기를 소중한 사람과 함께 나눠보세요 💫';
  document.getElementById('novel-end').classList.remove('hidden');
  document.getElementById('novel-end').scrollIntoView({ behavior: 'smooth' });
}


// ===== 전체 복사 =====
function copyAll() {
  const all = chapterTexts.join('\n\n---\n\n');
  navigator.clipboard.writeText(all).then(() => {
    const btn = document.querySelector('.btn-copy-all');
    btn.textContent = '✅ 복사됨!';
    setTimeout(() => { btn.textContent = '📋 전체 이야기 복사'; }, 2000);
  });
}
