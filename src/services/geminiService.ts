import { GoogleGenAI } from "@google/genai";
import { PondStatus } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function getFeedingRecommendation(pond: PondStatus) {
  try {
    const prompt = `
      Anda adalah ahli budidaya ikan lele. Berikan rekomendasi pakan untuk kolam berikut:
      - Nama Kolam: ${pond.name}
      - Sistem: ${pond.type}
      - Jumlah Ikan: ${pond.fishCount} ekor
      - Umur Ikan: ${pond.fishAge} hari
      - Suhu Air: ${pond.temperature}°C
      
      Berikan saran mengenai:
      1. Frekuensi pemberian pakan per hari.
      2. Jumlah pakan total per hari (dalam gram/kg).
      3. Tips khusus untuk sistem ${pond.type} pada umur ikan ${pond.fishAge} hari.
      
      Format jawaban dalam JSON dengan struktur:
      {
        "frequency": number,
        "dailyAmount": number,
        "unit": "gram" | "kg",
        "tips": string[]
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error getting recommendation:", error);
    return null;
  }
}
