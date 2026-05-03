try:
    from korean_lunar_calendar import KoreanLunarCalendar
    HAS_LUNAR = True
except ImportError:
    HAS_LUNAR = False

CHEONGAN = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']
JIJI = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해']

CHEONGAN_OHANG = {
    '갑': '목', '을': '목', '병': '화', '정': '화',
    '무': '토', '기': '토', '경': '금', '신': '금',
    '임': '수', '계': '수'
}

JIJI_OHANG = {
    '자': '수', '축': '토', '인': '목', '묘': '목',
    '진': '토', '사': '화', '오': '화', '미': '토',
    '신': '금', '유': '금', '술': '토', '해': '수'
}

CHEONGAN_EUMYANG = {
    '갑': '양', '을': '음', '병': '양', '정': '음',
    '무': '양', '기': '음', '경': '양', '신': '음',
    '임': '양', '계': '음'
}

# 양력 월 -> 지지 index (1월=축=1, 2월=인=2, ..., 12월=자=0)
MONTH_TO_JIJI_IDX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0]

# 시간(0~23) -> 지지 index
def hour_to_jiji_idx(hour):
    if hour == 23:
        return 0  # 자시
    return (hour + 1) // 2


def get_julian_day(year, month, day):
    if month <= 2:
        year -= 1
        month += 12
    A = year // 100
    B = 2 - A + A // 4
    return int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day + B - 1524


def get_year_pillar(year):
    idx = (year - 4) % 60
    return CHEONGAN[idx % 10], JIJI[idx % 12]


def get_month_pillar(year, month):
    jiji_idx = MONTH_TO_JIJI_IDX[month - 1]

    # 년 천간 그룹에 따른 인월(jiji=2) 기준 월 천간
    year_cheongan_idx = (year - 4) % 10
    year_group = year_cheongan_idx % 5
    # 갑기→병(2), 을경→무(4), 병신→경(6), 정임→임(8), 무계→갑(0)
    inweol_base = [2, 4, 6, 8, 0][year_group]
    cheongan_idx = (inweol_base + (jiji_idx - 2) + 10) % 10

    return CHEONGAN[cheongan_idx], JIJI[jiji_idx]


def get_day_pillar(year, month, day):
    jd = get_julian_day(year, month, day)
    # 기준: 2023-01-22(JD=2459967) = 경술일(경=6, 술=10)
    # (JD + 19) % 10 → 천간, (JD + 19) % 12 → 지지
    cheongan_idx = (jd + 19) % 10
    jiji_idx = (jd + 19) % 12
    return CHEONGAN[cheongan_idx], JIJI[jiji_idx]


def get_hour_pillar(day_cheongan, hour):
    jiji_idx = hour_to_jiji_idx(hour)

    day_cheongan_idx = CHEONGAN.index(day_cheongan)
    day_group = day_cheongan_idx % 5
    # 갑기→갑(0), 을경→병(2), 병신→무(4), 정임→경(6), 무계→임(8)
    hour_base = [0, 2, 4, 6, 8][day_group]
    cheongan_idx = (hour_base + jiji_idx) % 10

    return CHEONGAN[cheongan_idx], JIJI[jiji_idx]


def lunar_to_solar(year, month, day):
    if not HAS_LUNAR:
        return year, month, day
    try:
        cal = KoreanLunarCalendar()
        cal.setLunarDate(year, month, day, False)
        solar = cal.SolarIsoFormat()
        parts = solar.split('-')
        return int(parts[0]), int(parts[1]), int(parts[2])
    except Exception:
        return year, month, day


def calculate_saju(birth_year, birth_month, birth_day, hour=None, is_lunar=False):
    if is_lunar:
        birth_year, birth_month, birth_day = lunar_to_solar(birth_year, birth_month, birth_day)

    yc, yj = get_year_pillar(birth_year)
    mc, mj = get_month_pillar(birth_year, birth_month)
    dc, dj = get_day_pillar(birth_year, birth_month, birth_day)

    result = {
        'solar': {'year': birth_year, 'month': birth_month, 'day': birth_day},
        'year': {'c': yc, 'j': yj, 'co': CHEONGAN_OHANG[yc], 'jo': JIJI_OHANG[yj]},
        'month': {'c': mc, 'j': mj, 'co': CHEONGAN_OHANG[mc], 'jo': JIJI_OHANG[mj]},
        'day': {'c': dc, 'j': dj, 'co': CHEONGAN_OHANG[dc], 'jo': JIJI_OHANG[dj]},
        'has_hour': hour is not None,
        'day_master': dc,
        'day_master_ohang': CHEONGAN_OHANG[dc],
        'day_master_eumyang': CHEONGAN_EUMYANG[dc],
    }

    if hour is not None:
        hc, hj = get_hour_pillar(dc, hour)
        result['hour'] = {'c': hc, 'j': hj, 'co': CHEONGAN_OHANG[hc], 'jo': JIJI_OHANG[hj]}

    return result


