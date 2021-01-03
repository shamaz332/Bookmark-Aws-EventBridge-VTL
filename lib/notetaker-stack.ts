import * as cdk from "@aws-cdk/core";
import * as appsync from "@aws-cdk/aws-appsync";
import * as ddb from "@aws-cdk/aws-dynamodb";
import * as lambda from "@aws-cdk/aws-lambda";
import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import {
  EVENT_SOURCE,
  requestTemplate,
  responseTemplate,
} from "../functions/template";
export class NotetakerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //-----API-----
    const api = new appsync.GraphqlApi(this, "BookmarkApp", {
      name: "BookmarkApp",
      schema: appsync.Schema.fromAsset("graphql/scheme.gql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
      },
      logConfig: { fieldLogLevel: appsync.FieldLogLevel.ALL },
      xrayEnabled: true,
    });
    // -----Table-----

    const bookmarkAppTable = new ddb.Table(this, "CDKBookmarkApp", {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "id",
        type: ddb.AttributeType.STRING,
      },
    });

    // -----set the dynamodb as a data source for the AppSync API-----
    const bookmarkDs = api.addDynamoDbDataSource(
      "BookmarkDS",
      bookmarkAppTable
    );
    // HTTP as Datasource for the Graphql API
    const httpEventTriggerDS = api.addHttpDataSource(
      "BookmarkappHttpDS",
      "https://events." + this.region + ".amazonaws.com/", // This is the ENDPOINT for eventbridge.
      {
        name: "bookmarkHttpForEvents",
        description: "From Appsync to Eventbridge",
        authorizationConfig: {
          signingRegion: this.region,
          signingServiceName: "events",
        },
      }
    );
    events.EventBus.grantPutEvents(httpEventTriggerDS);
    ///////////////  APPSYNC  Resolvers   ///////////////
    /* Query */
    bookmarkDs.createResolver({
      typeName: "Query",
      fieldName: "listBookmark",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });
    /* Mutation */
    const mutations = ["createBookmark", "deleteBookmark"];

    mutations.forEach((mutation) => {
      let details = `\\\"id\\\": \\\"$ctx.args.id\\\"`;
      
      if (mutation === "createBookmark") {
        details = `\\\"id\\\": \\\"$ctx.args.task.id\\\", \\\"name\\\": \\\"$ctx.args.task.name\\\" , \\\"description\\\": \\\"$ctx.args.task.description\\\", \\\"url\\\": \\\"$ctx.args.task.url\\\"`;
      } else if (mutation === "deleteBookmark") {
        details = `\\\"id\\\": \\\"$ctx.args.taskId\\\"`;
      }

      httpEventTriggerDS.createResolver({
        typeName: "Mutation",
        fieldName: mutation,
        requestMappingTemplate: appsync.MappingTemplate.fromString(
          requestTemplate(details, mutation)
        ),
        responseMappingTemplate: appsync.MappingTemplate.fromString(
          responseTemplate()
        ),
      });
    });
    //-----Lambda Creation-----

    const bookmarkAppLambda = new lambda.Function(this, "bookmarkAPplambda", {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "todoFunc.handler",
      code: lambda.Code.fromAsset("functions"),
    });

    ////////// Creating rule to invoke step function on event ///////////////////////
    const eventConsumerRules = new events.Rule(this, "eventConsumerRule", {
      eventPattern: {
        source: [EVENT_SOURCE],
        detailType: [...mutations],
      },
      targets: [new targets.LambdaFunction(bookmarkAppLambda)],
    });

    // -----print out the AppSync GraphQL endpoint to the terminal-----
    new cdk.CfnOutput(this, "GraphQLAPIURL", {
      value: api.graphqlUrl,
    });

    // -----print out the AppSync API Key to the terminal-----
    new cdk.CfnOutput(this, "GraphQLAPIKey", {
      value: api.apiKey || "",
    });

    // -----print out the stack region-----
    new cdk.CfnOutput(this, "Stack Region", {
      value: this.region,
    });

    // enable the Lambda function to access the DynamoDB table (using IAM)
    bookmarkAppTable.grantFullAccess(bookmarkAppLambda);

    // Create an environment variable that we will use in the function code
    bookmarkAppLambda.addEnvironment(
      "BOOKMARK_TABLE",
      bookmarkAppTable.tableName
    );
  }
}
