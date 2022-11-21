# Install MongoDB on Amazon ECS Fargate

This is CDK script that will deploy MongoDb on Amazon ECS Fargate and mount with EFS 

### Commands for setup
1. Setup AWS account more details (https://docs.aws.amazon.com/polly/latest/dg/getting-started.html)
2. Setup aws-cdk `npm i -g aws-cdk` (https://github.com/aws/aws-cdk)
3. Run `npm i` or `npm ci`
4. if cdk is not bootstrapped run `cdk bootstrap`
5. Run `cdk deploy -c applicationName=MongoDb`