def pillar_str(p):
    return f"{p['c']}{p['j']}({p['co']}/{p['jo']})"


def format_for_ai(saju, name, gender, mbti):
    s = saju['solar']
    lines = [
        f"[{name} ({gender})]",
        f"생년월일: {s['year']}년 {s['month']}월 {s['day']}일 (양력)",
        f"MBTI: {mbti}",
        f"일간(日干): {saju['day_master']} - {saju['day_master_ohang']}({saju['day_master_eumyang']})",
        f"사주 4주: 년주 {pillar_str(saju['year'])} | 월주 {pillar_str(saju['month'])} | 일주 {pillar_str(saju['day'])} | " +
        (f"시주 {pillar_str(saju['hour'])}" if saju['has_hour'] else "시주 없음(시간 미상, 3주로 분석)"),
    ]
    return '\n'.join(lines)


# ===== 대운 계산 =====
# 각 월의 절기 시작일 (대략적인 양력 날짜, 1~12월)
JEOLGI_DAY = [6, 4, 6, 5, 6, 6, 7, 7, 8, 8, 7, 7]


def get_daewoon_direction(day_master, gender):
    is_yang = CHEONGAN_EUMYANG[day_master] == '양'
    is_male = gender == '남'
    return (is_yang and is_male) or (not is_yang and not is_male)


def get_daewoon_number(birth_year, birth_month, birth_day, is_forward):
    from datetime import date as Date
    try:
        birth = Date(birth_year, birth_month, birth_day)
        jd = JEOLGI_DAY[birth_month - 1]

        if is_forward:
            if birth_day < jd:
                target = Date(birth_year, birth_month, jd)
            else:
                nm = birth_month % 12 + 1
                ny = birth_year + (1 if nm <= birth_month else 0)
                target = Date(ny, nm, JEOLGI_DAY[nm - 1])
            days = (target - birth).days
        else:
            if birth_day >= jd:
                target = Date(birth_year, birth_month, jd)
            else:
                pm = (birth_month - 2) % 12 + 1
                py = birth_year - (1 if pm >= birth_month else 0)
                target = Date(py, pm, JEOLGI_DAY[pm - 1])
            days = (birth - target).days

        return max(1, min(9, round(days / 3)))
    except Exception:
        return 3


def calculate_daewoon(saju, gender):
    day_master = saju['day_master']
    mc = saju['month']['c']
    mj = saju['month']['j']
    birth = saju['solar']

    is_forward = get_daewoon_direction(day_master, gender)
    daewoon_num = get_daewoon_number(birth['year'], birth['month'], birth['day'], is_forward)

    mc_idx = CHEONGAN.index(mc)
    mj_idx = JIJI.index(mj)

    result = []
    for i in range(8):
        if is_forward:
            c_idx = (mc_idx + i + 1) % 10
            j_idx = (mj_idx + i + 1) % 12
        else:
            c_idx = (mc_idx - i - 1) % 10
            j_idx = (mj_idx - i - 1) % 12

        c = CHEONGAN[c_idx]
        j = JIJI[j_idx]
        start = daewoon_num + i * 10
        result.append({
            'index': i + 1,
            'start_age': start,
            'end_age': start + 9,
            'pillar': c + j,
            'cheongan': c,
            'jiji': j,
            'ohang_c': CHEONGAN_OHANG[c],
            'ohang_j': JIJI_OHANG[j],
        })

    return result, is_forward, daewoon_num


def format_daewoon_for_ai(daewoon_list, name, birth_year, current_year=2026):
    current_age = current_year - birth_year
    lines = [f"{name}의 대운 목록:"]
    for d in daewoon_list:
        is_current = d['start_age'] <= current_age < d['end_age']
        marker = ' ★현재★' if is_current else ''
        lines.append(
            f"대운{d['index']}: {d['start_age']}~{d['end_age']}세 | "
            f"{d['pillar']} ({d['ohang_c']}천간/{d['ohang_j']}지지){marker}"
        )
    return '\n'.join(lines)
