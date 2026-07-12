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
// l: 대분류(06 과실류, 08 과채류), m: 중분류
const FRUIT_CODES = {
  // 수입과일
  '바나나': { l:'06', m:'12' }, '망고': { l:'06', m:'36' }, '파인애플': { l:'06', m:'13' },
  '오렌지': { l:'06', m:'18' }, '레몬': { l:'06', m:'17' }, '포도': { l:'06', m:'03' },
  '체리': { l:'06', m:'57' }, '키위': { l:'06', m:'11' }, '블루베리': { l:'06', m:'59' },
  '아보카도': { l:'06', m:'34' }, '멜론': { l:'08', m:'05' },
  // 국산과일
  '사과': { l:'06', m:'01' }, '배': { l:'06', m:'02' }, '복숭아': { l:'06', m:'04' },
  '자두': { l:'06', m:'08' }, '감귤': { l:'06', m:'14' },
  '수박': { l:'08', m:'01' }, '참외': { l:'08', m:'02' }
};
// 대시보드(trago_live.html) 개별시장 조회용 수입과일 목록
const IMPORT_FRUITS = ['바나나','망고','파인애플','오렌지','레몬','포도','체리','키위','블루베리','아보카도','멜론'];
// 하위호환용 별칭
const NATIONWIDE_FRUIT_CODES = Object.fromEntries(IMPORT_FRUITS.map(n => [n, FRUIT_CODES[n].m]));
const NATIONWIDE_MARKETS = {
  '110001': '서울가락', '110008': '서울강서', '230001': '인천남촌', '311201': '구리',
  '210001': '부산엄궁', '210009': '부산반여', '220001': '대구북부',
  '240001': '광주각화', '240004': '광주서부', '250001': '대전오정', '250003': '대전노은',
  '380201': '울산', '310101': '수원', '310401': '안양', '340101': '천안',
  '330101': '청주', '320301': '강릉', '370101': '포항', '371501': '구미',
  '370401': '안동', '380401': '진주', '380303': '창원내서', '380101': '창원팔용',
  '360301': '순천'
};
// 원산지(plor_nm)로 국내산 여부 판별 - Trago는 수입과일 전문이라 국산은 기본 제외
const KOREAN_REGIONS = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
function isDomesticOrigin(plorNm) {
  const s = (plorNm || '').trim();
  if (!s) return false;
  if (KOREAN_REGIONS.some(r => s.startsWith(r))) return true;
  if (/[시군구읍면동리]/.test(s)) return true;
  return false;
}
// 바나나/망고/파인애플/아보카도/레몬/오렌지는 한국 기후상 상업재배 자체가 불가능 → 100% 수입.
// 이 품목들의 plor_nm에 한국 지명이 찍히는 건 "후숙장/처리장 위치"일 뿐 국산이라는 뜻이 아니므로 원산지 필터를 적용하지 않음.
const IMPORT_ONLY = ['바나나', '망고', '파인애플', '아보카도', '레몬', '오렌지'];
// origin: 'import'(수입만, 기본) | 'domestic'(국산만) | 'all'(전체)
function applyOriginFilter(arr, item, origin) {
  if (origin === 'all') return arr;
  if (origin === 'domestic') return arr.filter(d => isDomesticOrigin(d.plor_nm));
  // import (기본): 수입전용 품목은 필터 없음, 국산·수입 혼재 품목은 국산 제외
  if (IMPORT_ONLY.includes(item)) return arr;
  return arr.filter(d => !isDomesticOrigin(d.plor_nm));
}

