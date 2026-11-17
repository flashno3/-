# KBO 시뮬레이션 프로젝트 v2 (2026 시즌 기반)
## 실행 순서
1. python3 ratings.py            # 타자·투수 능력치 (환경변수: REG_SCALE, OUT, DEFADJ, DEFSHARE)
2. python3 fielding.py           # 수비 능력치 (범위·실책·포수 도루저지/포일)
3. python3 engine2.py N out.json # N시즌 시뮬레이션 (환경변수: RAT, FIELD, K2, BOFF, TRACK)
## 모드
- 재현 모드: REG_SCALE=0.03 → ratings_replay.json (2026 시즌 재현용, 보정 거의 없음)
- 예측 모드: REG_SCALE=1.0  → ratings_forward.json (다음 시즌 진행용, 표본 작은 선수를 평균으로 당김)
## 데이터 주의
- 대니엘(KT)·보스(삼성)는 FanGraphs가 2배 집계 → 절반으로 보정 (pitching_2026.json 'fixed' 필드)
- 한재승(KIA)은 KBO 기록실 값 직접 입력 (TBF는 하한값, BS·IBB·WP·BK 미확인)
- 신윤후=신용수, 유로결=유장혁 은 이름 변경 추정 (확정 아님)
- 이적 선수(데이비슨·하주석·이정범·이형범) 소속 구간은 팀별 포지션 이닝 차이로 추정
- 구장 효과·좌우 투타·2024/2025 데이터는 미반영

## 구장 효과(파크팩터) — 2024~2026 표 기준
- parks_raw.json: 사용자가 제공한 3년치 표(득점·단타·2루타·3루타·홈런·장타) 옮겨 적은 값 (1000=중립)
- parks.py: 해마다 안정적인 정도(상관)만큼 평균 쪽으로 당기고(홈런 0.97, 득점 0.92, 단타 0.45, 2루타·3루타 0.40), 경기 비중으로 정규화
- calibrate_parks.py: 득점 파크팩터(가장 안정적인 값)에 맞게 비홈런 안타 잔여 보정을 반복 계산 → resid.json
- ratings.py: PARK=y2026|blend|none (선수 기록에서 팀 환경(홈 절반+원정 절반)을 걷어냄)
- engine2.py: PARK 환경변수로 같은 구장 효과를 경기 구장에 적용
- 재현: PARK=y2026 RAT=ratings_replay_pk.json / 예측: PARK=blend RAT=ratings_forward_pk.json
- 주의: 2025 대전의 득점 외 항목은 원자료가 전부 1.000이라 제외, 2024 대전은 공란
