const axios = require("axios");

const APP_KEY = process.env.APP_KEY;
const APP_SECRET = process.env.APP_SECRET;
const TG_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let accessToken = null;
let tokenExpireTime = 0;
let history = [];
let lastAlertTime = 0;
 async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpireTime) {
    return accessToken;
  }

  const res = await axios.post("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
    grant_type: "client_credentials",
    appkey: process.env.APP_KEY,
    appsecret: process.env.APP_SECRET
  });

  accessToken = res.data.access_token;
  tokenExpireTime = Date.now() + (1000 * 60 * 100); // 100분 유지
  return accessToken;
}

async function sendTelegram(msg) {
  await axios.post(
    `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text: msg
    }
  );
}

async function getPriceAndVolume() {  
 const token = await getAccessToken();  // 🔥 이 줄 추가
 const res = await axios.get(
    "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price",
    {
      headers: {
        authorization: `Bearer ${Token}`,
        appkey: APP_KEY,
        appsecret: APP_SECRET,
        tr_id: "FHKST01010100"
      },
      params: {
        fid_cond_mrkt_div_code: "J",
        fid_input_iscd: "090460"
      }
    }
  );

  const price = parseInt(res.data.output.stck_prpr);
  const volume = parseInt(res.data.output.acml_vol);

  return { price, volume };
}

async function start() {
await getAccessToken();  // ✅ 이걸로 바꿔

 setInterval(async () => {
    try {
      const { price, volume } = await getPriceAndVolume();
      const now = Date.now();

      history.push({ time: now, price, volume });
      history = history.filter(h => now - h.time <= 5 * 60 * 1000);

      if (history.length > 1) {
        const old = history[0];

        const priceRate = ((price - old.price) / old.price) * 100;
        const volumeIncrease = volume - old.volume;
        const volumeRate = (volumeIncrease / old.volume) * 100;

        console.log(
          `가격상승률: ${priceRate.toFixed(2)}%`,
          `거래량증가율: ${volumeRate.toFixed(2)}%`
        );

        if (
          priceRate >= 0.01 &&
          volumeRate >= 0.01 &&
          now - lastAlertTime > 300000
        ) {
          await sendTelegram(
            `🚀 급등 + 거래량 폭증!\n` +
            `현재가: ${price}\n` +
            `5분 상승률: ${priceRate.toFixed(2)}%\n` +
            `5분 거래량 증가율: ${volumeRate.toFixed(2)}%`
          );

          lastAlertTime = now;
        }
      }

    } catch (err) {
      console.log("에러:", err.message);
    }
  }, 15000);
}

start();

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("korea-alert running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server started");
});