// ── 특정 시장 전품목 시세 (인천남촌 등 개별 시장 상세 조회용) ──
app.get('/api/market', async (req, res) => {
  const kst = new Date(new Date().getTime() + 9*60*60*1000);
  const today = req.query.date || kst.toISOString().slice(0,10);
  const marketCd = req.query.code || '230001'; // 기본값: 인천남촌
  const marketNm = NATIONWIDE_MARKETS[marketCd] || marketCd;
  try {
    const results = [];
    for (const name of IMPORT_FRUITS) {
      const fc = FRUIT_CODES[name];
      try {
        const response = await axios.get('https://apis.data.go.kr/B552845/katRealTime2/trades2', {
          params: {
            serviceKey: API_KEY, numOfRows: 200, pageNo: 1, returnType: 'json',
            'cond[trd_clcln_ymd::EQ]': today,
            'cond[gds_lclsf_cd::EQ]': fc.l,
            'cond[gds_mclsf_cd::EQ]': fc.m,
            'cond[whsl_mrkt_cd::EQ]': marketCd
          }
        });
        const items = response.data?.response?.body?.items?.item || [];
        let arr = Array.isArray(items) ? items : [items];
        arr = applyOriginFilter(arr, name, req.query.origin || 'import');
        const rows = arr.map(d => ({ price: parseFloat(d.scsbd_prc), qty: parseFloat(d.qty) || 1 })).filter(r => r.price > 0);
        if (rows.length) {
          const totalQty = rows.reduce((a,r)=>a+r.qty, 0);
          const avg = Math.round(rows.reduce((a,r)=>a+r.price*r.qty, 0)/totalQty);
          const min = Math.round(Math.min(...rows.map(r=>r.price)));
          const max = Math.round(Math.max(...rows.map(r=>r.price)));
          const unit = arr[0]?.unit_qty ? `${parseFloat(arr[0].unit_qty)}${arr[0].unit_nm||'kg'}` : '';
          results.push({ name, avg, min, max, unit, count: rows.length });
        }
      } catch (e) { /* 품목 스킵 */ }
    }
    res.json({ success: true, market: marketNm, marketCd, date: today, data: results });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ── 법인별 실거래 요약 (모바일 앱용: 품목→법인/규격별 평균·최대·최소) ──
app.get('/api/trades', async (req, res) => {
  const kst = new Date(new Date().getTime() + 9*60*60*1000);
  const date = req.query.date || kst.toISOString().slice(0,10);
  const item = req.query.item || '바나나';
  const marketCd = req.query.market || '';
  const fc = FRUIT_CODES[item];
  if (!fc) {
    return res.json({ success: false, error: `지원하지 않는 품목입니다. 지원 품목: ${Object.keys(FRUIT_CODES).join(', ')}` });
  }
  try {
    const params = {
      serviceKey: API_KEY, numOfRows: 1000, pageNo: 1, returnType: 'json',
      'cond[trd_clcln_ymd::EQ]': date,
      'cond[gds_lclsf_cd::EQ]': fc.l,
      'cond[gds_mclsf_cd::EQ]': fc.m
    };
    if (marketCd) params['cond[whsl_mrkt_cd::EQ]'] = marketCd;
    const response = await axios.get('https://apis.data.go.kr/B552845/katRealTime2/trades2', { params });
    const items = response.data?.response?.body?.items?.item || [];
    let arr = Array.isArray(items) ? items : [items];
    arr = applyOriginFilter(arr, item, req.query.origin || 'import');
    const grouped = {};
    arr.forEach(d => {
      const price = parseFloat(d.scsbd_prc);
      const qty = parseFloat(d.qty) || 1;
      if (!price) return;
      const spec = `${parseFloat(d.unit_qty) || ''}${d.unit_nm || ''} ${d.pkg_nm || ''}`.trim();
      const key = d.corp_nm + '||' + spec + '||' + (d.corp_gds_vrty_nm || '');
      if (!grouped[key]) grouped[key] = {
        corp: d.corp_nm,
        market: NATIONWIDE_MARKETS[d.whsl_mrkt_cd] || d.whsl_mrkt_nm,
        vrty: d.corp_gds_vrty_nm || item, spec, count: 0, rows: []
      };
      grouped[key].count += qty;
      grouped[key].rows.push({ price, qty });
    });
    const data = Object.values(grouped).map(g => {
      const totalQty = g.rows.reduce((a,r)=>a+r.qty, 0);
      return {
        corp: g.corp, market: g.market, vrty: g.vrty, spec: g.spec,
        count: Math.round(g.count),
        avg: Math.round(g.rows.reduce((a,r)=>a+r.price*r.qty, 0)/totalQty),
        max: Math.round(Math.max(...g.rows.map(r=>r.price))),
        min: Math.round(Math.min(...g.rows.map(r=>r.price)))
      };
    }).sort((a,b) => b.count - a.count);
    res.json({ success: true, item, date, totalCount: response.data?.response?.body?.totalCount || 0, data });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ── 시장별 가격 추이 (가락 외 타 시장도 트렌드 조회, 물량가중 일별평균) ──
app.get('/api/trend', async (req, res) => {
  const item = req.query.item || '바나나';
  const marketCd = req.query.market || '110001';
  const days = parseInt(req.query.days) || 14;
  const origin = req.query.origin || 'import';
  const fc = FRUIT_CODES[item];
  if (!fc) return res.json({ success: false, error: '지원하지 않는 품목입니다.' });
  const dates = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.now() + 9*60*60*1000); d.setUTCDate(d.getUTCDate() - i);
    if (d.getUTCDay() === 0) continue; // 일요일 휴장
    dates.push(d.toISOString().slice(0,10));
  }
  const results = [];
  const CHUNK = 5;
  for (let i = 0; i < dates.length; i += CHUNK) {
    const batch = dates.slice(i, i + CHUNK);
    const chunkResults = await Promise.all(batch.map(async dateStr => {
      try {
        let arr = await fetchTradesDay(dateStr, fc.l, fc.m, marketCd, 1);
        arr = applyOriginFilter(arr, item, origin);
        const rows = arr.map(x => {
          const price = parseFloat(x.scsbd_prc), unitQty = parseFloat(x.unit_qty) || 1;
          const qty = parseFloat(x.qty) || 1;
          return { pricePerKg: price/unitQty, weight: unitQty*qty };
        }).filter(r => r.pricePerKg > 0);
        if (rows.length >= 3) {
          const totalWeight = rows.reduce((a,r)=>a+r.weight, 0);
          const avg = Math.round(rows.reduce((a,r)=>a+r.pricePerKg*r.weight, 0)/totalWeight);
          return { date: dateStr, price: avg };
        }
        return null;
      } catch(e) { return null; }
    }));
    chunkResults.forEach(r => { if (r) results.push(r); });
  }
  results.sort((a,b) => a.date.localeCompare(b.date));
  res.json({ success: true, item, marketCd, count: results.length, data: results });
});

// ── 공용: 하루치 거래 데이터 fetch + 서버 캐싱 (과거 날짜는 불변이므로 영구 캐시 → API 호출 절약) ──
const tradesDayCache = new Map();
async function fetchTradesDay(date, l, m, marketCd = '', maxPages = 2) {
  const key = `${date}|${l}|${m}|${marketCd}`;
  if (tradesDayCache.has(key)) return tradesDayCache.get(key);
  let all = [];
  for (let p = 1; p <= maxPages; p++) {
    const params = {
      serviceKey: API_KEY, numOfRows: 1000, pageNo: p, returnType: 'json',
      'cond[trd_clcln_ymd::EQ]': date, 'cond[gds_lclsf_cd::EQ]': l, 'cond[gds_mclsf_cd::EQ]': m
    };
    if (marketCd) params['cond[whsl_mrkt_cd::EQ]'] = marketCd;
    const r = await axios.get('https://apis.data.go.kr/B552845/katRealTime2/trades2', { params });
    const items = r.data?.response?.body?.items?.item || [];
    const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
    all = all.concat(arr);
    const total = parseInt(r.data?.response?.body?.totalCount || 0);
    if (all.length >= total || arr.length < 1000) break;
  }
  const kstToday = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
  if (date < kstToday) tradesDayCache.set(key, all); // 오늘 데이터는 갱신되므로 캐시 안 함
  return all;
}

// 일별 시리즈(물량·가중평균가) 계산 - stats와 forecast에서 공용
async function computeDailySeries(fc, item, origin, days) {
  const dates = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.now() + 9*3600*1000); d.setUTCDate(d.getUTCDate() - i);
    if (d.getUTCDay() === 0) continue; // 일요일 휴장
    dates.push(d.toISOString().slice(0,10));
  }
  const series = [];
  const CHUNK = 5;
  for (let i = 0; i < dates.length; i += CHUNK) {
    const batch = dates.slice(i, i + CHUNK);
    const results = await Promise.all(batch.map(async date => {
      try {
        let arr = await fetchTradesDay(date, fc.l, fc.m);
        arr = applyOriginFilter(arr, item, origin);
        let totW = 0, totVal = 0, trades = 0;
        arr.forEach(d => {
          const price = parseFloat(d.scsbd_prc), uq = parseFloat(d.unit_qty) || 1, q = parseFloat(d.qty) || 1;
          if (!price || !uq) return;
          const w = uq * q;
          totW += w; totVal += (price / uq) * w; trades++;
        });
        if (totW <= 0) return null;
        return { date, volumeTons: Math.round(totW/100)/10, avgPricePerKg: Math.round(totVal/totW), trades };
      } catch (e) { return null; }
    }));
    results.forEach(r => { if (r) series.push(r); });
  }
  series.sort((a,b) => a.date.localeCompare(b.date));
  return series;
}

// ── 기간별 통계: 일별 물량(톤) + 물량가중평균가 + 주간 비교 ──
app.get('/api/stats', async (req, res) => {
  const item = req.query.item || '바나나';
  const origin = req.query.origin || 'import';
  const days = Math.min(parseInt(req.query.days) || 21, 31);
  const fc = FRUIT_CODES[item];
  if (!fc) return res.json({ success: false, error: '지원하지 않는 품목입니다.' });
  try {
    const series = await computeDailySeries(fc, item, origin, days);
    // 주간 비교: 최근 7일 / 그 전 7일 / 그 전전 7일 (물량가중)
    const weekStat = (n) => {
      const end = new Date(Date.now() + 9*3600*1000); end.setUTCDate(end.getUTCDate() - n*7);
      const start = new Date(end); start.setUTCDate(start.getUTCDate() - 6);
      const s = start.toISOString().slice(0,10), e = end.toISOString().slice(0,10);
      const rows = series.filter(r => r.date >= s && r.date <= e);
      if (!rows.length) return null;
      const w = rows.reduce((a,r) => a + r.volumeTons, 0);
      const p = rows.reduce((a,r) => a + r.avgPricePerKg * r.volumeTons, 0) / (w || 1);
      return { avgPricePerKg: Math.round(p), volumeTons: Math.round(w*10)/10, days: rows.length };
    };
    res.json({ success: true, item, origin,
      series,
      compare: { thisWeek: weekStat(0), lastWeek: weekStat(1), twoWeeksAgo: weekStat(2) }
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ── 가격 예측 (베타): 최근 4주 시리즈 기반 추세외삽 + 평균회귀 혼합 ──
// 방법론(정직하게): 단기(~1주)는 최근 선형추세, 장기로 갈수록 기간평균으로 회귀하는 혼합모델.
// 변동성(일별 수익률 표준편차)으로 80% 예상범위를 계산하되, 장기는 범위가 무의미하게 커지므로 ±50%에서 캡.
// 한계: 데이터가 최근 몇 주뿐이라 계절성·작황·환율·명절 수요를 반영하지 못함. 3달 이상은 방향성 참고용.
app.get('/api/forecast', async (req, res) => {
  const item = req.query.item || '바나나';
  const origin = req.query.origin || 'import';
  const fc = FRUIT_CODES[item];
  if (!fc) return res.json({ success: false, error: '지원하지 않는 품목입니다.' });
  try {
    const series = await computeDailySeries(fc, item, origin, 28);
    if (series.length < 8) {
      return res.json({ success: false, error: '예측에 필요한 최소 데이터(8일)가 부족합니다.' });
    }
    const prices = series.map(r => r.avgPricePerKg);
    const n = prices.length;
    const last = prices[n-1];
    const mean = prices.reduce((a,b)=>a+b,0) / n;
    // 최근 데이터에 가중치를 둔 선형회귀 (기울기 = 하루당 가격변화)
    let sw=0, swx=0, swy=0, swxy=0, swxx=0;
    prices.forEach((y, x) => {
      const w = Math.exp((x - n) / 7); // 최근일수록 가중
      sw += w; swx += w*x; swy += w*y; swxy += w*x*y; swxx += w*x*x;
    });
    const slope = (sw*swxy - swx*swy) / (sw*swxx - swx*swx || 1);
    // 일별 로그수익률 변동성
    const rets = [];
    for (let i = 1; i < n; i++) if (prices[i-1] > 0) rets.push(Math.log(prices[i]/prices[i-1]));
    const retMean = rets.reduce((a,b)=>a+b,0) / (rets.length || 1);
    const sigma = Math.sqrt(rets.reduce((a,b)=>a+(b-retMean)**2, 0) / (rets.length || 1));
    // 예측 지평 (영업일 기준, 일요일 휴장 반영 주 6일)
    const HORIZONS = [
      { label: '내일', h: 1 }, { label: '1주 후', h: 6 }, { label: '2주 후', h: 12 },
      { label: '3주 후', h: 18 }, { label: '1달 후', h: 26 }, { label: '3달 후', h: 78 },
      { label: '6개월 후', h: 156 }, { label: '1년 후', h: 312 }
    ];
    const confidenceOf = h => h <= 1 ? '높음' : h <= 6 ? '보통' : h <= 26 ? '낮음' : '매우 낮음';
    const Z = 1.28; // 80% 구간
    const forecasts = HORIZONS.map(({label, h}) => {
      const alpha = Math.exp(-h / 40); // 단기는 추세, 장기는 평균회귀
      const trendPart = last + slope * h;
      let price = alpha * trendPart + (1 - alpha) * mean;
      price = Math.max(Math.round(price), 1);
      let bandRatio = Math.min(Z * sigma * Math.sqrt(h), 0.5); // 장기 밴드는 ±50% 캡
      const low = Math.max(Math.round(price * (1 - bandRatio)), 1);
      const high = Math.round(price * (1 + bandRatio));
      return { label, marketDays: h, price, low, high, confidence: confidenceOf(h) };
    });
    res.json({
      success: true, item, origin,
      lastDate: series[n-1].date, lastPrice: last,
      dataDays: n, dailyVolatilityPct: Math.round(sigma * 1000) / 10,
      forecasts,
      caveat: '최근 4주 경락 데이터 기반 통계 추정입니다. 계절성·작황·환율·명절 수요는 반영되지 않으며, 특히 3달 이상 장기 예측은 방향성 참고용입니다.'
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ── Trago 모바일 앱 ──
app.get('/app', (req, res) => {
  res.sendFile(__dirname + '/trago-app.html');
});

app.get('/api/nationwide', async (req, res) => {
  const kst = new Date(new Date().getTime() + 9*60*60*1000);
  const today = req.query.date || kst.toISOString().slice(0,10);
  const item = req.query.item || '바나나';
  const fc = FRUIT_CODES[item];
  if (!fc) {
    return res.json({ success: false, error: `지원하지 않는 품목입니다. 지원 품목: ${Object.keys(FRUIT_CODES).join(', ')}` });
  }
  try {
    const response = await axios.get('https://apis.data.go.kr/B552845/katRealTime2/trades2', {
      params: {
        serviceKey: API_KEY, numOfRows: 1000, pageNo: 1, returnType: 'json',
        'cond[trd_clcln_ymd::EQ]': today,
        'cond[gds_lclsf_cd::EQ]': fc.l,
        'cond[gds_mclsf_cd::EQ]': fc.m
      }
    });
    const items = response.data?.response?.body?.items?.item || [];
    let arr = Array.isArray(items) ? items : [items];
    arr = applyOriginFilter(arr, item, req.query.origin || 'import');
    const vrtyOptions = [...new Set(arr.map(d => d.corp_gds_vrty_nm).filter(Boolean))];
    const vrtyFilter = req.query.vrty || '';
    const filtered = vrtyFilter ? arr.filter(d => d.corp_gds_vrty_nm === vrtyFilter) : arr;
    // 시장별로 그룹핑, kg당 단가로 정규화 (박스가격 ÷ 박스중량), 총 거래중량(qty×박스중량)으로 가중평균
    const grouped = {};
    filtered.forEach(d => {
      const marketNm = NATIONWIDE_MARKETS[d.whsl_mrkt_cd] || d.whsl_mrkt_nm;
      const price = parseFloat(d.scsbd_prc);
      const unitQty = parseFloat(d.unit_qty) || 1;
      const qty = parseFloat(d.qty) || 1;
      if (!price || !unitQty) return;
      const pricePerKg = price / unitQty;
      const weight = unitQty * qty; // 총 거래중량(kg)
      if (!grouped[marketNm]) grouped[marketNm] = { market: marketNm, rows: [] };
      grouped[marketNm].rows.push({ pricePerKg, weight });
    });
    const MIN_TRADES = 5; // 거래건수가 너무 적으면(1~2건) 평균이 왜곡되므로 제외
    const result = Object.values(grouped).filter(g => g.rows.length >= MIN_TRADES).map(g => {
      const totalWeight = g.rows.reduce((a,r)=>a+r.weight, 0);
      return {
        market: g.market,
        avgPricePerKg: Math.round(g.rows.reduce((a,r)=>a+r.pricePerKg*r.weight, 0)/totalWeight),
        minPricePerKg: Math.round(Math.min(...g.rows.map(r=>r.pricePerKg))),
        maxPricePerKg: Math.round(Math.max(...g.rows.map(r=>r.pricePerKg))),
        count: g.rows.length
      };
    }).sort((a,b) => a.avgPricePerKg - b.avgPricePerKg);
    res.json({ success: true, item, date: today, vrtyOptions, vrtyFilter, totalCount: response.data?.response?.body?.totalCount || 0, data: result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});
