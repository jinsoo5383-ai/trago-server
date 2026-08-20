const axios = require('axios');

const KAMIS_KEY = '4c4c7781-ee4a-44fc-bc34-c015aba41070';
const KAMIS_ID = '7624';

async function checkKind(kindCode) {
  try {
    const r = await axios.get('https://www.kamis.or.kr/service/price/xml.do', {
      params: {
        action: 'periodProductList',
        p_startday: '2026-06-01',
        p_endday: new Date().toISOString().slice(0,10),
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
    if (validRows.length > 0) {
      const kinds = [...new Set(validRows.map(r => r.kindname))];
      console.log(`[kind:${kindCode}] 건수: ${validRows.length} → 품종:`, kinds);
    } else {
      console.log(`[kind:${kindCode}] 건수: 0`);
    }
  } catch (e) {
    console.log(`[kind:${kindCode}] 에러:`, e.response?.status || e.message);
  }
}

(async () => {
  for (let i = 8; i <= 20; i++) {
    const k = String(i).padStart(2,'0');
    await checkKind(k);
  }
})();
