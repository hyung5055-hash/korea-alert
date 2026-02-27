const axios = require("axios");

const APP_KEY = process.env.APP_KEY;
const APP_SECRET = process.env.APP_SECRET;
const TG_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let accessToken = "";
let history = [];
let lastAlertTime = 0;

async function getToken() {
  const res = await axios.post(
    "https://openapi.koreainvestment.com:9443/oauth2/tokenP",
    {
      grant_type: "client_credentials",
      appkey: APP_KEY,
      appsecret: APP_SECRET
    }
  );
  accessToken = res.data.access_token;
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
  const res = await axios.get(
    "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price",
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
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
  await getToken();

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
          priceRate >= 2 &&
          volumeRate >= 30 &&
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
  }, 5000);
}

start();