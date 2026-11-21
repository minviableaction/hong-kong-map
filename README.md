# 香港智慧城市地圖

一幅可拖拉、可放大的香港地圖。底圖用 [OpenFreeMap](https://openfreemap.org/) 的免費公開服務。地圖上有港鐵重鐵網絡和運輸署交通快拍點。

- 點選車站，查看該綫即將到站的班次。轉乘站可以切換綫路。
- 點選快拍點，查看該處目前的照片。
- 沒有班次或照片載入不到時，畫面上會用中文說明。

這是課堂用的預覽版。驗收通過之前，不會發佈到 Cloudflare Workers。

## 資料從哪裡來

| 內容 | 來源 |
| --- | --- |
| 底圖 | OpenFreeMap Liberty 樣式，資料屬 OpenStreetMap／OpenMapTiles |
| 車站名稱、代碼、行車順序 | 港鐵公開路線檔，另補上到站接口裡的馬場站 |
| 車站位置 | OpenStreetMap 香港範圍資料（Geofabrik 2026-11-21 摘要），再對回官方站名 |
| 到站班次 | [港鐵實時列車服務資訊](https://data.gov.hk/tc-data/dataset/mtr-data2-nexttrain-data) |
| 快拍點和照片 | [運輸署交通情況快拍圖像](https://data.gov.hk/tc-data/dataset/hk-td-tis_2-traffic-snapshot-images) |

範圍是 10 條重鐵綫：機場快綫、東涌綫、屯馬綫、將軍澳綫（含康城）、東鐵綫（含落馬洲和馬場）、南港島綫、荃灣綫、港島綫、觀塘綫、迪士尼綫。不包括輕鐵。

綫路沿 OpenStreetMap 的港鐵路軌繪製，同一段的並列路軌併成一條線。地圖上的列車圓點是用各站到站時間，沿這段路軌估算出來的位置，不是列車的衛星定位。美孚站在 OpenStreetMap 有兩個相近點，地圖用兩者的中點。

到站班次和快拍清單由網站自己定時抓一次，放進共用快取。每個開着的頁面只讀這份快取，大約每 45 秒看一次有沒有更新；分頁在背景時不會查。快拍照片也先經過網站，同一支鏡頭約 90 秒內不會重複向運輸署要。

## 在自己的電腦運行

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
```

開發伺服器預設用連接埠 4317。建置正式靜態檔：

```bash
npm run build
npm run preview
```

## 之後怎樣發佈

驗收通過後，才發佈到 Cloudflare Workers 免費方案，網址用平台提供的 `workers.dev`。Worker 會先查港鐵和運輸署，再把結果交給所有訪客，預計費用是 0 港元。付費方案最低每月 5 美元，這個做法用不到。

屆時在已登入的 Cloudflare 免費帳戶執行：

```bash
npm run build
npx wrangler deploy
```

`workers.dev` 是習作網址，並有瀏覽器完整性檢查。自訂網域才需要另外付網域註冊費。
