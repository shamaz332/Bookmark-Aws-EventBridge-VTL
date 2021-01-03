import { EventBridgeEvent, Context } from "aws-lambda";
const AWS = require("aws-sdk");
// import { randomBytes } from "crypto";
const dynamoClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.BOOKMARK_TABLE;

export const handler = async (
  event: EventBridgeEvent<string, any>,
  context: Context
) => {
  try {
    if (event["detail-type"] === "createBookmark") {
      const params = {
        TableName: TABLE_NAME,
        Item: { ...event.detail },
      };
      await dynamoClient.put(params).promise();
      return event.detail;
    } else if (event["detail-type"] === "deleteBookmark") {
      const params = {
        TableName: TABLE_NAME,
        Key: {
          id: event.detail.id,
        },
      };
      await dynamoClient.delete(params).promise();
      return event.detail.id;
    }
  } catch (error) {
    console.log("error", error);
    return null;
  }
};
