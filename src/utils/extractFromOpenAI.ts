import fs from 'fs';

interface Item {
  item: string;
  category: string;
  color: string;
  material: string;
  fit: string;
  style_notes: string;
}

interface StylingObservations {
  layering: string;
  accessorizing: string;
  proportions: string;
  texture_play: string;
  grooming: string;
}

interface Analysis {
  core_style: string;
  subaesthetics: string[];
  items_detected: Item[];
  style_details: string;
  styling_observations: StylingObservations;
  styling_recommendations: string[];
}

interface FashionAnalysis {
  analysis: Analysis;
}

interface OpenAIError {
  error: string;
  fullResponse?: unknown;
  raw?: string;
}

export async function extractFashionJSONFromOpenAI(imagePath: string): Promise<FashionAnalysis | OpenAIError> {
  const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });

  const prompt = `
You are a fashion analyst. Based on the clothing in the image provided, return a detailed JSON breakdown of the outfit.

Follow this exact schema:
{
  "analysis": {
    "core_style": string,
    "subaesthetics": [string],
    "items_detected": [
      {
        "item": string,
        "category": string,
        "color": string,
        "material": string,
        "fit": string,
        "style_notes": string
      }
    ],
    "style_details": string,
    "styling_observations": {
      "layering": string,
      "accessorizing": string,
      "proportions": string,
      "texture_play": string,
      "grooming": string
    },
    "styling_recommendations": [string]
  }
}

Return only the JSON. Do not include any explanation or preamble. Only return valid JSON.
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageData}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
    })
  });

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) {
    return { error: 'OpenAI returned no content', fullResponse: data };
  }

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as FashionAnalysis;
  } catch {
    console.warn('❗ OpenAI returned invalid JSON:', raw);
    return { error: 'Failed to parse JSON', raw };
  }
}
