content = open('/Users/jinsookim/trago-server/trago_live.html', encoding='utf-8').read()
old = '''<button id="pb-오렌지" class="btn-sm btn-gray" onclick="loadPriceChart('오렌지','pb-오렌지')">오렌지</button>
    </div>'''
new = '''<button id="pb-오렌지" class="btn-sm btn-gray" onclick="loadPriceChart('오렌지','pb-오렌지')">오렌지</button>
      <button id="pb-레몬" class="btn-sm btn-gray" onclick="loadPriceChart('레몬','pb-레몬')">레몬</button>
      <button id="pb-체리" class="btn-sm btn-gray" onclick="loadPriceChart('체리','pb-체리')">체리</button>
      <button id="pb-포도" class="btn-sm btn-gray" onclick="loadPriceChart('포도','pb-포도')">포도</button>
      <button id="pb-키위" class="btn-sm btn-gray" onclick="loadPriceChart('키위','pb-키위')">키위</button>
      <button id="pb-블루베리" class="btn-sm btn-gray" onclick="loadPriceChart('블루베리','pb-블루베리')">블루베리</button>
      <button id="pb-아보카도" class="btn-sm btn-gray" onclick="loadPriceChart('아보카도','pb-아보카도')">아보카도</button>
    </div>'''
content = content.replace(old, new)
open('/Users/jinsookim/trago-server/trago_live.html', 'w', encoding='utf-8').write(content)
print("완료")
