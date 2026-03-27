import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import googleTrends from "google-trends-api";
import { google } from "googleapis";

// Helper to safely parse JSON from Google Trends API
const safeJsonParse = (data: any) => {
  if (typeof data !== 'string') return null;
  const trimmed = data.trim();
  // Check for common HTML indicators, including the weird "L><HEAD>" case
  if (trimmed.startsWith('<') || trimmed.includes('<HTML') || trimmed.includes('<HEAD') || trimmed.includes('L><HEAD')) {
    console.warn("Google Trends returned HTML (likely rate limited)");
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // If it's not JSON, it's likely an error page we missed
    if (trimmed.includes('<') || trimmed.includes('HEAD')) {
      console.warn("Google Trends returned non-JSON response (likely rate limited)");
    } else {
      console.error("JSON Parse Error:", e);
    }
    return null;
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Endpoints
  app.get("/api/trends", async (req, res) => {
    const { keyword } = req.query;
    if (!keyword) return res.status(400).json({ error: "Keyword is required" });

    try {
      // Fetch last 14 days to compare (Recent 7 vs Previous 7)
      const results = await googleTrends.interestOverTime({
        keyword: keyword as string,
        startTime: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      });

      if (typeof results === 'string' && results.trim().startsWith('<')) {
        console.warn(`Google Trends blocked for keyword: ${keyword}`);
        return res.json({ recentAverage: 0, growthRate: 0, raw: null });
      }

      const data = safeJsonParse(results);
      if (!data) {
        return res.json({ recentAverage: 0, growthRate: 0, raw: null });
      }
      const timelineData = data.default.timelineData;
      
      if (timelineData && timelineData.length > 0) {
        // Split data into two halves to compare
        const mid = Math.floor(timelineData.length / 2);
        const previousPart = timelineData.slice(0, mid);
        const recentPart = timelineData.slice(mid);
        
        const previousAvg = previousPart.length > 0 
          ? previousPart.reduce((acc: number, curr: any) => acc + (curr.value[0] || 0), 0) / previousPart.length 
          : 0;
        const recentAvg = recentPart.length > 0 
          ? recentPart.reduce((acc: number, curr: any) => acc + (curr.value[0] || 0), 0) / recentPart.length 
          : 0;
        
        const growthRate = previousAvg === 0 ? recentAvg * 100 : ((recentAvg - previousAvg) / previousAvg) * 100;
        
        res.json({
          recentAverage: Math.round(recentAvg),
          growthRate: Math.round(growthRate),
          raw: data
        });
      } else {
        res.json({ recentAverage: 0, growthRate: 0, raw: data });
      }
    } catch (error: any) {
      if (error.message?.includes("Unexpected token") || error.message?.includes("is not valid JSON")) {
        console.warn(`Trends API Rate Limited for: ${keyword}`);
      } else {
        console.error("Trends API Error:", error);
      }
      // Fallback to 0 instead of 500 error to keep the app running
      res.json({ recentAverage: 0, growthRate: 0, raw: null });
    }
  });

  app.get("/api/related-queries", async (req, res) => {
    const { keyword } = req.query;
    if (!keyword) return res.status(400).json({ error: "Keyword is required" });

    try {
      const results = await googleTrends.relatedQueries({
        keyword: keyword as string,
      });

      if (typeof results === 'string' && results.trim().startsWith('<')) {
        return res.json({ default: { rankedList: [] } });
      }

      const data = safeJsonParse(results);
      res.json(data || { default: { rankedList: [] } });
    } catch (error: any) {
      if (error.message?.includes("Unexpected token") || error.message?.includes("is not valid JSON")) {
        console.warn(`Related Queries API Rate Limited for: ${keyword}`);
      } else {
        console.error("Related Queries API Error:", error);
      }
      res.json({ default: { rankedList: [] } });
    }
  });

  app.get("/api/search-images", async (req, res) => {
    const { query, start = 1 } = req.query;
    const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
    const googleCx = process.env.GOOGLE_SEARCH_CX;
    const serperKey = process.env.SERPER_API_KEY;

    // Exclude Threads and YouTube
    const filteredQuery = `${query} -site:threads.net -site:youtube.com`;

    // 1. Try Google Search API first
    if (googleKey && googleCx) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(filteredQuery)}&searchType=image&start=${start}`
        );
        const data = await response.json();
        if (data.items) {
          return res.json({
            items: data.items.map((item: any) => ({
              url: item.link,
              title: item.title,
              source: item.displayLink
            }))
          });
        }
      } catch (error) {
        console.error("Google Search Error:", error);
      }
    }

    // 2. Try Serper.dev as the best alternative
    if (serperKey) {
      try {
        const response = await fetch("https://google.serper.dev/images", {
          method: "POST",
          headers: {
            "X-API-KEY": serperKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            q: filteredQuery, 
            gl: "kr", 
            hl: "ko",
            page: Math.ceil(Number(start) / 10) || 1
          }),
        });
        const data = await response.json();
        if (data.images) {
          return res.json({
            items: data.images.map((img: any) => ({
              url: img.imageUrl,
              title: img.title,
              source: img.source
            }))
          });
        }
      } catch (error) {
        console.error("Serper Search Error:", error);
      }
    }

    // 3. Fallback to placeholder images
    const placeholders = Array.from({ length: 4 }).map((_, i) => ({
      url: `https://picsum.photos/seed/${encodeURIComponent(query as string)}-${Number(start) + i}/800/600`,
      title: `Placeholder for ${query}`,
      source: "Picsum Photos"
    }));
    res.json({ items: placeholders });
  });

  app.post("/api/youtube-upload", async (req, res) => {
    res.json({ success: true, videoId: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ" });
  });

  app.get("/api/get-existing-topics", async (req, res) => {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!email || !key || !sheetId) {
      return res.status(400).json({ error: "Google Sheets credentials are not configured" });
    }

    try {
      const formattedKey = key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: email,
          private_key: formattedKey,
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });

      const sheets = google.sheets({ version: "v4", auth });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "'시트1'!A2:L", // Fetch all columns (A to L)
      });

      const rows = response.data.values || [];
      // Reverse to show newest first
      const topics = rows.reverse().map(row => ({
        인물_한글: row[1] || "",
        인물: row[2] || "",
        분야: row[3] || "",
        감성: row[4] || "",
        일화: row[5] || "",
        가치: row[6] || "",
        영상앵글: row[7] || "",
        인물지수: parseInt(row[8]) || 0,
        연관키워드: row[9] || "",
        연관키워드지수: parseInt(row[10]) || 0,
        검색키워드: row[11] || "",
        상태: '대기',
        급상승: (parseInt(row[8]) > 50 || parseInt(row[10]) > 100) ? '🔥' : ''
      }));

      res.json({ topics, anecdotes: topics.map(t => t.일화) });
    } catch (error: any) {
      console.error("Get Existing Topics Error:", error.message || error);
      res.status(500).json({ error: "Failed to fetch existing topics", details: error.message });
    }
  });

  app.post("/api/save-topics", async (req, res) => {
    const { topics: newTopics } = req.body;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!email || !key || !sheetId) {
      return res.status(400).json({ error: "Google Sheets credentials are not configured" });
    }

    try {
      const formattedKey = key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: email, private_key: formattedKey },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      // 1. Get all existing data from '시트1'
      const existingDataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "'시트1'!A:L",
      });
      const rows = existingDataResponse.data.values || [];
      const headers = ["번호", "인물_한글", "인물(영문)", "분야", "감성", "일화", "가치", "영상앵글", "인물지수", "연관키워드", "연관키워드지수", "검색키워드"];
      const existingRows = rows.length > 0 ? rows.slice(1) : [];

      // 2. Prepare new rows using values already calculated in the frontend
      const startIdx = existingRows.length + 1;
      const newRows = newTopics.map((t: any, i: number) => {
        return [
          startIdx + i,
          t.인물_한글,
          t.인물,
          t.분야,
          t.감성,
          t.일화,
          t.가치 || "",
          t.영상앵글 || "",
          t.인물지수 || 0,
          t.연관키워드 || "",
          t.연관키워드지수 || 0,
          t.검색키워드 || ""
        ];
      });

      // 3. Overwrite entire sheet (Headers + Existing + New)
      // This keeps the numbering sequential and ensures all data is saved
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: "'시트1'!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers, ...existingRows, ...newRows],
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Save Topics Relative Error:", error.message || error);
      res.status(500).json({ error: "Failed to update relative indices and save topics", details: error.message });
    }
  });

  app.post("/api/delete-topic", async (req, res) => {
    const { anecdote } = req.body;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!email || !key || !sheetId) {
      return res.status(400).json({ error: "Google Sheets credentials are not configured" });
    }

    try {
      const formattedKey = key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: email, private_key: formattedKey },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      // 1. Get all existing data
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "'시트1'!A:L",
      });

      const rows = response.data.values || [];
      const headers = ["번호", "인물_한글", "인물(영문)", "분야", "감성", "일화", "가치", "영상앵글", "인물지수", "연관키워드", "연관키워드지수", "검색키워드"];
      if (rows.length <= 1 && rows.length > 0) return res.json({ success: true });
      const dataRows = rows.length > 0 ? rows.slice(1) : [];

      // 2. Filter out the row with the matching anecdote (index 5)
      const filteredRows = dataRows.filter(row => row[5] !== anecdote);

      // 3. Re-index the rows (Column A)
      const reindexedRows = filteredRows.map((row, idx) => {
        const newRow = [...row];
        newRow[0] = idx + 1;
        return newRow;
      });

      // 4. Clear the sheet first to avoid leftover data if the new list is shorter
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: "'시트1'!A:L",
      });

      // 5. Write back the headers and filtered rows
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: "'시트1'!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers, ...reindexedRows],
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete Topic Error:", error.message || error);
      res.status(500).json({ error: "Failed to delete topic from sheet", details: error.message });
    }
  });

  app.post("/api/save-script-new-sheet", async (req, res) => {
    const { topic, script, title } = req.body;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SHEET_ID;

    if (!email || !key || !sheetId) {
      return res.status(400).json({ error: "Google Sheets credentials are not configured" });
    }

    try {
      const formattedKey = key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: email,
          private_key: formattedKey,
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      // 1. Create a new sheet
      const sheetName = `${topic.인물_한글}_${new Date().getTime()}`;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: sheetName }
            }
          }]
        }
      });

      // 2. Add headers and script data
      const rows = [
        ["영상 제목", title || ""],
        [],
        ["컷", "자막"],
        ...script.map((s: any) => [s.컷, s.자막])
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: rows,
        },
      });

      res.json({ success: true, sheetName });
    } catch (error: any) {
      console.error("Save Script Error:", error.message || error);
      res.status(500).json({ 
        error: "Failed to create new sheet and save script",
        details: error.message,
        code: error.code
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
