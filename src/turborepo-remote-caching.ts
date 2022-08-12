import { randomBytes } from 'crypto';
import { resolve } from 'path';
import {
  aws_s3,
  Duration,
  RemovalPolicy,
  aws_cloudfront,
  aws_cloudfront_origins,
  aws_iam,
  Stack,
} from 'aws-cdk-lib';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import {
  SSM_PARAMETER_NAMESPACE,
  TokenConfig,
  TokenStorage,
  TOKEN_CONFIG_NAME,
} from './constants';

export interface TurborepoRemoteCachingProps {
  /**
   *  How may days till cached items expire in S3 Bucket
   *  Default: 7
   */
  readonly s3ExpirationDays?: number;
  /**
   *  How many seconds should CloudFront cache objects?
   *  Default: 600
   */
  readonly cfnCacheSeconds?: number;
  /**
   *  What method of storage should be used to store the token?
   *  Default: TokenStorage.PARAMETER_STORE
   */
  readonly tokenStorage?: TokenStorage;
  /**
   *  What should the token value be?
   *  Default: Generated - Random 32 char string
   */
  readonly tokenValue?: string;
}

export class TurborepoRemoteCaching extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props?: TurborepoRemoteCachingProps,
  ) {
    super(scope, id);

    /***************************************************************************
     *
     *  EXPAND PROPS / SET DEFAULTS
     *
     **************************************************************************/

    const { account, region } = Stack.of(this);

    const {
      s3ExpirationDays,
      cfnCacheSeconds,
      tokenStorage,
      tokenValue,
    } = {
      s3ExpirationDays: 7,
      cfnCacheSeconds: 600,
      tokenStorage: TokenStorage.PARAMETER_STORE,
      tokenValue: TokenStorage.PARAMETER_STORE ? randomBytes(32).toString('hex') : '',
      ...props,
    };

    /***************************************************************************
     *
     *  CACHE BUCKET
     *
     *  This is the bucket we'll use to store the cached assets.
     *  It should block all public access and only be accesible through the
     *  CloudFront configured below.
     *
     **************************************************************************/

    const storageBucket = new aws_s3.Bucket(this, 'cache-bucket', {
      publicReadAccess: false,
      blockPublicAccess: aws_s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      // objectOwnership: aws_s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(1),
          expiration: Duration.days(s3ExpirationDays),
        },
      ],
    });

    /***************************************************************************
     *
     *  AUTHORIZER
     *
     *  This function will validate the token against the stored value.
     *
     **************************************************************************/

    const authorizer = new NodejsFunction(this, 'Authorizer', {
      memorySize: 128,
      runtime: Runtime.NODEJS_16_X,
      entry: resolve(__dirname, 'edge.ts'),
      logRetention: RetentionDays.ONE_MONTH,
      /**
       * See: https://github.com/aws/aws-cdk/issues/5334
       */
      description: process.env.JEST_WORKER_ID
        ? 'Lambda@Edge handler, generated on DATE'
        : `Lambda@Edge handler, generated on ${new Date().toISOString()}`,
    });

    /***************************************************************************
     *
     *  SECRETS MANAGER
     *
     *  Not yet supported.
     *
     **************************************************************************/

    if (tokenStorage === TokenStorage.SECRETS_MANAGER) {
      throw new Error(
        'Secret manager storage not yet supported. Use Parameter Store instead.',
      );
    }

    /***************************************************************************
     *
     *  CLOUDFRONT
     *
     *  We'll use this CloudFront configuration to protect the Cache Bucket
     *
     **************************************************************************/

    const originAccessIdentity = new aws_cloudfront.OriginAccessIdentity(
      this,
      'OAI',
    );

    storageBucket.addToResourcePolicy(
      new aws_iam.PolicyStatement({
        resources: [storageBucket.arnForObjects('*')],
        actions: ['s3:PutObject'],
        principals: [originAccessIdentity.grantPrincipal],
      }),
    );

    const distribution = new aws_cloudfront.Distribution(this, 'distribution', {
      comment: 'Distribution for TurboRepo Cache',
      defaultBehavior: {
        allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_ALL,
        origin: new aws_cloudfront_origins.S3Origin(storageBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy:
          aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new aws_cloudfront.CachePolicy(this, 'policy', {
          maxTtl: Duration.seconds(cfnCacheSeconds),
          minTtl: Duration.seconds(cfnCacheSeconds),
          defaultTtl: Duration.seconds(cfnCacheSeconds),
          headerBehavior: aws_cloudfront.CacheHeaderBehavior.none(),
          queryStringBehavior: aws_cloudfront.CacheQueryStringBehavior.none(),
          cookieBehavior: aws_cloudfront.CacheCookieBehavior.none(),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
        edgeLambdas: [
          {
            functionVersion: authorizer.currentVersion,
            eventType: aws_cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          },
        ],
      },
    });

    /***************************************************************************
     *
     *  TOKEN CONFIG
     *
     *  Store the configuration for how the token is being stored, so that the
     *  lambda (and CI tooling) can discover it later.
     *
     *  If TokenStorage is set to Parameter Store then the token is stored here
     *  too.
     *
     **************************************************************************/

    const parameterName = `${SSM_PARAMETER_NAMESPACE}/${TOKEN_CONFIG_NAME}`;

    const tokenConfig: TokenConfig = {
      tokenStorage,
      remoteApiEndpoint: `https://${distribution.distributionDomainName}`,
      //remoteApiEndpoint: '',
      tokenValue,
    };

    const tokenConfigParam = new StringParameter(this, 'TokenConfig', {
      description:
        'GENERATED VALUE DO NOT CHANGE - Configuration for TurboRepo Support',
      parameterName,
      stringValue: JSON.stringify(tokenConfig),
    });

    authorizer.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: [
          'ssm:GetParametersByPath',
          'ssm:GetParameters',
          'ssm:GetParameter',
        ],
        // resources: [tokenConfigParam.parameterArn], <-- don't use this style, it creates a circular dependancy.
        resources: [`arn:aws:ssm:${region}:${account}:parameter${parameterName}`],
      }),
    );

  }
}
