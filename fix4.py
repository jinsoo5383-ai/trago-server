content = open('/Users/jinsookim/trago-server/index.js').read()
old = "const fruits = ['바나나', '망고', '파인애플', '오렌지', '레몬', '포도', '체리'];"
new = "const fruits = ['바나나', '망고', '파인애플', '오렌지', '레몬', '포도', '체리', '키위', '블루베리', '아보카도'];"
content = content.replace(old, new)
open('/Users/jinsookim/trago-server/index.js', 'w').write(content)
print("완료" if new in content else "못찾음")
