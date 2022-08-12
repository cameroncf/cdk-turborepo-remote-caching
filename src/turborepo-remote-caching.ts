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
  REMOTE_API_ENDPOINT,
  SSM_PARAMETER_NAMESPACE,
  TokenConfig,
  TokenStorage,
  TOKEN_CONFIG_NAME,
  TOKEN_VALUE_NAME,
} from './constants';

export interface TurborepoRemoteCachingProps {
  /**
   *  How may days till cached items expire.
   *  Default: 7
   */
  readonly expirationDays?: number;
  /**
   *  How many seconds should CloudFront cache objects?
   *  Default: 600
   */
  readonly cfnCacheSeconds?: number;
  /**
   *  What method of storage should be used to store the token?
   *  Defaults to Parameter Store
   */
  readonly tokenStorage?: TokenStorage;
  /**
   *  If stored in secrets manager, how often should the key be rotated?
   *  Defaults to 1440 (one day)
   */
  readonly tokenRotationMinutes?: number;
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

    const { region } = Stack.of(this);

    const {
      expirationDays,
      cfnCacheSeconds,
      tokenStorage,
      tokenSecretRotationMinutes,
      tokenSecretName,
      tokenSecretRegion,
    } = {
      expirationDays: 7,
      cfnCacheSeconds: 600,
      tokenStorage: TokenStorage.PARAMETER_STORE,
      tokenSecretRotationMinutes: 1440,
      tokenSecretName: 'turborepo-token-secret',
      tokenSecretRegion: region,
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
          expiration: Duration.days(expirationDays),
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
      description: process.env.NODE_ENV === 'test'
        ? 'Lambda@Edge handler, generated on DATE'
        : `Lambda@Edge handler, generated on ${new Date().toISOString()} ${process.env.CI} ${process.env.RELEASE}`,
    });

    /***************************************************************************
     *
     *  TOKEN CONFIG
     *
     *  Store the configuration for how the token is being stored that the
     *  lambda can discover it later.
     *
     **************************************************************************/

    const tokenConfig: TokenConfig = {
      tokenStorage,
      tokenSecretRotationMinutes,
      tokenSecretName,
      tokenSecretRegion,
    };

    const tokenConfigParam = new StringParameter(this, 'TokenConfig', {
      description:
        'GENERATED VALUE DO NOT CHANGE - Configuration for TurboRepo Support',
      parameterName: `${SSM_PARAMETER_NAMESPACE}/${TOKEN_CONFIG_NAME}`,
      stringValue: JSON.stringify(tokenConfig),
    });
    authorizer.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: [
          'ssm:GetParametersByPath',
          'ssm:GetParameters',
          'ssm:GetParameter',
        ],
        resources: [tokenConfigParam.parameterArn],
      }),
    );

    /***************************************************************************
     *
     *  API TOKEN
     *
     *  This defines the token used by the TurboRepo CLI. It goes into param
     *  store or secrets manager, dependong on configuration.
     *
     **************************************************************************/

    if (tokenStorage === TokenStorage.PARAMETER_STORE) {
      const tokenValueParam = new StringParameter(this, 'TokenValue', {
        description:
          'GENERATED VALUE DO NOT CHANGE - Token Value for TurboRepo Support',
        parameterName: `${SSM_PARAMETER_NAMESPACE}/${TOKEN_VALUE_NAME}`,
        stringValue: randomBytes(64).toString('hex'),
      });
      authorizer.addToRolePolicy(
        new aws_iam.PolicyStatement({
          actions: [
            'ssm:GetParametersByPath',
            'ssm:GetParameters',
            'ssm:GetParameter',
          ],
          resources: [tokenValueParam.parameterArn],
        }),
      );
    }

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

    new StringParameter(this, 'apiEndpoint', {
      description:
        'GENERATED VALUE DO NOT CHANGE - API Endpoint Value for TurboRepo Support',
      parameterName: `${SSM_PARAMETER_NAMESPACE}/${REMOTE_API_ENDPOINT}`,
      stringValue: `https://${distribution.distributionDomainName}`,
    });
  }
}
