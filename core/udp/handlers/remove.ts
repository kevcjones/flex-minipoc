import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;

export const handler = async (event: { pathParameters?: { key?: string } }) => {
  const key = decodeURIComponent(event.pathParameters?.key ?? "");

  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { id: key } }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, key }),
  };
};
