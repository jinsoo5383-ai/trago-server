content = open('/Users/jinsookim/trago-server/trago_live.html', encoding='utf-8').read()

old = """  if (!item) {
    // KAMIS 없으면 가락시장 경락가격에서 찾기
    const garakItem = (window._garakData||[]).find(d => (d.PUM_NM_A||'').includes(keyword) && d.G_NAME_A === '상');
    if (garakItem) {
      const labels = ['전년', '전일', '오늘'];
      const prices = [garakItem.PAV_PY_A, garakItem.PAV_P_A, garakItem.AV_P_A].map(v => v || null);
      if (priceChart) priceChart.destroy();
      priceChart = new Chart(document.getElementById('priceChart'), {
        type: 'line',
        data: { labels, datasets: [{ label: keyword + ' (가락시장 상품)', data: prices, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', fill: true, tension: 0.3, pointRadius: 6, pointBackgroundColor: '#1D9E75', borderWidth: 2.5 }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} }, scales:{ x:{ticks:{font:{size:13},color:'#888780'},grid:{display:false}}, y:{ticks:{font:{size:11},color:'#888780',callback:v=>'₩'+v.toLocaleString()},grid:{color:'rgba(136,135,128,0.12)'}} } }
      });
    } else {
      if (priceChart) priceChart.destroy();
      priceChart = new Chart(document.getElementById('priceChart'), {
        type: 'line',
        data: { labels: ['1년전','1개월전','어제','오늘'], datasets: [{ label: keyword, data: [null,null,null,null], borderColor: '#ccc' }] },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, title:{display:true, text: keyword + ' — 데이터 없음', color:'#888780', font:{size:13}} }, scales:{ x:{grid:{display:false}}, y:{display:false} } }
      });
    }
    return;
  }"""

new = """  if (!item) {
    // KAMIS 없으면 가락시장 API 직접 호출
    fetch(`${SERVER}/api/garak`).then(r=>r.json()).then(json => {
      const garakItem = (json.data||[]).find(d => (d.PUM_NM_A||'').includes(keyword) && d.G_NAME_A === '상');
      if (garakItem && garakItem.AV_P_A > 0) {
        const labels = ['전년', '전일', '오늘'];
        const prices = [garakItem.PAV_PY_A||null, garakItem.PAV_P_A||null, garakItem.AV_P_A||null];
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

content = content.replace(old, new)
open('/Users/jinsookim/trago-server/trago_live.html', 'w', encoding='utf-8').write(content)
print("완료")
