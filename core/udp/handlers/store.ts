import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;

export const handler = async (event: {
  pathParameters?: { key?: string };
  body?: string | null;
}) => {
  const key = decodeURIComponent(event.pathParameters?.key ?? "");
  const value = event.body ? JSON.parse(event.body) : null;

  await ddb.send(new PutCommand({ TableName: TABLE, Item: { id: key, value } }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, key }),
  };
};
