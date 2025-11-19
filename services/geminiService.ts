import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

export async function generateGameCommentary(context: 'start' | 'game_over' | 'level_clear', score?: number): Promise<string> {
  const getFallback = () => {
      if (context === 'start') return "Systems Online. Prepare for Asteroid Field.";
      if (context === 'game_over') return "Critical Failure. Systems Offline.";
      return "Sector Cleared. Jumping to next sector.";
  };

  if (!ai) {
    return getFallback();
  }

  let prompt = "";
  if (context === 'start') {
    prompt = "You are a spaceship AI. Give a short, 1-sentence, cool, sci-fi status update preparing the pilot for an asteroid field.";
  } else if (context === 'game_over') {
    prompt = `You are a sarcastic spaceship AI. The ship was just destroyed. Score was ${score}. Give a 1-sentence snarky comment about the pilot's flying skills.`;
  } else {
    prompt = "You are a spaceship AI. The sector is cleared. Give a 1-sentence encouraging remark about jumping to hyperspace.";
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
         maxOutputTokens: 60,
      }
    });
    return response.text || getFallback();
  } catch (error) {
    console.error("Gemini API Error:", error);
    return getFallback();
  }
}