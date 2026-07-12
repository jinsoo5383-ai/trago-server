const express = require('express');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');

const app = express();
app.use(cors());
app.use(express.static(__dirname));
app.use(express.json());

const API_KEY = '54fa6a4fb68a227e04811bbe2844d5332bc4319c3105190c5e20758bc45af3ae';
const KAMIS_KEY = '4c4c7781-ee4a-44fc-bc34-c015aba41070';
const KAMIS_ID = '7624';

app.get('/', (req, res) => {
  res.json({ status: 'Trago 서버 작동 중', version: '5.0' });
});

// 기존 API는 OLD 키 사용
// 1. 관세청 수입과일 물량 (품목별)
app.get('/api/trade', async (req, res) => {
  const { start = '202501', end = '202503', hs = '0803' } = req.query;
  try {
    const url = 'https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList';
    const response = await axios.get(url, {
      params: { serviceKey: API_KEY, strtYymm: start, endYymm: end, hsSgn: hs, pageNo: 1, numOfRows: 100 }
    });
    const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
    const items = parsed?.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    const monthly = {};
    arr.forEach(item => {
      if (item.year === '총계') return;
      const ym = item.year;
      if (!monthly[ym]) monthly[ym] = { year: ym, impWgt: 0, impDlr: 0 };
      monthly[ym].impWgt += parseInt(item.impWgt || 0);
      monthly[ym].impDlr += parseInt(item.impDlr || 0);
    });
    const result = Object.values(monthly).sort((a,b) => a.year.localeCompare(b.year));
    res.json({ success: true, count: result.length, data: result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 2. 선박 입출항 정보
app.get('/api/vessel', async (req, res) => {
  const { port = '020', sde, ede } = req.query;
  const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'');
  // 한국시간 오늘 날짜
  const getToday = () => {
    const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0,10).replace(/-/g,'');
  };
  const startDate = sde || getToday();
  const endDate = ede || startDate;
  try {
    const url = 'https://apis.data.go.kr/1192000/VsslEtrynd5/Info5';
    const response = await axios.get(url, {
      params: { serviceKey: API_KEY, prtAgCd: port, sde: startDate, ede: endDate, deGb: 'I', numOfRows: 30, pageNo: 1 }
    });
    const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
    const items = parsed?.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    // 데이터 없으면 하루 전 자동 재시도
    if (arr.length === 0 && !sde) {
      const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
      kst.setUTCDate(kst.getUTCDate() - 1);
      const yesterday = kst.toISOString().slice(0,10).replace(/-/g,'');
      const res2 = await axios.get('https://apis.data.go.kr/1192000/VsslEtrynd5/Info5', {
        params: { serviceKey: API_KEY, prtAgCd: port, sde: yesterday, ede: yesterday, deGb: 'I', numOfRows: 30, pageNo: 1 }
      });
      const parsed2 = await xml2js.parseStringPromise(res2.data, { explicitArray: false });
      const items2 = parsed2?.response?.body?.items?.item || [];
      const arr2 = Array.isArray(items2) ? items2 : [items2];
      if (arr2.length > 0) {
        return res.json({ success: true, count: arr2.length, date: yesterday, data: arr2 });
      }
    }
    res.json({ success: true, count: arr.length, date: startDate, data: arr });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 3. KAMIS 수입과일 오늘 실시간 가격
app.get('/api/fruit-prices', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0,10).replace(/-/g, '.');
    const url = 'https://www.kamis.or.kr/service/price/xml.do';
    const response = await axios.get(url, {
      params: { action: 'dailySalesList', p_date: today, p_cert_key: KAMIS_KEY, p_cert_id: KAMIS_ID, p_returntype: 'json' }
    });
    const allPrices = response.data?.price || [];
    const fruits = ['바나나', '망고', '파인애플', '오렌지', '레몬', '포도', '체리', '키위', '블루베리', '아보카도'];
    const fruitPrices = allPrices.filter(p =>
      fruits.some(f => p.productName?.includes(f)) && p.product_cls_name === '도매'
    );
    const result = fruitPrices.map(p => ({
      name: p.productName, unit: p.unit,
      today: p.dpr1, yesterday: p.dpr2, lastMonth: p.dpr3, lastYear: p.dpr4,
      direction: p.direction, change: p.value, date: p.lastest_day
    }));
    res.json({ success: true, date: today, count: result.length, data: result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 4. KAMIS 기간별 가격
app.get('/api/price', async (req, res) => {
  const { start = '2025-01-01', end, item = '42650' } = req.query;
  const endDate = end || new Date().toISOString().slice(0,10);
  try {
    const url = 'https://www.kamis.or.kr/service/price/xml.do';
    const response = await axios.get(url, {
      params: {
        action: 'periodProductList', p_startday: start, p_endday: endDate,
        p_itemcategorycode: '400', p_itemcode: item, p_kindcode: '00',
        p_productrankcode: '', p_convert_kg_yn: 'Y',
        p_cert_key: KAMIS_KEY, p_cert_id: KAMIS_ID, p_returntype: 'json'
      }
    });
    res.json({ success: true, data: response.data });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 5. 가락시장 수입품목 직접 가격
app.get('/api/garak', async (req, res) => {
  const today = new Date();
  const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'');
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  const p_ymd = req.query.date || fmt(today);
  const p_jymd = fmt(yesterday);
  const p_jjymd = new Date(today.getFullYear()-1, today.getMonth(), today.getDate()).toISOString().slice(0,10).replace(/-/g,'');
  try {
    const url = 'http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do';
    const response = await axios.get(url, {
      params: {
        id: '7435', passwd: 'dkwlxm12!@', dataid: 'data65',
        pagesize: 100, pageidx: 1, 'portal.templet': 'false',
        p_ymd, p_jymd, p_jjymd, p_buryu: '2', p_pos_gubun: '1', d_cd: '2'
      }
    });
    const items = response.data?.resultData || [];
    const fruitItems = items.filter(i => (i.PUM_NM_A||'').includes('수입'));
    res.json({ success: true, date: p_ymd, count: fruitItems.length, total: items.length, data: fruitItems, raw: items.slice(0,5) });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 6. 가락시장 기간별 가격 (특정 품목)
app.get('/api/garak/history', async (req, res) => {
  const { item = '바나나', grade = '상', days = '30' } = req.query;
  const numDays = parseInt(days);
  const results = [];
  for (let i = numDays; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const p_ymd = d.toISOString().slice(0,10).replace(/-/g,'');
    try {
      const response = await axios.get('http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do', {
        params: {
          id: '7435', passwd: 'dkwlxm12!@', dataid: 'data65',
          pagesize: 100, pageidx: 1, 'portal.templet': 'false',
          p_ymd, p_jymd: p_ymd, p_jjymd: p_ymd,
          p_buryu: '2', p_pos_gubun: '1', d_cd: '2'
        },
        timeout: 5000
      });
      const items = response.data?.resultData || [];
      const found = items.find(x => (x.PUM_NM_A||'').includes(item) && (x.PUM_NM_A||'').includes('수입') && x.G_NAME_A === grade && (x.U_NAME||'').includes('13'));
      if (found && found.AV_P_A > 0) {
        results.push({ date: p_ymd, price: found.AV_P_A, unit: found.U_NAME?.trim() });
      }
    } catch(e) { /* 날짜 스킵 */ }
  }
  res.json({ success: true, item, grade, count: results.length, data: results });
});

// 7. 관세청 국가별 수입 물량
app.get('/api/trade/country', async (req, res) => {
  const { start = '202501', end = '202503', hs = '0803', country = 'PH' } = req.query;
  try {
    const url = 'https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList';
    const response = await axios.get(url, {
      params: { serviceKey: API_KEY, strtYymm: start, endYymm: end, hsSgn: hs, cntyCd: country, pageNo: 1, numOfRows: 50 }
    });
    const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
    const items = parsed?.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    const result = arr.filter(i => i.year !== '총계').map(i => ({
      year: i.year, country: i.statCdCntnKor1, countryCode: i.statCd,
      item: i.statKor, impWgt: parseInt(i.impWgt || 0), impDlr: parseInt(i.impDlr || 0)
    }));
    res.json({ success: true, country, hs, count: result.length, data: result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 8. 원산지별 수입 물량 비교 (바나나 주요 국가 한번에)
app.get('/api/trade/origins', async (req, res) => {
  const { start = '202501', end = '202503', hs = '0803' } = req.query;
  const countries = [
    { code: 'PH', name: '필리핀', flag: '🇵🇭' },
    { code: 'VN', name: '베트남', flag: '🇻🇳' },
    { code: 'EC', name: '에콰도르', flag: '🇪🇨' },
    { code: 'CR', name: '코스타리카', flag: '🇨🇷' },
    { code: 'GT', name: '과테말라', flag: '🇬🇹' },
    { code: 'KH', name: '캄보디아', flag: '🇰🇭' },
    { code: 'TH', name: '태국', flag: '🇹🇭' },
    { code: 'US', name: '미국', flag: '🇺🇸' },
    { code: 'CL', name: '칠레', flag: '🇨🇱' },
    { code: 'AU', name: '호주', flag: '🇦🇺' },
    { code: 'NZ', name: '뉴질랜드', flag: '🇳🇿' },
    { code: 'GR', name: '그리스', flag: '🇬🇷' },
    { code: 'PE', name: '페루', flag: '🇵🇪' },
    { code: 'BR', name: '브라질', flag: '🇧🇷' },
    { code: 'TW', name: '대만', flag: '🇹🇼' },
    { code: 'ZA', name: '남아공', flag: '🇿🇦' },
    { code: 'ES', name: '스페인', flag: '🇪🇸' },
  ];
  const url = 'https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList';
  const results = [];
  for (const c of countries) {
    try {
      const response = await axios.get(url, {
        params: { serviceKey: API_KEY, strtYymm: start, endYymm: end, hsSgn: hs, cntyCd: c.code, pageNo: 1, numOfRows: 50 },
        timeout: 5000
      });
      const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
      const items = parsed?.response?.body?.items?.item || [];
      const arr = Array.isArray(items) ? items : [items];
      const monthly = arr.filter(i => i.year !== '총계');
      if (monthly.length > 0) {
        const totalWgt = monthly.reduce((s, i) => s + parseInt(i.impWgt || 0), 0);
        const totalDlr = monthly.reduce((s, i) => s + parseInt(i.impDlr || 0), 0);
        if (totalWgt >= 1000) results.push({ ...c, impWgt: totalWgt, impDlr: totalDlr, monthly }); // 1톤 이상만
      }
    } catch(e) { /* 국가 스킵 */ }
  }
  results.sort((a, b) => b.impWgt - a.impWgt);
  res.json({ success: true, hs, period: `${start}~${end}`, count: results.length, data: results });
});


// 9. 가락시장 이번주/저번주 평균
app.get('/api/garak/weekly', async (req, res) => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const thisMonStart = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1);
  const lastMonStart = thisMonStart - 7;

  const fetchDayData = async (offset) => {
    const d = new Date(today); d.setDate(d.getDate() + offset);
    if (d.getDay() === 0 || d.getDay() === 6) return [];
    const p_ymd = d.toISOString().slice(0,10).replace(/-/g,'');
    try {
      const response = await axios.get('http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do', {
        params: { id: '7435', passwd: 'dkwlxm12!@', dataid: 'data65', pagesize: 100, pageidx: 1, 'portal.templet': 'false', p_ymd, p_jymd: p_ymd, p_jjymd: p_ymd, p_buryu: '2', p_pos_gubun: '1', d_cd: '2' },
        timeout: 5000
      });
      return (response.data?.resultData || []).filter(i => (i.PUM_NM_A||'').includes('수입'));
    } catch(e) { return []; }
  };

  const calcWeekAvg = async (startOffset, endOffset) => {
    const allDays = [];
    for (let i = startOffset; i <= endOffset; i++) allDays.push(fetchDayData(i));
    const results = await Promise.all(allDays);
    const grouped = {};
    results.flat().forEach(d => {
      // 품목+등급만으로 묶으면 13키로/16키로 등 다른 단위 박스가 섞여서 평균이 왜곡됨 → 단위(U_NAME)까지 키에 포함
      const key = d.PUM_NM_A + '||' + d.G_NAME_A + '||' + (d.U_NAME||'').trim();
      if (!grouped[key]) grouped[key] = { prices: [] };
      if (d.AV_P_A > 0) grouped[key].prices.push(d.AV_P_A);
    });
    const avg = {};
    Object.entries(grouped).forEach(([key, v]) => {
      if (v.prices.length > 0) avg[key] = Math.round(v.prices.reduce((a,b)=>a+b,0)/v.prices.length);
    });
    return avg;
  };

  try {
    const [thisWeek, lastWeek] = await Promise.all([
      calcWeekAvg(thisMonStart, 0),
      calcWeekAvg(lastMonStart, lastMonStart + 6)
    ]);
    res.json({ success: true, thisWeek, lastWeek });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── 과일브로 라우트 ──
app.get('/fruitbro', (req, res) => {
  res.sendFile(__dirname + '/fruitbro-landing.html');
});

app.get('/broker/hwashin', (req, res) => {
  res.sendFile(__dirname + '/hwashin-profile.html');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Trago 서버 v5.0: http://localhost:${PORT}`);
});

// ── 구리시장 경락가 스크래핑 ──
app.get('/api/guri', async (req, res) => {
  const { date, midCd = '12' } = req.query;
  const kst = new Date(new Date().getTime() + 9*60*60*1000);
  const today = date || kst.toISOString().slice(0,10);
  try {
    const cheerio = require('cheerio');
    const url = `https://at.agromarket.kr/domeinfo/sanRealtime.do`;
    const response = await axios.get(url, {
      params: {
        pageNo: 1, saledateBefore: today, saledate: today,
        whsalCd: '311201', largeCd: '06', midCd, pageSize: 100,
        largeCdBefore: '06', midCdBefore: midCd,
        cmpCd: '', mmCd: '', smallCd: '', sanCd: '', smallCdSearch: '', dCostSort: ''
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://at.agromarket.kr'
      },
      timeout: 10000
    });
    const $ = cheerio.load(response.data);
    const rows = [];
    $('table tbody tr').each((i, el) => {
      const cells = $(el).find('td').map((j, td) => $(td).text().trim()).get();
      if (cells.length >= 12) {
        rows.push({
          date: cells[0], time: cells[1], market: cells[2],
          corp: cells[3], type: cells[4], category: cells[5],
          item: cells[6], variety: cells[7], origin: cells[8],
          unit: cells[9], qty: cells[10], price: cells[11]
        });
      }
    });
    // 평균가 계산
    const prices = rows.map(r => parseInt(r.price.replace(/,/g, ''))).filter(p => p > 0);
    const avg = prices.length ? Math.round(prices.reduce((a,b)=>a+b,0)/prices.length) : 0;
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    res.json({ success: true, date: today, count: rows.length, avg, min, max, data: rows });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── 구리시장 전품목 경락가 ──
app.get('/api/guri/all', async (req, res) => {
  const kst = new Date(new Date().getTime() + 9*60*60*1000);
  const today = req.query.date || kst.toISOString().slice(0,10);
  const items = [
    { midCd: '12', name: '바나나' },
    { midCd: '13', name: '파인애플' },
    { midCd: '11', name: '키위' },
    { midCd: '03', name: '포도' },
    { midCd: '17', name: '레몬' },
  ];
  const cheerio = require('cheerio');
  const results = [];
  for (const item of items) {
    try {
      const response = await axios.get('https://at.agromarket.kr/domeinfo/sanRealtime.do', {
        params: {
          pageNo: 1, saledateBefore: today, saledate: today,
          whsalCd: '311201', largeCd: '06', midCd: item.midCd, pageSize: 100,
          largeCdBefore: '06', midCdBefore: item.midCd,
          cmpCd: '', mmCd: '', smallCd: '', sanCd: '', smallCdSearch: '', dCostSort: ''
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://at.agromarket.kr'
        },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      const rows = [];
      $('table tbody tr').each((i, el) => {
        const cells = $(el).find('td').map((j, td) => $(td).text().trim()).get();
        if (cells.length >= 12) rows.push({ unit: cells[9], price: cells[11] });
      });
      const prices = rows.map(r => parseInt(r.price.replace(/,/g,''))).filter(p => p > 0);
      if (prices.length) {
        const avg = Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const unit = rows[0]?.unit || '';
        results.push({ name: item.name, avg, min, max, unit, count: rows.length });
      }
    } catch(e) { /* 품목 스킵 */ }
  }
  res.json({ success: true, date: today, data: results });
});

// ── 전국 공영도매시장 실시간 경매정보 (data.go.kr B552845/katRealTime2) ──
// 가락시장 외 전국 주요 도매시장 시세를 한번에 비교하기 위한 엔드포인트
const NATIONWIDE_FRUIT_CODES = {
  '바나나': '12', '망고': '36', '파인애플': '13', '오렌지': '18', '레몬': '17',
  '포도': '03', '체리': '57', '키위': '11', '블루베리': '59', '아보카도': '34'
};
const NATIONWIDE_MARKETS = {
  '110001': '서울가락', '110008': '서울강서', '230001': '인천남촌', '311201': '구리',
  '210001': '부산엄궁', '210009': '부산반여', '220001': '대구북부',
  '240001': '광주각화', '240004': '광주서부', '250001': '대전오정', '250003': '대전노은',
  '380201': '울산', '310101': '수원', '310401': '안양', '340101': '천안',
  '330101': '청주', '320301': '강릉', '370101': '포항', '371501': '구미',
  '370401': '안동', '380401': '진주', '380303': '창원내서', '380101': '창원팔용',
  '360301': '순천'
};
// ── 특정 시장 전품목 시세 (인천남촌 등 개별 시장 상세 조회용) ──
app.get('/api/market', async (req, res) => {
  const kst = new Date(new Date().getTime() + 9*60*60*1000);
  const today = req.query.date || kst.toISOString().slice(0,10);
  const marketCd = req.query.code || '230001'; // 기본값: 인천남촌
  const marketNm = NATIONWIDE_MARKETS[marketCd] || marketCd;
  try {
    const results = [];
    for (const [name, mclsfCd] of Object.entries(NATIONWIDE_FRUIT_CODES)) {
      try {
        const response = await axios.get('https://apis.data.go.kr/B552845/katRealTime2/trades2', {
          params: {
            serviceKey: API_KEY, numOfRows: 200, pageNo: 1, returnType: 'json',
            'cond[trd_clcln_ymd::EQ]': today,
            'cond[gds_lclsf_cd::EQ]': '06',
            'cond[gds_mclsf_cd::EQ]': mclsfCd,
            'cond[whsl_mrkt_cd::EQ]': marketCd
          }
        });
        const items = response.data?.response?.body?.items?.item || [];
        const arr = Array.isArray(items) ? items : [items];
        const prices = arr.map(d => parseFloat(d.scsbd_prc)).filter(p => p > 0);
        if (prices.length) {
          const avg = Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
          const min = Math.round(Math.min(...prices));
          const max = Math.round(Math.max(...prices));
          const unit = arr[0]?.unit_qty ? `${parseFloat(arr[0].unit_qty)}${arr[0].unit_nm||'kg'}` : '';
          results.push({ name, avg, min, max, unit, count: prices.length });
        }
      } catch (e) { /* 품목 스킵 */ }
    }
    res.json({ success: true, market: marketNm, marketCd, date: today, data: results });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/nationwide', async (req, res) => {
  const kst = new Date(new Date().getTime() + 9*60*60*1000);
  const today = req.query.date || kst.toISOString().slice(0,10);
  const item = req.query.item || '바나나';
  const mclsfCd = NATIONWIDE_FRUIT_CODES[item];
  if (!mclsfCd) {
    return res.json({ success: false, error: `지원하지 않는 품목입니다. 지원 품목: ${Object.keys(NATIONWIDE_FRUIT_CODES).join(', ')}` });
  }
  try {
    const response = await axios.get('https://apis.data.go.kr/B552845/katRealTime2/trades2', {
      params: {
        serviceKey: API_KEY, numOfRows: 1000, pageNo: 1, returnType: 'json',
        'cond[trd_clcln_ymd::EQ]': today,
        'cond[gds_lclsf_cd::EQ]': '06',
        'cond[gds_mclsf_cd::EQ]': mclsfCd
      }
    });
    const items = response.data?.response?.body?.items?.item || [];
    const arr = Array.isArray(items) ? items : [items];
    // 시장별로 그룹핑, kg당 단가로 정규화 (박스가격 ÷ 박스중량)
    const grouped = {};
    arr.forEach(d => {
      const marketNm = NATIONWIDE_MARKETS[d.whsl_mrkt_cd] || d.whsl_mrkt_nm;
      const price = parseFloat(d.scsbd_prc);
      const unitQty = parseFloat(d.unit_qty) || 1;
      if (!price || !unitQty) return;
      const pricePerKg = price / unitQty;
      if (!grouped[marketNm]) grouped[marketNm] = { market: marketNm, prices: [] };
      grouped[marketNm].prices.push(pricePerKg);
    });
    const result = Object.values(grouped).map(g => ({
      market: g.market,
      avgPricePerKg: Math.round(g.prices.reduce((a,b)=>a+b,0)/g.prices.length),
      minPricePerKg: Math.round(Math.min(...g.prices)),
      maxPricePerKg: Math.round(Math.max(...g.prices)),
      count: g.prices.length
    })).sort((a,b) => a.avgPricePerKg - b.avgPricePerKg);
    res.json({ success: true, item, date: today, totalCount: response.data?.response?.body?.totalCount || 0, data: result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});
