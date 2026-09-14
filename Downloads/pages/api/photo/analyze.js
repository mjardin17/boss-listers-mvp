import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Missing imageBase64 or mimeType' });
    }

    // Analyze image with Claude Vision
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Analyze this product photo and extract:
1. Product title (concise, under 100 chars)
2. Product category
3. Estimated condition (new/like-new/good/fair/poor)
4. Key features (3-5 bullet points)
5. Suggested price range
6. Recommended platforms (eBay, Etsy, Facebook Marketplace, etc.)

Format as JSON:
{
  "title": "string",
  "category": "string",
  "condition": "string",
  "features": ["feature1", "feature2"],
  "priceRange": {"min": number, "max": number},
  "platforms": ["platform1", "platform2"],
  "description": "2-3 sentence product description"
}`,
            },
          ],
        },
      ],
    });

    // Parse the response
    let analysisText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from the response (it might be wrapped in markdown)
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse analysis' });
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Store analysis in Supabase
    const { data: stored, error: storeError } = await supabase
      .from('photo_analysis')
      .insert({
        image_data: imageBase64.substring(0, 100), // Store just a small part for reference
        analysis_result: analysis,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (storeError) {
      console.error('Supabase error:', storeError);
    }

    return res.status(200).json({
      success: true,
      analysis,
      id: stored?.id,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
}
