import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME as string;

export const handler = async (event: { pathParameters?: { key?: string } }) => {
  const key = decodeURIComponent(event.pathParameters?.key ?? "");

  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { id: key } }),
  );

  if (!res.Item) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "not found", key }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(res.Item.value),
  };
};
