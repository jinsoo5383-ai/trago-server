content = open('/Users/jinsookim/trago-server/trago_live.html', encoding='utf-8').read()

# AV_P_A > 0 조건을 PAV_P_A > 0 으로 변경 (전일가격 기준)
old = "      if (garakItem && garakItem.AV_P_A > 0) {"
new = "      if (garakItem && (garakItem.AV_P_A > 0 || garakItem.PAV_P_A > 0)) {"

# 가격도 AV_P_A 없으면 PAV_P_A 사용
old2 = "        const prices = [garakItem.PAV_PY_A||null, garakItem.PAV_P_A||null, garakItem.AV_P_A||null];"
new2 = "        const prices = [garakItem.PAV_PY_A||null, garakItem.PAV_P_A||null, garakItem.AV_P_A||garakItem.PAV_P_A||null];"

content = content.replace(old, new).replace(old2, new2)
open('/Users/jinsookim/trago-server/trago_live.html', 'w', encoding='utf-8').write(content)
print("완료")
