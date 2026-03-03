const axios = require("axios");
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

let accessToken = null;
let tokenExpireTime = 0;

// 종목별 데이터 저장
let history = {};
let lastAlertTime = {};


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
  tokenExpireTime = Date.now() + (1000 * 60 * 100); // 100분 유지

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
}


// =======================
// 4. 감시 시작
// =======================
async function start() {

  await getAccessToken();

  setInterval(async () => {
    try {

      for (const symbol of SYMBOLS) {

        if (!history[symbol]) {
          history[symbol] = [];
        }

        const { name, price, volume } = await getPriceAndVolume(symbol);
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

          console.log(
            `${name} (${symbol}) | 가격상승률: ${changeRate.toFixed(2)}% | 거래량증가율: ${volumeRate.toFixed(2)}%`
          );

          if (
              changeRate >= 1 &&   // 전일대비 1% 이상
              volumeRate >= 30     // 5분 거래량 30% 이상
            (!lastAlertTime[symbol] || now - lastAlertTime[symbol] > 300000)
          ) {

            await sendTelegram(
              `🚀${name} (${symbol}) 급등 감지!\n` +
              `현재가: ${price}\n` +
              `5분 상승률: ${priceRate.toFixed(2)}%\n` +
              `5분 거래량 증가율: ${volumeRate.toFixed(2)}%`
            );

            lastAlertTime[symbol] = now;
          }
        }
      }

    } catch (err) {
      console.log("에러:", err.message);
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














