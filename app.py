import os
import json
from flask import Flask, render_template, request, Response, stream_with_context
import anthropic
from saju_calculator import calculate_saju, format_for_ai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ===== 사주 분석 카드 프롬프트 =====
ANALYSIS_SYSTEM = """당신은 사주명리학 전문가입니다.
두 사람의 사주와 MBTI를 분석하여 흥미롭고 공감되는 분석 카드 3개를 작성해주세요.
전문 용어는 쉽게 풀어서, 읽는 사람이 "맞아, 나 이런 사람이야!" 하고 느낄 수 있게 써주세요.

반드시 아래 형식을 정확히 지켜주세요 (===로 구분):

===남자카드===
[5~7줄로 작성]
일간 [천간] ([오행]/[음양])의 기질을 MBTI와 연결해서 설명
강점, 약점, 인생에서 중요한 것, 연애 스타일 포함

===여자카드===
[5~7줄로 작성]
일간 [천간] ([오행]/[음양])의 기질을 MBTI와 연결해서 설명
강점, 약점, 인생에서 중요한 것, 연애 스타일 포함

===궁합카드===
[5~7줄로 작성]
두 사람의 오행 관계 (상생/상극) 설명
이 조합의 강점과 위기 포인트
어떻게 하면 더 잘 맞을 수 있는지
한 줄 궁합 총평으로 마무리"""

# ===== 혼자 사주 분석 카드 프롬프트 =====
SOLO_ANALYSIS_SYSTEM = """당신은 사주명리학 전문가입니다.
한 사람의 사주와 MBTI를 분석하여 흥미롭고 공감되는 분석 카드 3개를 작성해주세요.
전문 용어는 쉽게 풀어서, 읽는 사람이 "맞아, 나 이런 사람이야!" 하고 느낄 수 있게 써주세요.

반드시 아래 형식을 정확히 지켜주세요 (===로 구분):

===나카드===
[5~7줄로 작성]
일간 [천간] ([오행]/[음양])의 기질을 MBTI와 연결해서 설명
강점, 약점, 인생에서 중요한 것, 이 사람이 살아가는 방식

===관계카드===
[5~7줄로 작성]
연애 스타일, 인간관계 패턴
어떤 사람에게 끌리는지, 어떤 사람과 잘 맞는지
관계에서의 강점과 주의할 점

===운세카드===
[5~7줄로 작성]
2026년 현재 운세 흐름
올해의 기회와 주의할 시기
한 줄 총평으로 마무리"""

# ===== 혼자 인생 소설 시스템 프롬프트 =====
SOLO_NOVEL_SYSTEM = """당신은 사주명리학 전문가이자 뛰어난 소설 작가입니다.

[글쓰기 형식 - 반드시 지켜주세요]
각 장면마다 아래 형식을 사용합니다:

---
📅 [년도] · [이름] [나이]세

🔮 [이 시기 사주/MBTI 한줄 해설 - 쉽고 재미있게]

[스토리 본문 - 대화체와 서술 혼합, 웹툰 감성으로]

🔮 [이 시기의 운세 포인트 또는 인생 메시지]
---

[중요 규칙]
- 이전 내용이 있으면 자연스럽게 이어서 쓰세요
- 억지로 빠르게 진행하지 마세요. 장면 하나하나를 충분히 묘사하세요
- 적당한 분량에서 자연스럽게 멈추세요 (다음 이어쓰기를 위해)
- 2026년 현재까지 완전히 마무리됐을 때만 맨 마지막에 ===완결=== 을 붙여주세요

[역사 이벤트 활용 원칙]
- 재난/참사 (세월호, 이태원, 성수대교, 삼풍 등): 절대 직접 당하지 않음. TV 앞에서 슬퍼하는 수준으로만
- 경제/사회 변화 (IMF, 코로나19, 금융위기): 직접 인생에 영향 - 실직, 재택근무, 사업 위기 등
- 일상 시대 감성: 삐삐→핸드폰, 싸이월드, 카카오톡, 스마트폰, 넷플릭스 등 적극 활용

[주요 역사 이벤트]
1980: 광주민주화운동 | 1986: 서울아시안게임 | 1988: 서울올림픽
1994: 성수대교 붕괴 | 1995: 삼풍백화점 붕괴 | 1997: IMF 외환위기
2002: 월드컵 4강 | 2003: 대구지하철 화재 | 2008: 금융위기
2014: 세월호 | 2016: 촛불혁명/탄핵 | 2018: 평창올림픽
2020: 코로나19 | 2022: 이태원 참사 | 2024: 계엄령 사태

[스타일]
- 웹툰처럼 가볍고 감성적인 서술체
- 대화는 "이름: '대사'" 형식
- 독자가 "나도 그랬는데!" 하는 시대 감성 포인트 포함
- 주인공의 사주 오행이 인생에 어떻게 작용하는지 자연스럽게 녹여내기
- MBTI 특성을 캐릭터 행동과 반응에 녹여내기"""

