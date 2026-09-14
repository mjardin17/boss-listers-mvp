import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, description, features, priceRange } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Missing title or description' });
    }

    // Generate commercial script
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Create a short, engaging commercial script (30 seconds) for this product:

Title: ${title}
Description: ${description}
Features: ${features?.join(', ') || 'N/A'}
Price: $${priceRange?.min || 0} - $${priceRange?.max || 100}

Format the response as JSON:
{
  "voiceover": "script text for voiceover",
  "scenes": [
    {"time": "0-5s", "visual": "description"},
    {"time": "5-10s", "visual": "description"}
  ],
  "hashtags": ["tag1", "tag2"],
  "callToAction": "text"
}`,
        },
      ],
    });

    // Parse the response
    let scriptText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from the response
    const jsonMatch = scriptText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse commercial script' });
    }

    const commercial = JSON.parse(jsonMatch[0]);

    return res.status(200).json({
      success: true,
      commercial,
    });
  } catch (error) {
    console.error('Commercial generation error:', error);
    return res.status(500).json({ error: error.message });
  }
}
