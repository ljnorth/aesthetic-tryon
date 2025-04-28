import fs from 'fs';

interface ImagePath {
  filepath: string;
}

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

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
        };
      }>;
    };
  }>;
}

export async function generateImageWithGemini(
  userImagePathInput: string | ImagePath,
  lookImagePathInput: string | ImagePath,
  outfitJson: FashionAnalysis
): Promise<string | null> {
  const userImagePath = typeof userImagePathInput === 'string' ? userImagePathInput : userImagePathInput.filepath;
  const lookImagePath = typeof lookImagePathInput === 'string' ? lookImagePathInput : lookImagePathInput.filepath;

  const userImageData = fs.readFileSync(userImagePath, { encoding: 'base64' });
  const lookImageData = fs.readFileSync(lookImagePath, { encoding: 'base64' });

  const prompt = `
You are generating a **photorealistic, editorial-quality image** of a person wearing a styled outfit.

🔹 Use the **first image** as the person's reference — face, body type, skin tone, posture.
🔹 Use the **second image** as the outfit, pose, and lighting reference. Recreate the outfit **1:1**, matching the clothing, silhouette, and pose **exactly**.

🧠 Additional outfit metadata to guide realism:
- **Outfit breakdown**:
${JSON.stringify(outfitJson.analysis.items_detected, null, 2)}

- **Style details**: ${outfitJson.analysis.style_details}

- **Styling cues**:
${Object.values(outfitJson.analysis.styling_observations).map(obs => `• ${obs}`).join('\n')}

🖼️ Your image output should look like a **fashion lookbook photo**:
- Full-body, posed as in the second image
- Soft studio lighting with clean shadows
- Plain, neutral backdrop (beige, grey, or off-white)
- Editorial-quality realism and proportion

🎯 Do not recreate the background from the second image — override it with a clean studio lookbook background. Return only the final rendered image.
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: userImageData,
                },
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: lookImageData,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['Text', 'Image'],
        },
      }),
    }
  );

  const data = await response.json() as GeminiResponse;
  console.log('🪄 Gemini 2.0 image response:', JSON.stringify(data, null, 2));

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData?.data);

  if (imagePart?.inlineData?.data) {
    return `data:image/jpeg;base64,${imagePart.inlineData.data}`;
  }

  return null;
}