# ===== 이어쓰기 소설 시스템 프롬프트 =====
NOVEL_SYSTEM = """당신은 사주명리학 전문가이자 뛰어난 소설 작가입니다.

[글쓰기 형식 - 반드시 지켜주세요]
각 장면마다 아래 형식을 사용합니다:

---
📅 [년도] · [남자이름] [나이]세 · [여자이름] [나이]세

🔮 [이 시기 사주/MBTI 한줄 해설 - 쉽고 재미있게]

[스토리 본문 - 대화체와 서술 혼합, 웹툰 감성으로]

🔮 [궁합 포인트 또는 이 시기의 운세 포인트]
---

[중요 규칙]
- 이전 내용이 있으면 자연스럽게 이어서 쓰세요
- 억지로 빠르게 진행하지 마세요. 장면 하나하나를 충분히 묘사하세요
- 적당한 분량에서 자연스럽게 멈추세요 (다음 이어쓰기를 위해)
- 2026년 현재까지 완전히 마무리됐을 때만 맨 마지막에 ===완결=== 을 붙여주세요

[역사 이벤트 활용 원칙]
- 재난/참사 (세월호, 이태원, 성수대교, 삼풍 등): 절대 직접 당하지 않음. TV 앞에서 같이 슬퍼하는 수준으로만
- 경제/사회 변화 (IMF, 코로나19, 금융위기): 직접 인생에 영향 - 실직, 재택근무, 사업 위기 등
- 일상 시대 감성: 삐삐→핸드폰, 싸이월드, 카카오톡, 스마트폰, 넷플릭스 등 적극 활용

[주요 역사 이벤트]
1980: 광주민주화운동 | 1986: 서울아시안게임 | 1988: 서울올림픽
1994: 성수대교 붕괴 | 1995: 삼풍백화점 붕괴 | 1997: IMF 외환위기
2002: 월드컵 4강 | 2003: 대구지하철 화재 | 2008: 금융위기
2014: 세월호 | 2016: 촛불혁명/탄핵 | 2018: 평창올림픽
2020: 코로나19 | 2022: 이태원 참사 | 2024: 계엄령 사태

[스타일]
- 웹툰처럼 가볍고 감성적인 서술체
- 대화는 "이름: '대사'" 형식
- 독자가 "나도 그랬는데!" 하는 시대 감성 포인트 포함
- 두 사람의 사주 오행 상생/상극을 관계에 자연스럽게 반영
- MBTI 특성을 캐릭터 행동과 반응에 녹여내기"""


def build_novel_prompt(male, female, male_saju, female_saju, start_year, part_num, prev_text=""):
    male_info = format_for_ai(male_saju, male['name'], '남', male['mbti'])
    female_info = format_for_ai(female_saju, female['name'], '여', female['mbti'])
    male_age = 2026 - int(male['birth_year'])
    female_age = 2026 - int(female['birth_year'])

    base = f"""{male_info}

{female_info}

스토리 시작 년도: {start_year}년
현재: 2026년 ({male['name']} {male_age}세, {female['name']} {female_age}세)"""

    if part_num == 1:
        return f"""{base}

{start_year}년부터 두 사람 각자의 유년기와 성장기 이야기를 시작해주세요.
두 사람을 번갈아 가며 충분히 써주세요. 자연스러운 분량에서 멈추세요.
2026년까지 완전히 마무리되면 ===완결===을 붙여주세요."""
    else:
        return f"""{base}

[이전 이야기의 마지막 부분]
{prev_text}

위 내용에서 자연스럽게 이어서 써주세요.
자연스러운 분량에서 멈추세요.
2026년까지 완전히 마무리되면 ===완결===을 붙여주세요."""


