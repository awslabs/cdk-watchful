import { Construct, CfnOutput } from '@aws-cdk/core';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as sns from '@aws-cdk/aws-sns';
import * as sns_subscriptions from '@aws-cdk/aws-sns-subscriptions';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cloudwatch_actions from '@aws-cdk/aws-cloudwatch-actions';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as sqs from '@aws-cdk/aws-sqs';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as rds from '@aws-cdk/aws-rds';
import { WatchDynamoTableOptions, WatchDynamoTable } from './dynamodb';
import { IWatchful, SectionOptions } from './api';
import { WatchLambdaFunctionOptions, WatchLambdaFunction } from './lambda';
import { WatchfulAspect, WatchfulAspectProps } from './aspect';
import { WatchApiGatewayOptions, WatchApiGateway } from './api-gateway';
import { WatchRdsAuroraOptions, WatchRdsAurora } from './rds-aurora';

export interface WatchfulProps {
  readonly alarmEmail?: string;
  readonly alarmSqs?: sqs.IQueue;
  readonly alarmSns?: sns.ITopic;
}

export class Watchful extends Construct implements IWatchful {
  private readonly dash: cloudwatch.Dashboard;
  private readonly alarmTopic?: sns.ITopic;

  constructor(scope: Construct, id: string, props: WatchfulProps = { }) {
    super(scope, id);

    if ((props.alarmEmail || props.alarmSqs) && !props.alarmSns) {
      this.alarmTopic = new sns.Topic(this, 'AlarmTopic', { displayName: 'Watchful Alarms' });
    }

    if (props.alarmSns) {
      this.alarmTopic = props.alarmSns;
    }

    if (props.alarmEmail && this.alarmTopic) {
      this.alarmTopic.addSubscription(
        new sns_subscriptions.EmailSubscription(props.alarmEmail),
      );
    }

    if (props.alarmSqs && this.alarmTopic) {
      this.alarmTopic.addSubscription(
        new sns_subscriptions.SqsSubscription(
          // sqs.Queue.fromQueueArn(this, 'AlarmQueue', props.alarmSqs)
          props.alarmSqs,
        ),
      );
    }

    this.dash = new cloudwatch.Dashboard(this, 'Dashboard');

    new CfnOutput(this, 'WatchfulDashboard', {
      value: linkForDashboard(this.dash),
    });
  }

  public addWidgets(...widgets: cloudwatch.IWidget[]) {
    this.dash.addWidgets(...widgets);
  }

  public addAlarm(alarm: cloudwatch.Alarm) {
    if (this.alarmTopic) {
      alarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
    }
  }

  public addSection(title: string, options: SectionOptions = {}){
    const markdown = [
      `# ${title}`,
      (options.links || []).map(link => `[button:${link.title}](${link.url})`).join(' | '),
    ];

    this.addWidgets(new cloudwatch.TextWidget({ width: 24, markdown: markdown.join('\n') }));
  }

  public watchScope(scope: Construct, options?: WatchfulAspectProps) {
    const aspect = new WatchfulAspect(this, options);
    scope.node.applyAspect(aspect);
  }

  public watchDynamoTable(title: string, table: dynamodb.Table, options: WatchDynamoTableOptions = {}) {
    return new WatchDynamoTable(this, table.node.uniqueId, {
      title,
      watchful: this,
      table,
      ...options,
    });
  }

  public watchApiGateway(title: string, restApi: apigw.RestApi, options: WatchApiGatewayOptions = {}) {
    return new WatchApiGateway(this, restApi.node.uniqueId, {
      title, watchful: this, restApi, ...options,
    });
  }

  public watchLambdaFunction(title: string, fn: lambda.Function, options: WatchLambdaFunctionOptions = {}) {
    return new WatchLambdaFunction(this, fn.node.uniqueId, {
      title, watchful: this, fn, ...options,
    });
  }

  public watchRdsAuroraCluster(title: string, cluster: rds.DatabaseCluster, options: WatchRdsAuroraOptions = {}) {
    return new WatchRdsAurora(this, cluster.node.uniqueId, {
      title, watchful: this, cluster, ...options,
    });
  }
}

function linkForDashboard(dashboard: cloudwatch.Dashboard) {
  const cfnDashboard = dashboard.node.defaultChild as cloudwatch.CfnDashboard;
  return `https://console.aws.amazon.com/cloudwatch/home?region=${dashboard.stack.region}#dashboards:name=${cfnDashboard.ref}`;
}
