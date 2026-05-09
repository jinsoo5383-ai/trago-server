content = open('/Users/jinsookim/trago-server/trago_live.html', encoding='utf-8').read()
old = "['pb-바나나','pb-망고','pb-파인애플','pb-오렌지'].forEach"
new = "['pb-바나나','pb-망고','pb-파인애플','pb-오렌지','pb-레몬','pb-체리','pb-포도','pb-키위','pb-블루베리','pb-아보카도'].forEach"
content = content.replace(old, new)
open('/Users/jinsookim/trago-server/trago_live.html', 'w', encoding='utf-8').write(content)
print("완료:", old in content or new in content)
