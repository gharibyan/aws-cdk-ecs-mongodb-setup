const cdk = require('aws-cdk-lib')
const { Vpc, Port, Peer } = require('aws-cdk-lib/aws-ec2')
const { Cluster, ContainerImage, AwsLogDriver, FargatePlatformVersion } = require('aws-cdk-lib/aws-ecs')
const { NetworkLoadBalancedFargateService } = require('aws-cdk-lib/aws-ecs-patterns')
const { LogGroup, RetentionDays } = require('aws-cdk-lib/aws-logs')
const { HostedZone } = require('aws-cdk-lib/aws-route53')
const { FileSystem, LifecyclePolicy, PerformanceMode, ThroughputMode } = require('aws-cdk-lib/aws-efs')

const hostedZoneId = process.env.HOSTED_ZONE_ID
const domain = process.env.DOMAIN
const cpu = process.env.CPU || 1024
const memoryLimitMiB = process.env.MEMORY_LIMIT || 2048

class ECSMongoDbSetup extends cdk.Stack {
  constructor (scope, id, props) {
    super(scope, id, props)

    const { applicationName } = props

    const vpc = new Vpc(this, `${applicationName}-VPC`)

    const cluster = new Cluster(this, `${applicationName}-EcsCluster`, {
      clusterName: applicationName,
      containerInsights: true,
      vpc: vpc
    })

    // Assign domain to ecs for instance mongodb.example.com
    // You need setup hosted zone on Route 53 and provide hosted zone id
    if (hostedZoneId && domain) {
      this.hostedZone = HostedZone.fromHostedZoneAttributes(this, `${applicationName}-HostedZone`, {
        hostedZoneId: hostedZoneId,
        zoneName: domain
      })
      this.domain = domain
    }

    // Create a public ALB Fargate Service, with a task definition, which
    // we'll change in later steps.
    const fargateService = new NetworkLoadBalancedFargateService(this, `${applicationName}-FargateService`, {
      serviceName: applicationName,
      cluster,
      // need platform version 1.4.0 to mount EFS volumes
      platformVersion: FargatePlatformVersion.VERSION1_4,
      publicLoadBalancer: true,
      domainName: this.domain,
      domainZone: this.hostedZone,
      minHealthyPercent: 0,
      desiredCount: 1,
      assignPublicIp: true,
      listenerPort: 27017,
      cpu,
      memoryLimitMiB,
      taskImageOptions: {
        image: ContainerImage.fromRegistry('public.ecr.aws/docker/library/mongo'),
        family: id,
        containerName: applicationName,
        containerPort: 27017,
        logDriver: new AwsLogDriver({
          streamPrefix: 'ecs',
          logGroup: new LogGroup(this, `${applicationName}-LogGroup`, {
            logGroupName: applicationName,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: RetentionDays.TWO_MONTHS
          })
        })
      }
    })

    // Create the file system
    const fileSystem = new FileSystem(this, `${applicationName}-AppEFS`, {
      vpc,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      throughputMode: ThroughputMode.BURSTING
    })

    const volumeConfig = {
      name: 'mongodb-volume',
      // this is the main config
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId
      }
    }

    const mountPoints = [
      {
        containerPath: '/data/db',
        sourceVolume: volumeConfig.name,
        readOnly: false
      }
    ]

    fargateService.service.taskDefinition.addVolume(volumeConfig)
    fargateService.service.taskDefinition.defaultContainer.addMountPoints(mountPoints[0])

    fargateService.service.connections.allowFrom(
      Peer.anyIpv4(),
      Port.tcp(27017),
      'Allow connect to mongo'
    )

    // Need to add permissions to have access to efs
    fargateService.service.connections.allowFrom(fileSystem, Port.tcp(2049))
    fargateService.service.connections.allowTo(fileSystem, Port.tcp(2049))
  }
}

const app = new cdk.App()
const applicationName = app.node.tryGetContext('applicationName')

// eslint-disable-next-line no-new
new ECSMongoDbSetup(app, 'MongoDb', {
  applicationName: applicationName || 'mongoDb',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  }
})

app.synth()
