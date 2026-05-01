import os
import json
from flask import Flask, render_template, request, Response, stream_with_context
import anthropic
from saju_calculator import calculate_saju, format_for_ai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """당신은 사주명리학 전문가이자 뛰어난 소설 작가입니다.

두 사람의 사주(四柱)와 MBTI를 분석하여, 설정된 시작 년도부터 2026년까지의 가상 인생 소설을 작성해주세요.

[글쓰기 형식 - 반드시 이 형식을 지켜주세요]
각 챕터마다 아래 형식을 사용합니다:

---
📅 [년도] · [남자이름] [나이]세 · [여자이름] [나이]세

🔮 [이 시기 사주/MBTI 한줄 해설 - 쉽고 재미있게]

[스토리 본문 - 대화체와 서술 혼합, 웹툰 감성으로]

🔮 [궁합 포인트 또는 이 시기의 운세 포인트]
---

[챕터 구성 원칙]
- 10대 (시작년도 ~ 만남 전): 각자의 성장 스케치, 1-2챕터로 짧게
- 20대 (만남/연애 시기): 연도별로 디테일하게, 만남→연애→프로포즈
- 30~40대 (결혼/육아/위기): 3-4년 단위, 주요 이벤트 중심
- 50대 이후 (중년/안정): 5년 단위, 대운(大運) 기준 큰 흐름
- 현재 2026년: 마무리 챕터 한 개

[역사 이벤트 활용 원칙 - 중요]
- 재난/참사 (세월호, 이태원, 성수대교, 삼풍 등): 절대 직접 당하지 않음. "TV 앞에서 같이 울었다", "뉴스를 보며 서로를 꼭 안았다" 정도로만
- 경제/사회 변화 (IMF, 코로나19, 금융위기): 직접 인생에 영향 - 실직, 재택근무, 사업 위기 등 구체적으로
- 일상 시대 감성: 삐삐→2G폰→스마트폰, 싸이월드 미니홈피, 카카오톡, 넷플릭스 등 독자가 "나도 그랬는데!" 할 포인트 적극 활용

[주요 역사 이벤트 참고]
1980: 광주민주화운동 | 1986: 서울아시안게임 | 1988: 서울올림픽
1992: 문민정부 출범 | 1994: 성수대교 붕괴 | 1995: 삼풍백화점 붕괴
1997: IMF 외환위기 | 2002: 월드컵 4강 | 2003: 대구지하철 화재
2008: 금융위기 | 2014: 세월호 | 2016: 촛불혁명/탄핵 | 2018: 평창올림픽
2020: 코로나19 | 2022: 이태원 참사 | 2024: 계엄령 사태

[스타일 원칙]
- 웹툰처럼 가볍고 감성적인 서술체
- 대화는 "이름: '대사'" 형식으로
- 독자가 공감할 시대 감성 포인트 반드시 포함
- 두 사람의 사주 오행 상생/상극을 관계에 자연스럽게 반영
- MBTI 특성을 캐릭터 행동과 반응에 녹여내기
- 사주 대운 흐름을 스토리에 반영
- 소설의 흐름이 자연스럽게 이어지도록 각 챕터를 연결

반드시 두 사람의 이름을 사용하세요. 이야기는 가상이지만 사주와 MBTI에 철저히 기반해야 합니다."""


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/generate', methods=['POST'])
def generate():
    data = request.json

    male = data['male']
    female = data['female']
    start_year = int(data['start_year'])

    def parse_hour(person):
        if person.get('time_unknown'):
            return None
        h = person.get('hour')
        return int(h) if h is not None and h != '' else None

    male_saju = calculate_saju(
        int(male['birth_year']), int(male['birth_month']), int(male['birth_day']),
        hour=parse_hour(male),
        is_lunar=male.get('is_lunar', False)
    )
    female_saju = calculate_saju(
        int(female['birth_year']), int(female['birth_month']), int(female['birth_day']),
        hour=parse_hour(female),
        is_lunar=female.get('is_lunar', False)
    )

    male_info = format_for_ai(male_saju, male['name'], '남', male['mbti'])
    female_info = format_for_ai(female_saju, female['name'], '여', female['mbti'])

    male_age_now = 2026 - int(male['birth_year'])
    female_age_now = 2026 - int(female['birth_year'])

    user_prompt = f"""다음 두 사람의 가상 인생 소설을 작성해주세요.

{male_info}

{female_info}

스토리 시작 년도: {start_year}년
현재: 2026년 ({male['name']} {male_age_now}세, {female['name']} {female_age_now}세)

{start_year}년부터 두 사람이 만나 사랑하고, 함께 인생의 풍파를 헤쳐나가는 가상의 소설을 써주세요.
사주와 MBTI를 철저히 반영하여 두 사람만의 독특한 이야기로 만들어주세요.
대한민국의 실제 역사적 사건들과 시대 감성을 녹여서 생동감 있게 표현해주세요."""

    def generate_stream():
        try:
            with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=8000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}]
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(generate_stream()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
        }
    )


if __name__ == '__main__':
    app.run(debug=True, port=5000)
