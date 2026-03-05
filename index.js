const axios = require("axios");
const https = require("https");
const agent = new https.Agent({
  keepAlive: true
});
axios.defaults.timeout = 10000;
axios.defaults.httpsAgent = agent;
axios.defaults.headers.common["Connection"] = "keep-alive";
const express = require("express");
const app = express();
const APP_KEY = process.env.APP_KEY;
const APP_SECRET = process.env.APP_SECRET;
const TG_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const SYMBOLS = ["001740", "294870", "108320"];
const STOCK_NAMES = {
  "001740": "SK네트웍스",
  "294870": "HDC현대산업개발",
  "108320": "LX세미콘"
};
const BUY_PRICES = {
  "108320": 52475,   // LX세미콘
  "001740": 5554,    // SK네트웍스
  "294870": 23735    // HDC현대산업개발
};

let accessToken = null;
let tokenExpireTime = 0;

// 종목별 데이터 저장
let history = {};
let lastAlertTime = {};
let lastPriceAlertTime = {};
let resetDoneToday = false;

function isAfter8PM() {
  const now = new Date();
  return now.getHours() >= 20;
}

// =======================
// 1. 토큰 발급
// =======================
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpireTime) {
    return accessToken;
  }

  const res = await axios.post(
    "https://openapi.koreainvestment.com:9443/oauth2/tokenP",
    {
      grant_type: "client_credentials",
      appkey: APP_KEY,
      appsecret: APP_SECRET
    }
  );

  accessToken = res.data.access_token;
  tokenExpireTime = Date.now() + (1000 * 60 * 60 * 15); // 15시간 유지

  console.log("새 토큰 발급 완료");
  return accessToken;
}

// =======================
// 2. 텔레그램 전송
// =======================
async function sendTelegram(msg) {
  await axios.post(
    `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text: msg
    }
  );
}

// =======================
// 3. 현재가 조회
// =======================
async function getPriceAndVolume(symbol) {
  const token = await getAccessToken();

  for (let i = 0; i < 2; i++) {   // 🔥 2번까지 재시도
    try {
      const res = await axios.get(
        "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price",
        {
          headers: {
            authorization: `Bearer ${token}`,
            appkey: APP_KEY,
            appsecret: APP_SECRET,
            tr_id: "FHKST01010100"
          },
          params: {
            fid_cond_mrkt_div_code: "J",
            fid_input_iscd: symbol
          }
        }
      );

      const price = parseInt(res.data.output.stck_prpr);
      const volume = parseInt(res.data.output.acml_vol);
      const changeRate = parseFloat(res.data.output.prdy_ctrt);
      const name = STOCK_NAMES[symbol] || symbol;

      return { name, price, volume, changeRate };

    } catch (err) {
      
console.log("API 실패 상세:", err.code, err.message, err.response?.data);
      
      if (i === 1) throw err;
    }
  }
}

// =======================
// 4. 감시 시작
// =======================
async function start() {

  await getAccessToken();

  setInterval(async () => {
const nowTime = new Date();
const hour = nowTime.getHours();
const minute = nowTime.getMinutes();
const currentMinutes = hour * 60 + minute;

// 08:00 ~ 20:00만 실행
//if (currentMinutes < 480 || currentMinutes > 1200) {
//  return;
//}
    
    try {

    // 🔥 20시 이후 알림 쿨타임 리셋
    if (isAfter8PM()) {
      lastAlertTime = {};
      lastPriceAlertTime = {};
    }
      
      for (const symbol of SYMBOLS) {

        if (!history[symbol]) {
          history[symbol] = [];
        }

        const { name, price, volume, changeRate } = await getPriceAndVolume(symbol);
        const buyPrice = BUY_PRICES[symbol];
        const isProfit = price > buyPrice;   
        const priceRate = changeRate;  // 그냥 이름 통일용
        const now = Date.now();

        history[symbol].push({ time: now, price, volume });

        // 5분 데이터만 유지
        history[symbol] = history[symbol].filter(
          h => now - h.time <= 5 * 60 * 1000
        );

        if (history[symbol].length > 1) {

          const old = history[symbol][0];

          if (old.volume === 0) continue;

          const volumeIncrease = volume - old.volume;
          const volumeRate = (volumeIncrease / old.volume) * 100;
          const profit = price - buyPrice;
          const profitRate = ((price - buyPrice) / buyPrice) * 100;

          console.log(
            `${name} (${symbol}) | 가격상승률: ${changeRate.toFixed(2)}% | 거래량증가율: ${volumeRate.toFixed(2)}% | 순이익률: ${profitRate.toFixed(2)}%`
              );
              
          const direction = changeRate > 0 ? "상승" : "하락";
          const emoji = changeRate > 0 ? "🚀" : "📉";

          // 🔥 가격 전용 알림 (±3%)
         if (
          !isAfter8PM() &&  // 🔥 장중만
          Math.abs(changeRate) >= 3 &&
          (!lastPriceAlertTime[symbol] || now - lastPriceAlertTime[symbol] > 300000)
        ) {
            const direction = changeRate > 0 ? "상승" : "하락";
            const emoji = changeRate > 0 ? "🚀" : "📉";

            await sendTelegram(
              `${emoji} ${name} (${symbol}) ${direction} 3% 돌파!\n` +
              `현재가: ${price}\n` +
              `전일대비: ${changeRate.toFixed(2)}%`
  );

  lastPriceAlertTime[symbol] = now;
}
                 
  // 가격 전용 텔레그램
     
           if (
              !isAfter8PM() &&  // 🔥 장중만
              Math.abs(changeRate) >= 1 &&
              volumeRate >= 30 &&
              (!lastAlertTime[symbol] || now - lastAlertTime[symbol] > 300000)
          ){

           await sendTelegram(
            `🚀${name} (${symbol}) 급등 감지!\n` +
            `현재가: ${price}\n` +
            `매입가: ${buyPrice}\n` +
            `전일대비: ${priceRate.toFixed(2)}%\n` +
            `5분 거래량 증가율: ${volumeRate.toFixed(2)}%`
           );

            lastAlertTime[symbol] = now;
          }
        }
      }

    } catch (err) {
      console.log("에러:", err.code , err.message);
    }

  }, 20000); // 20초 주기
}

start();

// =======================
// 5. Render용 웹서버
// =======================
app.get("/", (req, res) => {
  res.send("korea-alert running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server started");
});

// 🔥 Self Ping (Sleep 방지)
setInterval(() => {
  axios.get("https://korea-alert.onrender.com")
    .then(() => console.log("self ping"))
    .catch(err => console.log("ping fail", err.message));
}, 4 * 60 * 1000);

// =======================
// 🔥 20:10 데이터 리셋
// =======================

function resetData() {
  console.log("📌 20:10 장 종료 → 데이터 리셋");
  history = {};
  lastAlertTime = {};
  lastPriceAlertTime = {};
}

setInterval(() => {

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const day = now.getDay();

  if (
    day >= 1 &&
    day <= 5 &&
    hour === 20 &&
    minute >= 10 &&
    !resetDoneToday
  ) {
    resetData();
    resetDoneToday = true;
    console.log("📌 장 종료 데이터 리셋");
  }

  if (hour === 0 && minute < 5) {
    resetDoneToday = false;
  }

}, 60000);