def build_solo_novel_prompt(person, saju, start_year, part_num, prev_text=""):
    info = format_for_ai(saju, person['name'], '본인', person['mbti'])
    age = 2026 - int(person['birth_year'])

    base = f"""{info}

스토리 시작 년도: {start_year}년
현재: 2026년 ({person['name']} {age}세)"""

    if part_num == 1:
        return f"""{base}

{start_year}년부터 {person['name']}의 유년기와 성장기 이야기를 시작해주세요.
충분히 써주세요. 자연스러운 분량에서 멈추세요.
2026년까지 완전히 마무리되면 ===완결===을 붙여주세요."""
    else:
        return f"""{base}

[이전 이야기의 마지막 부분]
{prev_text}

위 내용에서 자연스럽게 이어서 써주세요.
자연스러운 분량에서 멈추세요.
2026년까지 완전히 마무리되면 ===완결===을 붙여주세요."""


def stream_response(system, user_prompt):
    def generate():
        try:
            with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=4000,
                system=system,
                messages=[{"role": "user", "content": user_prompt}]
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


def parse_person(data, key):
    p = data[key]
    time_unknown = p.get('time_unknown', False)
    hour = None if time_unknown else (int(p['hour']) if p.get('hour') not in (None, '') else None)
    saju = calculate_saju(
        int(p['birth_year']), int(p['birth_month']), int(p['birth_day']),
        hour=hour,
        is_lunar=p.get('is_lunar', False)
    )
    return p, saju


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    male, male_saju = parse_person(data, 'male')
    female, female_saju = parse_person(data, 'female')

    male_info = format_for_ai(male_saju, male['name'], '남', male['mbti'])
    female_info = format_for_ai(female_saju, female['name'], '여', female['mbti'])

    user_prompt = f"""다음 두 사람의 사주와 MBTI를 분석해주세요.

{male_info}

{female_info}

각 카드를 재미있고 공감 가게 작성해주세요."""

    return stream_response(ANALYSIS_SYSTEM, user_prompt)


@app.route('/generate', methods=['POST'])
def generate():
    data = request.json
    male, male_saju = parse_person(data, 'male')
    female, female_saju = parse_person(data, 'female')

    part_num = int(data.get('part_num', 1))
    start_year = int(data.get('start_year', 1980))
    prev_text = data.get('prev_text', '')  # 이전 파트 마지막 1000자

    user_prompt = build_novel_prompt(
        male, female, male_saju, female_saju,
        start_year, part_num, prev_text
    )

    return stream_response(NOVEL_SYSTEM, user_prompt)


@app.route('/analyze_solo', methods=['POST'])
def analyze_solo():
    data = request.json
    person, saju = parse_person(data, 'person')
    info = format_for_ai(saju, person['name'], '본인', person['mbti'])
    user_prompt = f"""다음 사람의 사주와 MBTI를 분석해주세요.

{info}

각 카드를 재미있고 공감 가게 작성해주세요."""
    return stream_response(SOLO_ANALYSIS_SYSTEM, user_prompt)


@app.route('/generate_solo', methods=['POST'])
def generate_solo():
    data = request.json
    person, saju = parse_person(data, 'person')
    part_num = int(data.get('part_num', 1))
    start_year = int(data.get('start_year', 1980))
    prev_text = data.get('prev_text', '')
    user_prompt = build_solo_novel_prompt(person, saju, start_year, part_num, prev_text)
    return stream_response(SOLO_NOVEL_SYSTEM, user_prompt)


if __name__ == '__main__':
    app.run(debug=True, port=5000)
