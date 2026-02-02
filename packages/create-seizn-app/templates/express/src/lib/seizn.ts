import { Seizn } from '@seizn/core';

export const seizn = new Seizn({
  apiKey: process.env.SEIZN_API_KEY!,
  projectId: process.env.SEIZN_PROJECT_ID,
});
