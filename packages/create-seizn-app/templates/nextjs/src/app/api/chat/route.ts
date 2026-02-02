import { NextRequest, NextResponse } from 'next/server';
import { seizn } from '@/lib/seizn';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Example: Use Seizn for RAG-enhanced responses
    const response = await seizn.chat({
      messages: [{ role: 'user', content: message }],
    });

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
