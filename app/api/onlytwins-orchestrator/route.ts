import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, metadata } = await req.json();

    const apiKey = process.env.MINDSTUDIO_API_KEY;
    const workerId = process.env.MINDSTUDIO_WORKER_ID;

    if (!apiKey || !workerId) {
      return NextResponse.json({ error: 'Env variables missing' }, { status: 500 });
    }

    // Attempting the direct V1 Execution endpoint
    const response = await fetch(`https://api.mindstudio.ai/v1/workers/${workerId}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        variables: {
          userPrompt: prompt,
          context: metadata || {},
          supabaseProjectId: 'labqtctlgntdgkawjuul'
        },
      }),
    });

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('text/html')) {
      const htmlBody = await response.text();
      return NextResponse.json({ 
        error: 'MindStudio returned HTML instead of JSON', 
        status: response.status,
        check: 'Is the Agent published and is the Worker ID correct?',
        snippet: htmlBody.substring(0, 100)
      }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    return NextResponse.json({ error: 'Request Failed', message: error.message }, { status: 500 });
  }
}
