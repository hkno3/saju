// ===== 별 배경 =====
(function initStars() {
  const canvas = document.getElementById('stars');
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createStars() {
    stars = [];
    for (let i = 0; i < 180; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.2 + 0.2,
        alpha: Math.random(),
        speed: Math.random() * 0.008 + 0.002,
      });
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

  resize();
  createStars();
  draw();
  window.addEventListener('resize', () => { resize(); createStars(); });
})();


// ===== 모름 체크박스 처리 =====
document.getElementById('male_time_unknown').addEventListener('change', function () {
  document.getElementById('male_hour').disabled = this.checked;
  document.getElementById('male_hour').style.opacity = this.checked ? '0.4' : '1';
});

document.getElementById('female_time_unknown').addEventListener('change', function () {
  document.getElementById('female_hour').disabled = this.checked;
  document.getElementById('female_hour').style.opacity = this.checked ? '0.4' : '1';
});


// ===== 폼 제출 =====
document.getElementById('saju-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const maleName = document.getElementById('male_name').value.trim();
  const femaleName = document.getElementById('female_name').value.trim();
  const maleMbti = document.getElementById('male_mbti').value;
  const femaleMbti = document.getElementById('female_mbti').value;

  if (!maleName || !femaleName || !maleMbti || !femaleMbti) {
    alert('모든 항목을 입력해주세요.');
    return;
  }

  const maleYear = parseInt(document.getElementById('male_year').value);
  const maleMonth = parseInt(document.getElementById('male_month').value);
  const maleDay = parseInt(document.getElementById('male_day').value);
  const femaleYear = parseInt(document.getElementById('female_year').value);
  const femaleMonth = parseInt(document.getElementById('female_month').value);
  const femaleDay = parseInt(document.getElementById('female_day').value);

  if (!maleYear || !maleMonth || !maleDay || !femaleYear || !femaleMonth || !femaleDay) {
    alert('생년월일을 모두 입력해주세요.');
    return;
  }

  const maleCal = document.querySelector('input[name="male_cal"]:checked').value;
  const femaleCal = document.querySelector('input[name="female_cal"]:checked').value;
  const maleTimeUnknown = document.getElementById('male_time_unknown').checked;
  const femaleTimeUnknown = document.getElementById('female_time_unknown').checked;
  const maleHour = maleTimeUnknown ? null : parseInt(document.getElementById('male_hour').value);
  const femaleHour = femaleTimeUnknown ? null : parseInt(document.getElementById('female_hour').value);
  const startYear = parseInt(document.getElementById('start_year').value);

  const payload = {
    start_year: startYear,
    male: {
      name: maleName,
      birth_year: maleYear,
      birth_month: maleMonth,
      birth_day: maleDay,
      is_lunar: maleCal === 'lunar',
      time_unknown: maleTimeUnknown,
      hour: maleHour,
      mbti: maleMbti,
    },
    female: {
      name: femaleName,
      birth_year: femaleYear,
      birth_month: femaleMonth,
      birth_day: femaleDay,
      is_lunar: femaleCal === 'lunar',
      time_unknown: femaleTimeUnknown,
      hour: femaleHour,
      mbti: femaleMbti,
    },
  };

  // UI 전환
  document.getElementById('generate-btn').disabled = true;
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('story-container').classList.add('hidden');
  document.getElementById('story-content').innerHTML = '';
  document.getElementById('story-title').textContent =
    `${maleName} & ${femaleName}의 이야기`;

  // SSE 스트리밍
  let rawText = '';

  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('서버 오류가 발생했습니다.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('story-container').classList.remove('hidden');

    // 실시간 raw 텍스트 표시
    const rawDiv = document.createElement('div');
    rawDiv.className = 'story-raw';
    document.getElementById('story-content').appendChild(rawDiv);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            rawDiv.textContent += '\n\n⚠️ 오류: ' + parsed.error;
            break;
          }
          if (parsed.text) {
            rawText += parsed.text;
            rawDiv.textContent = rawText;
            // 자동 스크롤
            rawDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        } catch (_) { /* JSON 파싱 실패 무시 */ }
      }
    }

    // 완성 후 챕터 카드로 변환
    renderChapters(rawText);

  } catch (err) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('story-container').classList.remove('hidden');
    document.getElementById('story-content').innerHTML =
      `<p style="color:#ff6b6b;">오류가 발생했습니다: ${err.message}</p>`;
  } finally {
    document.getElementById('generate-btn').disabled = false;
  }
});


// ===== 챕터 카드 렌더링 =====
function renderChapters(text) {
  const container = document.getElementById('story-content');
  container.innerHTML = '';

  // --- 구분자로 챕터 분리
  const chapters = text.split(/\n---+\n/).map(c => c.trim()).filter(Boolean);

  chapters.forEach(chapter => {
    const card = document.createElement('div');
    card.className = 'chapter-card';

    // 📅 줄 추출
    const yearMatch = chapter.match(/^📅\s*(.+)/m);
    // 🔮 줄들 추출 (첫번째=해설, 마지막=궁합)
    const saju_notes = [...chapter.matchAll(/^🔮\s*(.+)/mg)].map(m => m[1].trim());

    // 본문 (📅, 🔮 줄 제외)
    const bodyLines = chapter
      .split('\n')
      .filter(l => !l.startsWith('📅') && !l.startsWith('🔮'))
      .join('\n')
      .trim();

    if (yearMatch) {
      const yearSpan = document.createElement('span');
      yearSpan.className = 'chapter-year';
      yearSpan.textContent = '📅 ' + yearMatch[1];
      card.appendChild(yearSpan);
    }

    if (saju_notes[0]) {
      const note = document.createElement('div');
      note.className = 'saju-note';
      note.textContent = '🔮 ' + saju_notes[0];
      card.appendChild(note);
    }

    if (bodyLines) {
      const body = document.createElement('div');
      body.className = 'story-body';
      body.textContent = bodyLines;
      card.appendChild(body);
    }

    if (saju_notes[1]) {
      const gungham = document.createElement('div');
      gungham.className = 'gungham-note';
      gungham.textContent = '🔮 ' + saju_notes[1];
      card.appendChild(gungham);
    }

    container.appendChild(card);
  });

  // 챕터가 제대로 분리 안된 경우 raw로 fallback
  if (chapters.length <= 1) {
    container.innerHTML = '';
    const raw = document.createElement('div');
    raw.className = 'story-raw';
    raw.textContent = text;
    container.appendChild(raw);
  }
}


// ===== 전체 복사 =====
function copyStory() {
  const text = document.getElementById('story-content').innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✅ 복사됨!';
    setTimeout(() => { btn.textContent = '📋 전체 복사'; }, 2000);
  });
}
