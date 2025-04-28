import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { NextApiRequest, NextApiResponse } from 'next';

const client = new DynamoDBClient({ region: 'us-east-1' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const command = new ScanCommand({
      TableName: 'SocialMediaScraping-prod',
      Limit: 20,
    });

    const data = await client.send(command);
    console.log('✅ Dynamo raw response:', JSON.stringify(data, null, 2));

    const items = (data.Items || [])
      .map((item) => unmarshall(item))
      .filter((item) => item.mediaUrl);

    res.status(200).json(items);
  } catch (error) {
    console.error('❌ Error fetching from Dynamo:', error);
    res.status(500).json({ error: 'Failed to load content' });
  }
}
