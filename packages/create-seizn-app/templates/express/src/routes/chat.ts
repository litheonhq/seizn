import { Router, Request, Response } from 'express';
import { seizn } from '../lib/seizn';

export const chatRouter = Router();

/**
 * POST /api/chat
 * Send a message and get a RAG-enhanced response
 */
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, context } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Use Seizn for RAG-enhanced responses
    const response = await seizn.chat({
      messages: [{ role: 'user', content: message }],
      context,
    });

    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/**
 * POST /api/chat/search
 * Search through stored memories/documents
 */
chatRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const results = await seizn.search({
      query,
      limit,
    });

    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

/**
 * POST /api/chat/memory
 * Store a new memory/document
 */
chatRouter.post('/memory', async (req: Request, res: Response) => {
  try {
    const { content, metadata } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const memory = await seizn.createMemory({
      content,
      metadata,
    });

    res.json({ memory });
  } catch (error) {
    console.error('Memory error:', error);
    res.status(500).json({ error: 'Failed to create memory' });
  }
});
