import { CloudFrontRequestEvent } from 'aws-lambda';
import { TokenConfig, TokenStorage } from './constants';

/* istanbul ignore next */
export const contextMock = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'foo',
  functionVersion: 'foo',
  invokedFunctionArn: 'foo',
  memoryLimitInMB: 'foo',
  awsRequestId: 'foo',
  logGroupName: 'foo',
  logStreamName: 'foo',
  getRemainingTimeInMillis: () => 0,
  done: () => 0,
  fail: () => 0,
  succeed: () => 0,
};


export const goodParamNameFixture = 'foo-command';

export const goodTokenFixture: TokenConfig = {
  remoteApiEndpoint: 'https://foo.bar/baz',
  tokenStorage: TokenStorage.PARAMETER_STORE,
  tokenValue: '1234567890qwerty',
};

export const badTokenFixture: TokenConfig = {
  remoteApiEndpoint: 'https://foo.bar/baz',
  tokenStorage: TokenStorage.PARAMETER_STORE,
  tokenValue: 'abcdefghijklmnopqrstuvwxyz',
};

export const viewerRequestFixtureNoAuth: CloudFrontRequestEvent = {
  Records: [
    {
      cf: {
        config: {
          distributionDomainName: 'foo.cloudfront.net',
          distributionId: 'EXAMPLE',
          eventType: 'viewer-request',
          requestId: 'foo',
        },
        request: {
          uri: '/test',
          querystring: 'foo',
          method: 'GET',
          clientIp: '2001:cdba::3257:9652',
          headers: {
            host: [
              {
                key: 'Host',
                value: 'foo.bar.baz',
              },
            ],
          },
        },
      },
    },
  ],
};

export const viewerRequestFixtureMisconfiguredAuth: CloudFrontRequestEvent = {
  Records: [
    {
      cf: {
        config: {
          distributionDomainName: 'foo.cloudfront.net',
          distributionId: 'EXAMPLE',
          eventType: 'viewer-request',
          requestId: 'foo',
        },
        request: {
          uri: '/test',
          querystring: 'foo',
          method: 'GET',
          clientIp: '2001:cdba::3257:9652',
          headers: {
            host: [
              {
                key: 'Host',
                value: 'foo.bar.baz',
              },
            ],
            authorization: [
              {
                key: 'Authorization',
                value: 'hello-there-world',
              },
            ],
          },
        },
      },
    },
  ],
};


export const viewerRequestFixtureWithBadAuth: CloudFrontRequestEvent = {
  Records: [
    {
      cf: {
        config: {
          distributionDomainName: 'foo.cloudfront.net',
          distributionId: 'EXAMPLE',
          eventType: 'viewer-request',
          requestId: 'foo',
        },
        request: {
          uri: '/test',
          querystring: 'foo',
          method: 'GET',
          clientIp: '2001:cdba::3257:9652',
          headers: {
            host: [
              {
                key: 'Host',
                value: 'hello-there-world',
              },
            ],
            authorization: [
              {
                key: 'Authorization',
                value: `Bearer ${badTokenFixture.tokenValue}`,
              },
            ],
          },
        },
      },
    },
  ],
};


export const viewerRequestFixtureWithGoodAuth: CloudFrontRequestEvent = {
  Records: [
    {
      cf: {
        config: {
          distributionDomainName: 'foo.cloudfront.net',
          distributionId: 'EXAMPLE',
          eventType: 'viewer-request',
          requestId: 'foo',
        },
        request: {
          uri: '/test',
          querystring: 'foo',
          method: 'GET',
          clientIp: '2001:cdba::3257:9652',
          headers: {
            host: [
              {
                key: 'Host',
                value: 'hello-there-world',
              },
            ],
            authorization: [
              {
                key: 'Authorization',
                value: `Bearer ${goodTokenFixture.tokenValue}`,
              },
            ],
          },
        },
      },
    },
  ],
};
