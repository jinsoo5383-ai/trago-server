content = open('/Users/jinsookim/trago-server/trago_live.html', encoding='utf-8').read()

old = """  const item = priceData.find(d => d.name?.includes(keyword));
  if (!item) return;"""

new = """  const item = priceData.find(d => d.name?.includes(keyword));
  if (!item) {
    if (priceChart) priceChart.destroy();
    priceChart = new Chart(document.getElementById('priceChart'), {
      type: 'line',
      data: { labels: ['1년전','1개월전','어제','오늘'], datasets: [{ label: keyword, data: [null,null,null,null], borderColor: '#ccc' }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{display:true, text: keyword + ' — KAMIS 미제공 품목 (가락시장 경락가격 참고)', color:'#888780', font:{size:13}} }, scales:{ x:{grid:{display:false}}, y:{display:false} } }
    });
    return;
  }"""

if old in content:
    content = content.replace(old, new)
    print("교체 성공")
else:
    print("못 찾음")
    # 위치 찾기
    idx = content.find('priceData.find')
    print(content[idx-50:idx+200])

open('/Users/jinsookim/trago-server/trago_live.html', 'w', encoding='utf-8').write(content)
