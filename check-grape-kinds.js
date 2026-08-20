const axios = require('axios');

const KAMIS_KEY = '4c4c7781-ee4a-44fc-bc34-c015aba41070';
const KAMIS_ID = '7624';

async function checkKind(kindCode, label) {
  try {
    const end = new Date().toISOString().slice(0,10);
    const start = '2026-06-01'; // 포도 성수기 포함되게 넉넉히
    const r = await axios.get('https://www.kamis.or.kr/service/price/xml.do', {
      params: {
        action: 'periodProductList',
        p_startday: start,
        p_endday: end,
        p_itemcategorycode: '400',
        p_itemcode: '414',
        p_kindcode: kindCode,
        p_productclscode: '02',
        p_convert_kg_yn: 'Y',
        p_cert_key: KAMIS_KEY,
        p_cert_id: KAMIS_ID,
        p_returntype: 'json'
      }
    });
    const rows = r.data?.data?.item || [];
    const validRows = Array.isArray(rows) ? rows.filter(i => typeof i.itemname === 'string') : [];
    console.log(`[kind:${kindCode}] ${label} → 건수: ${validRows.length}`);
    if (validRows.length > 0) {
      const names = [...new Set(validRows.map(r => r.itemname))];
      console.log('  품목명 종류:', names);
      console.log('  샘플:', JSON.stringify(validRows[0]));
    }
  } catch (e) {
    console.log(`[kind:${kindCode}] ${label} → 에러:`, e.response?.status || e.message);
  }
}

(async () => {
  for (const k of ['00','01','02','03','04','05','06','07']) {
    await checkKind(k, '');
  }
})();
