content = open('/Users/jinsookim/trago-server/trago_live.html', encoding='utf-8').read()

old = """  if (!item) {
    fetch(`${SERVER}/api/garak`).then(r=>r.json()).then(json => {
      const garakItem = (json.data||[]).find(d => (d.PUM_NM_A||'').includes(keyword) && d.G_NAME_A === '상');
      if (garakItem && (garakItem.AV_P_A > 0 || garakItem.PAV_P_A > 0)) {
        const labels = ['전년', '전일', '오늘'];
        const prices = [garakItem.PAV_PY_A||null, garakItem.PAV_P_A||null, garakItem.AV_P_A||garakItem.PAV_P_A||null];
        if (priceChart) priceChart.destroy();
        priceChart = new Chart(document.getElementById('priceChart'), {
          type: 'line',
          data: { labels, datasets: [{ label: keyword + ' (가락시장 상품)', data: prices, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', fill: true, tension: 0.3, pointRadius: 6, pointBackgroundColor: '#1D9E75', borderWidth: 2.5 }] },
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ticks:{font:{size:13},color:'#888780'},grid:{display:false}}, y:{ticks:{font:{size:11},color:'#888780',callback:v=>'₩'+v.toLocaleString()},grid:{color:'rgba(136,135,128,0.12)'}} } }
        });
      } else {
        if (priceChart) priceChart.destroy();
      }
    });
    return;
  }"""

new = """  if (!item) {
    // 가락시장 기간별 히스토리로 차트 그리기
    const garakKeywordMap = {
      '포도': '포도', '키위': '키위 기타', '블루베리': '블루베리',
      '아보카도': '아보카도', '체리': '체리'
    };
    const garakKeyword = garakKeywordMap[keyword] || keyword;
    document.getElementById('priceChart').parentElement.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:13px;">📊 가락시장 데이터 불러오는 중... (30초 소요)</div><canvas id="priceChart" role="img"></canvas>';
    fetch(`${SERVER}/api/garak/history?item=${encodeURIComponent(garakKeyword)}&grade=상&days=60`)
      .then(r=>r.json()).then(json => {
        if (!json.data || json.data.length === 0) {
          document.getElementById('priceChart').parentElement.querySelector('div').textContent = keyword + ' — 데이터 없음';
          return;
        }
        document.getElementById('priceChart').parentElement.querySelector('div').remove();
        const labels = json.data.map(d => d.date.slice(4,6)+'/'+d.date.slice(6,8));
        const prices = json.data.map(d => d.price);
        if (priceChart) priceChart.destroy();
        priceChart = new Chart(document.getElementById('priceChart'), {
          type: 'line',
          data: { labels, datasets: [{ label: keyword + ' (가락시장)', data: prices, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', fill: true, tension: 0.3, pointRadius: 2, pointBackgroundColor: '#1D9E75', borderWidth: 2 }] },
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ticks:{font:{size:10},color:'#888780',maxTicksLimit:12},grid:{display:false}}, y:{ticks:{font:{size:11},color:'#888780',callback:v=>'₩'+v.toLocaleString()},grid:{color:'rgba(136,135,128,0.12)'}} } }
        });
      });
    return;
  }"""

if old in content:
    content = content.replace(old, new)
    print("교체 성공")
else:
    print("못찾음")

open('/Users/jinsookim/trago-server/trago_live.html', 'w', encoding='utf-8').write(content)
